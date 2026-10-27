import * as THREE from 'three';
import type { EnvironmentState } from '../config';
import { addGlowSprite, addPointLight, addWireRing, addCircleDisc, meshBox } from '../world/voxel';
import { makeRadialGlowTexture } from '../core/utils';
import type {
  ChallengeConfig,
  ExperimentMeta,
  GraphSample,
  ParamValue,
  Readout,
  TelemetryTarget,
  VectorProbe,
} from './types';

export type StationTab = 'observe' | 'tinker' | 'intuition' | 'solve';

let sharedGlowTexture: THREE.CanvasTexture | null = null;
const sharedRadial = (): THREE.CanvasTexture => {
  if (!sharedGlowTexture) sharedGlowTexture = makeRadialGlowTexture();
  return sharedGlowTexture;
};

export abstract class Experiment {
  readonly root = new THREE.Group();
  readonly visualRoot = new THREE.Group();
  readonly dynamicRoot = new THREE.Group();
  readonly meta: ExperimentMeta;
  params: Record<string, ParamValue>;
  simTime = 0;
  focused = false;
  observationActive = false;
  challengeArmed = false;
  solved = false;
  solveCheckCooldown = 0;
  challengeStatus = 'Awaiting a trial.';
  lastObservationTime = 0;
  updateCount = 0;
  protected currentEnv: EnvironmentState | null = null;

  protected glowTexture = sharedRadial();

  constructor(meta: ExperimentMeta) {
    this.meta = meta;
    this.params = { ...meta.defaults };
    this.root.name = `experiment-${meta.id}`;
    this.root.add(this.visualRoot);
    this.visualRoot.add(this.dynamicRoot);
  }

  initialize(env: EnvironmentState): void {
    this.currentEnv = env;
    this.buildVisual(env);
    this.resetSim();
  }

  abstract buildVisual(env: EnvironmentState): void;

  abstract resetSim(): void;

  abstract step(dt: number, env: EnvironmentState): void;

  abstract isSolved(): boolean;

