/**
 * Procedural Web Audio API Sound Engine
 * Generates retro-authentic 16-bit Minecraft-style sound effects
 * entirely in real-time with zero external audio assets.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled = true;
  private lastFootstepTime = 0;

  private init(): boolean {
    if (this.ctx) return true;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.init()) return null;
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Block placement sound: solid tactile click-thud
   */
  playBlockPlace(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(180, t + 0.08);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220 + Math.random() * 40, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.07);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.09);

    // Subtle click transient
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'square';
    click.frequency.setValueAtTime(1200, t);
    clickGain.gain.setValueAtTime(0.18, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    click.connect(clickGain);
    clickGain.connect(this.masterGain);
    click.start(t);
    click.stop(t + 0.02);
  }

  /**
   * Block break sound: crunchy procedural noise burst
   */
  playBlockBreak(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 0.14;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600 + Math.random() * 300, t);
    filter.Q.setValueAtTime(1.8, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(t);

    // Deep crack sub-thump
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(140, t);
    sub.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    subGain.gain.setValueAtTime(0.6, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(t);
    sub.stop(t + 0.12);
  }

  /**
   * Footstep sound: subtle rhythmic step
   */
  playFootstep(material = 'stone'): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;
    if (t - this.lastFootstepTime < 0.22) return;
    this.lastFootstepTime = t;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(material === 'grass' ? 450 : 700, t);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(material === 'grass' ? 110 : 160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.045);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.06);
  }

  /**
   * Jump sound: upward spring pitch
   */
  playJump(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.12);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.14);
  }

  /**
   * Landing impact thud
   */
  playLand(intensity = 1.0): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.1);

    gain.gain.setValueAtTime(Math.min(0.45 * intensity, 0.7), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.12);
  }

  /**
   * Slime bounce sound: boinggg
   */
  playSlimeBounce(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.linearRampToValueAtTime(480, t + 0.08);
    osc.frequency.linearRampToValueAtTime(240, t + 0.22);

    gain.gain.setValueAtTime(0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.26);
  }

  /**
   * TNT explosion sound: powerful rumbling detonation
   */
  playExplosion(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;
    // Sub rumble
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(100, t);
    sub.frequency.exponentialRampToValueAtTime(25, t + 0.7);
    subGain.gain.setValueAtTime(0.8, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(t);
    sub.stop(t + 0.8);

    // Blast noise
    const bufferSize = ctx.sampleRate * 0.6;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.18));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.exponentialRampToValueAtTime(150, t + 0.55);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(t);
  }

  /**
   * Discovery Badge Jingle: triumphant 4-note ascending chime
   */
  playDiscoveryJingle(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.11;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.38, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.38);
    });
  }

  /**
   * Time Dilation Mode Transition (warp whoosh)
   */
  playTimeWarp(isSlow: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    if (isSlow) {
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.28);
    } else {
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(600, t + 0.28);
    }

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.32);
  }

  /**
   * Tool selection switch click
   */
  playToolSwitch(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  /**
   * Crisp UI click / toggle sound
   */
  playClick(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.04);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }
}

export const sound = new SoundEngine();
