import type { EnvironmentState } from '../config';
import type { Experiment } from '../stations/BaseExperiment';

export type TimeMode = 'flow' | 'slow' | 'very-slow' | 'paused' | 'rewind';

export interface TimeStatus {
  mode: TimeMode;
  scale: number;
  sessionTime: number;
  maxSessionTime: number;
  rewinding: boolean;
  atStart: boolean;
}

interface SessionEvent {
  t: number;
  seq: number;
  kind: 'param' | 'primary' | 'restart' | 'observe' | 'arm' | 'disarm' | 'env';
  id?: string;
  value?: string | number | boolean;
  env?: EnvironmentState;
}

const FIXED_DT = 1 / 60;

function cloneEnv(env: EnvironmentState): EnvironmentState {
  return { ...env };
}

function envKey(env: EnvironmentState): string {
  return `${env.gravity.toFixed(4)}|${env.air}|${env.airDensity.toFixed(4)}|${env.friction}|${env.frictionCoefficient.toFixed(3)}`;
}

/**
 * Owns simulated time for the focused station.
 *
 * The rewind implementation is a deterministic replay: we remember the
 * parameters/environment at session start and every user action in order.
 * Rewinding resets the apparatus and rapidly re-simulates the recorded event
 * stream up to the requested time. Because stations are stepped on a fixed
 * 1/60 s grid and physics is closed-form/integrated locally, this reproduces
 * the same trajectory while keeping save data tiny.
 */
export class TimeController {
  mode: TimeMode = 'flow';
  sessionTime = 0;
  maxSessionTime = 0;
  readonly fixedDt = FIXED_DT;

  private experiment: Experiment | null = null;
  private initialParams: Record<string, string | number | boolean> = {};
  private initialEnv: EnvironmentState | null = null;
  private events: SessionEvent[] = [];
  private seq = 0;
  private accumulator = 0;
  private replaying = false;
  private forked = false;
  private rewindCursor = 0;
  private lastRebuildTarget = -1;
  private lastEnvKey = '';

  beginSession(experiment: Experiment, env: EnvironmentState): void {
    this.experiment = experiment;
    this.sessionTime = 0;
    this.maxSessionTime = 0;
    this.accumulator = 0;
    this.events = [];
    this.seq = 0;
    this.forked = false;
    this.rewindCursor = 0;
    this.lastRebuildTarget = -1;
    this.initialParams = { ...experiment.params };
    this.initialEnv = cloneEnv(env);
    this.lastEnvKey = envKey(env);
    experiment.observationActive = false;
    experiment.challengeArmed = false;
    experiment.challengeStatus = 'Awaiting a trial.';
    experiment.restartSim();
  }

  endSession(): void {
    this.experiment = null;
    this.events = [];
    this.replaying = false;
    this.mode = 'flow';
    this.accumulator = 0;
    this.sessionTime = 0;
    this.maxSessionTime = 0;
    this.rewindCursor = 0;
    this.lastRebuildTarget = -1;
  }

  get activeExperiment(): Experiment | null {
    return this.experiment;
  }

  get isActive(): boolean {
    return this.experiment !== null;
  }

  getStatus(): TimeStatus {
    return {
      mode: this.mode,
      scale: this.mode === 'flow' ? 1 : this.mode === 'slow' ? 0.1 : this.mode === 'very-slow' ? 0.04 : 0,
      sessionTime: this.sessionTime,
      maxSessionTime: this.maxSessionTime,
      rewinding: this.mode === 'rewind',
      atStart: this.sessionTime <= 0.0001,
    };
  }

  setMode(mode: TimeMode): void {
    if (mode === 'rewind') {
      this.startRewind();
      return;
    }
    if (this.mode === 'rewind') this.stopRewind(true);
    this.mode = mode;
    if (mode === 'flow' || mode === 'slow' || mode === 'very-slow') {
      this.truncateFuture();
      this.accumulator = 0;
    }
  }