  abstract getMetrics(env: EnvironmentState): Readout[];

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return {};
  }

  getPrimaryActionLabel(): string | null {
    return null;
  }

  getPrimaryActionHint(): string {
    return '';
  }

  canUsePrimaryAction(): boolean {
    return true;
  }

  triggerPrimaryAction(): void {}

  getTelemetryTargets(): TelemetryTarget[] {
    return [];
  }

  getGraphSample(): GraphSample | null {
    const target = this.getTelemetryTargets()[0];
    if (!target) return null;
    const state = target.getState();
    const mass = state.mass ?? target.mass;
    const v = state.velocity.length();
    const h = state.position.y - (state.potentialReference ?? 0);
    return {
      t: this.simTime,
      position: state.position.y,
      velocity: v,
      ke: 0.5 * mass * v * v,
      pe: mass * 9.81 * Math.max(0, h),
    };
  }

  getVectorProbes(env: EnvironmentState): VectorProbe[] {
    return this.getTelemetryTargets().map((target, index) => {
      const state = target.getState();
      return {
        id: `${target.id}-${index}`,
        position: state.position.clone(),
        velocity: state.velocity.clone(),
        acceleration: state.acceleration?.clone(),
        gravity: new THREE.Vector3(0, -env.gravity, 0),
        scale: 1,
      };
    });
  }

  setParam(id: string, value: ParamValue): void {
    const control = this.meta.controls.find((c) => c.id === id);
    if (!control) return;
    let next = value;
    if (control.kind === 'range' && typeof value === 'number') {
      next = Math.min(control.max ?? value, Math.max(control.min ?? value, value));
    }
    this.params[id] = next;
    this.onParamChange(id, next);
    this.observationActive = false;
  }

  protected onParamChange(_id: string, _value: ParamValue): void {}

  protected onObservationStart(): void {}

  protected onSolveStart(): void {}

  armChallenge(): void {
    this.challengeArmed = true;
    this.solved = false;
    this.challengeStatus = 'Trial armed — tune the apparatus and run it.';
    this.resetSim();
    this.onSolveStart();
  }

  disarmChallenge(): void {
    this.challengeArmed = false;
  }

  startObservation(): void {
    const observeParams = this.meta.observeParams;
    if (observeParams) {
      for (const [key, value] of Object.entries(observeParams)) {
        if (key in this.params) this.params[key] = value;
      }
    }
    this.observationActive = true;
    this.challengeArmed = false;
    this.simTime = 0;
    this.resetSim();
    this.onObservationStart();
  }

  restartSim(): void {
    this.simTime = 0;
    this.resetSim();
    if (this.challengeArmed) this.solved = false;
  }

  update(dt: number, env: EnvironmentState): void {
    this.currentEnv = env;
    this.updateCount++;
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.simTime += dt;
    this.step(dt, env);
  }

  resetChallengeOnParamChange(): void {
    // Most challenges may be re-armed by a new trial. Kept no-op so experiments
    // can choose whether live adjustments should preserve a trial.
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    if (!focused) {
      this.observationActive = false;
    }
  }

  protected num(key: string): number {
    return Number(this.params[key] ?? 0);
  }

  protected str(key: string): string {
    return String(this.params[key] ?? '');
  }

  protected bool(key: string): boolean {
    return Boolean(this.params[key]);
  }

  get numberValue(): number {
    return 0;
  }

  // ---- Shared scene helpers ----

  protected addGlow(position: [number, number, number], color: string, size: number, opacity = 0.55): THREE.Sprite {
    return addGlowSprite(this.dynamicRoot, this.glowTexture, position, size, color, opacity);
  }

  protected addStaticGlow(position: [number, number, number], color: string, size: number, opacity = 0.55): THREE.Sprite {
    return addGlowSprite(this.visualRoot, this.glowTexture, position, size, color, opacity);
  }

  protected addBox(
    width: number,
    height: number,
    depth: number,
    color: number | string,
    position: [number, number, number],
    options: Parameters<typeof meshBox>[4] = {},
    dynamic = false,
  ): THREE.Mesh {
    const mesh = meshBox(width, height, depth, color, { ...options, position });
    (dynamic ? this.dynamicRoot : this.visualRoot).add(mesh);
    return mesh;
  }

  protected addLight(
    color: string | number,
    intensity: number,
    distance: number,
    position: [number, number, number],
  ): THREE.PointLight {
    return addPointLight(this.visualRoot, color, intensity, distance, position);
  }

  protected addRing(
    radius: number,
    color: number,
    position: [number, number, number],
    opacity = 0.45,
  ): THREE.LineLoop {
    return addWireRing(this.visualRoot, radius, color, position, [-Math.PI / 2, 0, 0], opacity);
  }

  protected addDisc(
    radius: number,
    color: number,
    position: [number, number, number],
    opacity = 0.15,
  ): THREE.Mesh {
    return addCircleDisc(this.visualRoot, radius, color, position, opacity);
  }

  protected labelCue(text: string): void {
    this.challengeStatus = text;
  }

  protected makeTelemetry(
    id: string,
    object: THREE.Object3D,
    label: string,
    mass: number,
    getState: TelemetryTarget['getState'],
  ): TelemetryTarget {
    object.userData.telemetryId = id;
    return { id, object, label, mass, getState };
  }

  protected environment(env: EnvironmentState): EnvironmentState {
    return env;
  }

  getChallenge(): ChallengeConfig {
    return this.meta.challenge;
  }

  getTelemetryByObject(object: THREE.Object3D): TelemetryTarget | null {
    let node: THREE.Object3D | null = object;
    while (node) {
      const id = node.userData.telemetryId as string | undefined;
      if (id) {
        const target = this.getTelemetryTargets().find((t) => t.id === id);
        if (target) return target;
      }
      node = node.parent;
    }
    return null;
  }
}
