/**
 * Procedural Web Audio API Sound Engine
 * Generates retro-authentic 16-bit field-instrument sound effects
 * entirely in real-time with zero external audio assets.
 */

export type SurfaceMaterial =
  | 'sandstone'
  | 'gravel'
  | 'marble'
  | 'stone'
  | 'basalt'
  | 'metal'
  | 'crystal'
  | 'timber'
  | 'wood'
  | 'slime'
  | 'grass';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled = true;
  private lastFootstepTime = 0;
  private ambienceStarted = false;
  private ambienceMuted = false;
  private windGain: GainNode | null = null;
  private rotundaGain: GainNode | null = null;
  private electroGain: GainNode | null = null;
  private quantumGain: GainNode | null = null;

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
   * Block placement sound: solid tactile click-thud with material nuance
   */
  playBlockPlace(type?: string): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;

    // Glass / crystal ping
    if (type === 'glass' || type === 'glowstone') {
      const ping = ctx.createOscillator();
      const pGain = ctx.createGain();
      ping.type = 'sine';
      ping.frequency.setValueAtTime(1400, t);
      ping.frequency.exponentialRampToValueAtTime(1900, t + 0.05);
      pGain.gain.setValueAtTime(0.25, t);
      pGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      ping.connect(pGain);
      pGain.connect(this.masterGain);
      ping.start(t);
      ping.stop(t + 0.13);
      return;
    }

    // Slime squish
    if (type === 'slime') {
      this.playSlimeBounce();
      return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(type === 'wood' ? 520 : 800, t);
    filter.frequency.exponentialRampToValueAtTime(180, t + 0.08);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime((type === 'wood' ? 160 : 220) + Math.random() * 40, t);
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
   * Block break sound: crunchy procedural noise burst with material nuance
   */
  playBlockBreak(type?: string): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;

    // Glass shatter
    if (type === 'glass' || type === 'glowstone') {
      const ping = ctx.createOscillator();
      const pGain = ctx.createGain();
      ping.type = 'triangle';
      ping.frequency.setValueAtTime(2200, t);
      ping.frequency.exponentialRampToValueAtTime(800, t + 0.08);
      pGain.gain.setValueAtTime(0.3, t);
      pGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      ping.connect(pGain);
      pGain.connect(this.masterGain);
      ping.start(t);
      ping.stop(t + 0.1);
    }

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
    filter.frequency.setValueAtTime((type === 'wood' ? 400 : 600) + Math.random() * 300, t);
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
   * Seating sound: gentle wooden bench settle and leather/cloth rustle
   */
  playSit(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, t);
    filter.frequency.exponentialRampToValueAtTime(140, t + 0.18);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(95, t + 0.16);

    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.19);

    const bufSize = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.035));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = 'bandpass';
    nFilter.frequency.setValueAtTime(320, t);
    nFilter.Q.setValueAtTime(1.2, t);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.12, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(t);
  }

  /**
   * Stand up sound: light cloth whoosh and floor shift
   */
  playStand(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(240, t + 0.14);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.17);
  }

  /**
   * Footstep sound: authentic physical acoustic resonance per terrain material
   */
  playFootstep(material = 'stone'): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;
    if (t - this.lastFootstepTime < 0.22) return;
    this.lastFootstepTime = t;

    if (material === 'sandstone' || material === 'gravel') {
      // Crunchy gravel / sand scree: filtered noise burst + low crunch
      const bufferSize = Math.floor(ctx.sampleRate * 0.06);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const bFilter = ctx.createBiquadFilter();
      bFilter.type = 'bandpass';
      bFilter.frequency.setValueAtTime(680, t);
      bFilter.Q.setValueAtTime(1.8, t);
      const bGain = ctx.createGain();
      bGain.gain.setValueAtTime(0.18, t);
      bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      noise.connect(bFilter);
      bFilter.connect(bGain);
      bGain.connect(this.masterGain);
      noise.start(t);
      return;
    }

    if (material === 'metal' || material === 'iron' || material === 'copper') {
      // Metallic resonant clink
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1180, t);
      osc.frequency.exponentialRampToValueAtTime(540, t + 0.06);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.075);
      return;
    }

    if (material === 'crystal' || material === 'glass' || material === 'glowstone') {
      // High delicate crystal chime tap
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1650, t);
      osc.frequency.exponentialRampToValueAtTime(980, t + 0.05);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.065);
      return;
    }

    if (material === 'wood' || material === 'planks') {
      // Hollow resonant timber thud
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(380, t);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(65, t + 0.05);
      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.06);
      return;
    }

    if (material === 'slime') {
      this.playSlimeBounce();
      return;
    }

    // Default stone / marble / basalt: crisp solid contact
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(material === 'marble' ? 880 : material === 'grass' ? 420 : 680, t);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(material === 'marble' ? 190 : material === 'grass' ? 100 : 150, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.045);

    gain.gain.setValueAtTime(material === 'marble' ? 0.15 : 0.11, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.055);
  }

  /**
   * Surveyor's Carbide Lantern toggle sound: mechanical latch + flame ignition
   */
  playLanternToggle(on: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'square';
    click.frequency.setValueAtTime(on ? 1420 : 980, t);
    click.frequency.exponentialRampToValueAtTime(on ? 1850 : 640, t + 0.04);
    clickGain.gain.setValueAtTime(0.18, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    click.connect(clickGain);
    clickGain.connect(this.masterGain);
    click.start(t);
    click.stop(t + 0.06);

    if (on) {
      const whoosh = ctx.createOscillator();
      const wGain = ctx.createGain();
      whoosh.type = 'sine';
      whoosh.frequency.setValueAtTime(120, t + 0.02);
      whoosh.frequency.exponentialRampToValueAtTime(280, t + 0.12);
      wGain.gain.setValueAtTime(0.14, t + 0.02);
      wGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      whoosh.connect(wGain);
      wGain.connect(this.masterGain);
      whoosh.start(t + 0.02);
      whoosh.stop(t + 0.15);
    }
  }

  /**
   * Theodolite precision optical zoom rack ratchet
   */
  playTheodoliteSight(active: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.enabled) return;

    const t = ctx.currentTime;
    const ratchet = ctx.createOscillator();
    const rGain = ctx.createGain();
    ratchet.type = 'sawtooth';
    ratchet.frequency.setValueAtTime(active ? 850 : 620, t);
    ratchet.frequency.exponentialRampToValueAtTime(active ? 1350 : 420, t + 0.08);
    rGain.gain.setValueAtTime(0.16, t);
    rGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    ratchet.connect(rGain);
    rGain.connect(this.masterGain);
    ratchet.start(t);
    ratchet.stop(t + 0.1);
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

  /**
   * Continuous generative acoustic soundscape (wind breeze, rotunda resonance, field hum)
   */
  startAmbience(): void {
    if (this.ambienceStarted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    this.ambienceStarted = true;

    try {
      // 1. High-Altitude Wind / Mountain Breeze (filtered pink noise loop)
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99 * b0 + white * 0.05;
        b1 = 0.95 * b1 + white * 0.05;
        b2 = 0.85 * b2 + white * 0.05;
        output[i] = (b0 + b1 + b2) * 0.4;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.setValueAtTime(240, ctx.currentTime);
      windFilter.Q.setValueAtTime(1.1, ctx.currentTime);

      this.windGain = ctx.createGain();
      this.windGain.gain.setValueAtTime(0.045, ctx.currentTime);

      whiteNoise.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(this.masterGain);
      whiteNoise.start();

      // 2. Central Rotunda Celestial Resonance (216 Hz & 432 Hz pure harmonic chord)
      const rotundaOsc1 = ctx.createOscillator();
      const rotundaOsc2 = ctx.createOscillator();
      rotundaOsc1.type = 'sine';
      rotundaOsc1.frequency.setValueAtTime(216, ctx.currentTime);
      rotundaOsc2.type = 'sine';
      rotundaOsc2.frequency.setValueAtTime(432, ctx.currentTime);

      this.rotundaGain = ctx.createGain();
      this.rotundaGain.gain.setValueAtTime(0.02, ctx.currentTime);

      rotundaOsc1.connect(this.rotundaGain);
      rotundaOsc2.connect(this.rotundaGain);
      this.rotundaGain.connect(this.masterGain);
      rotundaOsc1.start();
      rotundaOsc2.start();

      // 3. Electromagnetism 60 Hz Field Hum
      const electroOsc = ctx.createOscillator();
      electroOsc.type = 'triangle';
      electroOsc.frequency.setValueAtTime(60, ctx.currentTime);

      const electroFilter = ctx.createBiquadFilter();
      electroFilter.type = 'lowpass';
      electroFilter.frequency.setValueAtTime(180, ctx.currentTime);

      this.electroGain = ctx.createGain();
      this.electroGain.gain.setValueAtTime(0, ctx.currentTime);

      electroOsc.connect(electroFilter);
      electroFilter.connect(this.electroGain);
      this.electroGain.connect(this.masterGain);
      electroOsc.start();

      // 4. Quantum Vacuum Fluctuation Murmur (sub-bass 96 Hz sine)
      const quantumOsc = ctx.createOscillator();
      quantumOsc.type = 'sine';
      quantumOsc.frequency.setValueAtTime(96, ctx.currentTime);

      this.quantumGain = ctx.createGain();
      this.quantumGain.gain.setValueAtTime(0, ctx.currentTime);

      quantumOsc.connect(this.quantumGain);
      this.quantumGain.connect(this.masterGain);
      quantumOsc.start();
    } catch {
      // Audio nodes handled gracefully if unsupported
    }
  }

  updateAmbience(pos: { x: number; y: number; z: number }): void {
    if (!this.ctx || !this.ambienceStarted) return;
    const t = this.ctx.currentTime;
    const factor = this.ambienceMuted || !this.enabled ? 0 : 1;

    // Distance to Central Rotunda
    const distHub = Math.hypot(pos.x, pos.z);
    const inHub = Math.max(0, 1 - distHub / 28);
    if (this.rotundaGain) {
      this.rotundaGain.gain.setTargetAtTime(inHub * 0.045 * factor, t, 0.5);
    }
    if (this.windGain) {
      const windTarget = (0.035 + (1 - inHub) * 0.04) * factor;
      this.windGain.gain.setTargetAtTime(windTarget, t, 0.5);
    }

    // Distance to Electromagnetism Court (~ [71, 41])
    const distElectro = Math.hypot(pos.x - 71, pos.z - 41);
    const inElectro = Math.max(0, 1 - distElectro / 38);
    if (this.electroGain) {
      this.electroGain.gain.setTargetAtTime(inElectro * 0.035 * factor, t, 0.4);
    }

    // Distance to Quantum Domain Court (~ [-41, 71])
    const distQuantum = Math.hypot(pos.x - (-41), pos.z - 71);
    const inQuantum = Math.max(0, 1 - distQuantum / 38);
    if (this.quantumGain) {
      this.quantumGain.gain.setTargetAtTime(inQuantum * 0.03 * factor, t, 0.4);
    }
  }

  setAmbienceMuted(muted: boolean): void {
    this.ambienceMuted = muted;
  }
}

export const sound = new SoundEngine();