  toggleSlow(): void {
    // Cycle through both slow-motion presets so the deep-slow mode is
    // reachable from the keyboard and the time card.
    this.setMode(this.mode === 'slow' ? 'very-slow' : this.mode === 'very-slow' ? 'flow' : 'slow');
  }

  togglePause(): void {
    if (this.mode === 'rewind') {
      this.stopRewind(true);
      return;
    }
    this.setMode(this.mode === 'paused' ? 'flow' : 'paused');
  }

  startRewind(): void {
    if (!this.experiment) return;
    if (this.mode !== 'rewind') {
      this.truncateFuture();
      this.mode = 'rewind';
      this.rewindCursor = this.sessionTime;
      this.lastRebuildTarget = -1;
      this.accumulator = 0;
    }
  }

  stopRewind(pause = true): void {
    if (this.mode !== 'rewind') return;
    this.mode = pause ? 'paused' : 'flow';
    this.forked = true;
  }

  update(dt: number, env: EnvironmentState): void {
    if (!this.experiment) return;
    if (envKey(env) !== this.lastEnvKey) {
      this.lastEnvKey = envKey(env);
      this.events.push({ t: this.sessionTime, seq: this.seq++, kind: 'env', env: cloneEnv(env) });
    }

    if (this.mode === 'rewind') {
      this.rewindStep(dt);
      return;
    }
    if (this.mode === 'paused') return;

    const scale = this.mode === 'flow' ? 1 : this.mode === 'slow' ? 0.1 : 0.04;
    const delta = Math.min(dt, 0.05) * scale;
    this.accumulator += delta;
    let guard = 0;
    while (this.accumulator >= FIXED_DT && guard < 8) {
      this.accumulator -= FIXED_DT;
      this.applyDueEvents(this.sessionTime);
      this.experiment.update(FIXED_DT, env);
      this.sessionTime += FIXED_DT;
      this.maxSessionTime = Math.max(this.maxSessionTime, this.sessionTime);
      guard++;
    }
    if (guard === 8) this.accumulator = 0;
  }

  frameStep(env: EnvironmentState): void {
    if (!this.experiment) return;
    if (this.mode === 'rewind') this.stopRewind(true);
    this.truncateFuture();
    this.mode = 'paused';
    this.applyDueEvents(this.sessionTime);
    this.experiment.update(FIXED_DT, env);
    this.sessionTime += FIXED_DT;
    this.maxSessionTime = Math.max(this.maxSessionTime, this.sessionTime);
  }

  private rewindStep(dt: number): void {
    if (!this.experiment) return;
    const target = Math.max(0, this.rewindCursor - Math.min(dt, 0.05) * 2.4);
    this.rewindCursor = target;
    if (target <= 0) {
      this.mode = 'paused';
      this.forked = true;
    }
    if (Math.abs(target - this.lastRebuildTarget) < 0.045) return;
    this.lastRebuildTarget = target;
    this.rebuildTo(target);
  }

  /** Reconstruct the station state at a session timestamp by replaying events. */
  private rebuildTo(target: number): void {
    const experiment = this.experiment;
    const initialEnv = this.initialEnv;
    if (!experiment || !initialEnv) return;
    this.replaying = true;
    experiment.observationActive = false;
    experiment.restartSim();
    experiment.challengeArmed = false;
    experiment.challengeStatus = 'Awaiting a trial.';
    for (const [id, value] of Object.entries(this.initialParams)) {
      experiment.params[id] = value;
    }

    const replayEnv = cloneEnv(initialEnv);
    const steps = Math.floor(target / FIXED_DT + 1e-7);
    let eventIndex = 0;
    for (let i = 0; i < steps; i++) {
      const stepTime = i * FIXED_DT;
      while (eventIndex < this.events.length && this.events[eventIndex].t <= stepTime + 1e-7) {
        this.applyEvent(this.events[eventIndex], replayEnv);
        eventIndex++;
      }
      experiment.update(FIXED_DT, replayEnv);
    }
    while (eventIndex < this.events.length && this.events[eventIndex].t <= target + 1e-7) {
      this.applyEvent(this.events[eventIndex], replayEnv);
      eventIndex++;
    }
    this.sessionTime = target;
    this.replaying = false;
  }

  private applyDueEvents(time: number): void {
    // Events are consumed during rebuild; live playback advances normally and
    // events live only for rewinding. Nothing to do here for the live pass.
    void time;
  }

  private applyEvent(event: SessionEvent, replayEnv: EnvironmentState): void {
    const experiment = this.experiment;
    if (!experiment) return;
    switch (event.kind) {
      case 'param':
        if (event.id !== undefined) experiment.setParam(event.id, event.value as any);
        break;
      case 'primary':
        experiment.triggerPrimaryAction();
        break;
      case 'restart':
        experiment.restartSim();
        break;
      case 'observe':
        experiment.startObservation();
        break;
      case 'arm':
        experiment.armChallenge();
        break;
      case 'disarm':
        experiment.disarmChallenge();
        break;
      case 'env':
        if (event.env) Object.assign(replayEnv, event.env);
        break;
    }
  }

  recordParam(id: string, value: string | number | boolean): void {
    if (!this.experiment || this.replaying) return;
    this.truncateFuture();
    this.events.push({ t: this.sessionTime, seq: this.seq++, kind: 'param', id, value });
  }

  recordPrimary(): void {
    if (!this.experiment || this.replaying) return;
    this.truncateFuture();
    this.events.push({ t: this.sessionTime, seq: this.seq++, kind: 'primary' });
  }

  recordRestart(): void {
    if (!this.experiment || this.replaying) return;
    this.truncateFuture();
    this.events.push({ t: this.sessionTime, seq: this.seq++, kind: 'restart' });
  }

  runObservation(env: EnvironmentState): void {
    if (!this.experiment) return;
    // A guided observation is a fresh scripted run. Re-baseline the session
    // with the observation parameters so the clock, rewind history and the
    // displayed session time all agree from 0.0 s.
    this.experiment.startObservation();
    this.initialParams = { ...this.experiment.params };
    this.initialEnv = cloneEnv(env);
    this.lastEnvKey = envKey(env);
    this.events = [];
    this.seq = 0;
    this.sessionTime = 0;
    this.maxSessionTime = 0;
    this.accumulator = 0;
    this.forked = false;
    this.rewindCursor = 0;
    this.lastRebuildTarget = -1;
    this.mode = 'flow';
  }

  armChallenge(): void {
    if (!this.experiment) return;
    this.recordAction('arm');
    this.experiment.armChallenge();
  }

  disarmChallenge(): void {
    if (!this.experiment) return;
    this.recordAction('disarm');
    this.experiment.disarmChallenge();
  }

  restart(): void {
    if (!this.experiment) return;
    this.recordRestart();
    this.experiment.restartSim();
  }

  usePrimary(): void {
    if (!this.experiment) return;
    this.recordPrimary();
    this.experiment.triggerPrimaryAction();
  }

  recordEnvironment(env: EnvironmentState): void {
    if (!this.experiment) return;
    this.lastEnvKey = envKey(env);
    this.truncateFuture();
    this.events.push({ t: this.sessionTime, seq: this.seq++, kind: 'env', env: cloneEnv(env) });
  }

  private recordAction(kind: 'observe' | 'arm' | 'disarm'): void {
    if (!this.experiment || this.replaying) return;
    this.truncateFuture();
    this.events.push({ t: this.sessionTime, seq: this.seq++, kind });
  }

  private truncateFuture(): void {
    if (!this.forked) return;
    const cutoff = this.sessionTime + 1e-7;
    this.events = this.events.filter((event) => event.t <= cutoff);
    this.forked = false;
    this.maxSessionTime = Math.max(this.sessionTime, 0);
  }
}
