import * as THREE from 'three';
import { Experiment } from '../BaseExperiment';
import type { ExperimentMeta, GraphSample, Readout, TelemetryTarget, VectorProbe } from '../types';
import type { EnvironmentState } from '../../config';
import { meshBox } from '../../world/voxel';
import { makeTextLabel } from '../../world/labels';
import { clamp } from '../../core/utils';
import { addStationSign, CanvasBoard, glassBox, makeLine } from './sceneKit';

const Q = {
  steel: 0x334b47,
  steelLight: 0x6e918a,
  dark: 0x071813,
  brass: 0xd4b273,
  mint: 0x76ffc2,
  green: 0x53e8a0,
  cyan: 0x74f0ff,
  gold: 0xffd48a,
  violet: 0xb48cff,
  red: 0xff756f,
  ink: 0x0a1c17,
};

const HC = 1240; // eV·nm

const MATERIALS: Record<string, { label: string; work: number; color: number }> = {
  potassium: { label: 'Potassium', work: 2.3, color: 0xcbb6da },
  sodium: { label: 'Sodium', work: 2.28, color: 0xdfc479 },
  zinc: { label: 'Zinc', work: 4.3, color: 0x9aabb1 },
  gold: { label: 'Gold', work: 5.1, color: 0xe8bd5d },
};

function wavelengthColor(nm: number): THREE.Color {
  if (nm < 380) return new THREE.Color(0x9b7cff);
  if (nm < 440) return new THREE.Color(0x7f7dff);
  if (nm < 490) return new THREE.Color(0x62c7ff);
  if (nm < 510) return new THREE.Color(0x68f0d1);
  if (nm < 580) return new THREE.Color(0xa8ff7d);
  if (nm < 645) return new THREE.Color(0xffc764);
  return new THREE.Color(0xff6e64);
}

// -----------------------------------------------------------------------------
// 6.1 — Double-Slit Arena
// -----------------------------------------------------------------------------

const slitMeta: ExperimentMeta = {
  id: 'double-slit',
  biome: 'quantum',
  number: '6.1',
  title: 'Double-Slit Arena',
  shortTitle: 'Double Slit',
  subtitle: 'Two openings. One probability wave.',
  description:
    'Fire single particles at a barrier with two narrow slits. Individually, each lands at a random point. Collectively, they build an interference pattern — until a which-path detector watches the slits.',
  concept:
    'The probability amplitude reaching the screen is the sum of the amplitudes from both slits. Their phase difference depends on path length, producing bright fringes where the paths differ by an integer wavelength. Measuring which slit destroys the interference.',
  realWorld:
    'Electron microscopy, neutron interferometry, atom interferometers, and quantum cryptography all exploit or wrestle with wave–particle duality.',
  formula: 'Δy = λL/d     ·     d sin θ = mλ     ·     I ∝ cos²(π d y / λL)',
  formulaNote:
    'Δy is the fringe spacing, L the slit-to-screen distance, d the slit separation. In this arena L = 1.0 m and the pattern is magnified for visibility; the metre-scale readouts use the real formula.',
  badgeName: 'Fringe Weaver',
  accent: '#a4ffd1',
  accentNumber: 0xa4ffd1,
  badgeGlyph: '⋮',
  controls: [
    { id: 'wavelength', label: 'Particle wavelength λ', kind: 'range', min: 380, max: 750, step: 5, unit: 'nm' },
    { id: 'separation', label: 'Slit separation d', kind: 'range', min: 40, max: 160, step: 1, unit: 'µm' },
    { id: 'detector', label: 'Which-path detector', kind: 'toggle', hint: 'Watching the slits collapses the interference into two bands.' },
  ],
  defaults: { wavelength: 550, separation: 100, detector: false },
  observeParams: { wavelength: 550, separation: 100, detector: false },
  observeCues: [
    { at: 0.1, text: 'Single particles leave the gun one at a time. Each lands somewhere unpredictable on the screen.' },
    { at: 2.4, text: 'As hits accumulate, bright and dark bands appear. Each particle interferes with its own probability amplitude.' },
    { at: 4.4, text: 'The spacing is Δy = λL/d. Longer wavelength or closer slits spread the fringes farther apart.' },
    { at: 6.2, text: 'Now switch on the which-path detector. We learn which slit each particle uses.' },
    { at: 8.2, text: 'The interference vanishes. The pattern becomes two simple bands — measurement has changed the story.' },
  ],
  challenge: {
    title: 'Five-Millimetre Fringes',
    brief:
      'With 500 nm particles and the which-path detector off, tune the slit separation until the fringe spacing is exactly 5.00 mm.',
    hint: 'Δy = λL/d. With λ = 500 nm = 5×10⁻⁷ m, L = 1 m and Δy = 5×10⁻³ m, d must be 1×10⁻⁴ m = 100 µm.',
    success: 'Exactly 5.00 mm between fringes. The geometry of two slits is written across the screen.',
    targetLabel: 'λ = 500 nm · Δy = 5.00 mm · detector off',
  },
  chart: {
    title: 'Interference geometry',
    positionLabel: 'Fringe spacing (mm)',
    velocityLabel: 'Slit separation (µm)',
    energyLabel: 'Particle energy (eV)',
  },
};

interface SlitParticle {
  active: boolean;
  t: number;
  speed: number;
  startX: number;
  slitX: number;
  slitY: number;
  landX: number;
  landY: number;
}

interface ScreenSpark {
  active: boolean;
  x: number;
  y: number;
  z: number;
  life: number;
  maxLife: number;
}

const SCREEN_Y = 3.55;
const SCREEN_W = 5.0;
const SCREEN_H = 6.1;
const SCREEN_Z = -5.55;
const SLIT_Z = 0;

export class DoubleSlitExperiment extends Experiment {
  private screenBoard!: CanvasBoard;
  private barrierSegments: THREE.Mesh[] = [];
  private slitGlows: THREE.Sprite[] = [];
  private slitLabels: THREE.Sprite[] = [];
  private detectorGroup = new THREE.Group();
  private detectorBeams: THREE.Line[] = [];
  private particles!: THREE.InstancedMesh;
  private particleData: SlitParticle[] = [];
  private sparks!: THREE.InstancedMesh;
  private sparkData: ScreenSpark[] = [];
  private emitTimer = 0;
  private signalBoard!: CanvasBoard;
  private boardTimer = 0;
  private gunGlow!: THREE.Sprite;
  private beamLine!: THREE.Line;
  private fringeLabel!: THREE.Sprite;
  private lastFringeKey = '';
  private patternCanvasVersion = 0;
  private detectorOn = false;
  private sourceGlow!: THREE.Sprite;
  private screenBackGlow!: THREE.Sprite;

  constructor() {
    super(slitMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 15.5, height: 6.3, targetHeight: 3.3 };
  }

  buildVisual(): void {
    const group = this.visualRoot;
    group.add(meshBox(12, 0.36, 16.5, 0x0d211b, { position: [0, 0.18, 0] }));
    group.add(meshBox(11.3, 0.08, 15.8, 0x17362d, { position: [0, 0.4, 0] }));

    // Screen and frame.
    this.screenBoard = new CanvasBoard(SCREEN_W, SCREEN_H, 560, 700);
    this.screenBoard.mesh.position.set(0, SCREEN_Y, SCREEN_Z);
    group.add(this.screenBoard.mesh);
    for (const x of [-SCREEN_W / 2 - 0.12, SCREEN_W / 2 + 0.12]) {
      group.add(meshBox(0.18, SCREEN_H + 0.3, 0.2, 0x557a6c, { position: [x, SCREEN_Y, SCREEN_Z - 0.05] }));
    }
    for (const y of [SCREEN_Y - SCREEN_H / 2 - 0.12, SCREEN_Y + SCREEN_H / 2 + 0.12]) {
      group.add(meshBox(SCREEN_W + 0.5, 0.18, 0.2, 0x557a6c, { position: [0, y, SCREEN_Z - 0.05] }));
    }
    group.add(meshBox(4.0, 0.28, 1.3, 0x233e35, { position: [0, 0.56, SCREEN_Z + 0.6] }));
    this.screenBackGlow = this.addStaticGlow([0, SCREEN_Y, SCREEN_Z - 0.35], '#7bffd0', 6.5, 0.18);
    addStationSign(group, 'DETECTION SCREEN', 'COUNTS BUILD THE PATTERN', '#a4ffd1', [0, SCREEN_Y + 3.55, SCREEN_Z + 0.2], 4.4);

    // Slit barrier segments (rebuilt whenever separation changes).
    this.buildBarrier();

    // Slit labels and glowing lips.
    for (let i = 0; i < 2; i++) {
      const glow = this.addStaticGlow([0, SCREEN_Y, SLIT_Z], '#a4ffd1', 1.5, 0.3);
      this.slitGlows.push(glow);
      const label = makeTextLabel(i === 0 ? 'SLIT A' : 'SLIT B', 'OPEN APERTURE', '#a4ffd1', { width: 600, height: 200 });
      label.scale.set(1.7, 0.57, 1);
      label.position.set(2.9, SCREEN_Y + (i === 0 ? -0.5 : 0.5), SLIT_Z + 0.35);
      group.add(label);
      this.slitLabels.push(label);
    }

    // Which-path detector module.
    this.detectorGroup.position.set(0, 6.65, 0.15);
    this.detectorGroup.add(meshBox(1.1, 0.55, 0.9, 0x344942, { position: [0, 0, 0], metalness: 0.45, roughness: 0.35 }));
    this.detectorGroup.add(meshBox(0.5, 0.18, 0.4, 0xff756f, { position: [0, 0.07, 0.5], glow: true, opacity: 0.85 }));
    this.detectorGroup.add(meshBox(0.1, 1.2, 0.1, 0x7fa99b, { position: [-0.55, -0.85, 0] }));
    this.detectorGroup.add(meshBox(0.1, 1.2, 0.1, 0x7fa99b, { position: [0.55, -0.85, 0] }));
    const detLabel = makeTextLabel('WHICH-PATH DETECTOR', 'WATCHING COLLAPSES INTERFERENCE', '#ff756f', { width: 900, height: 240 });
    detLabel.scale.set(3.6, 0.96, 1);
    detLabel.position.set(0, 0.85, 0.1);
    this.detectorGroup.add(detLabel);
    group.add(this.detectorGroup);

    // Electron gun.
    group.add(meshBox(1.45, 1.3, 2.5, 0x344a43, { position: [0, 2.95, 6.25], metalness: 0.45, roughness: 0.4 }));
    group.add(meshBox(0.75, 0.75, 0.55, 0x547a6c, { position: [0, 3.55, 5.05] }));
    group.add(meshBox(0.1, 0.1, 3.0, 0x7effd0, { position: [0, SCREEN_Y, 4.5], glow: true, opacity: 0.35 }));
    const gunRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.68, 0.08, 7, 28),
      new THREE.MeshStandardMaterial({ color: Q.brass, metalness: 0.8, roughness: 0.28 }),
    );
    gunRing.position.set(0, SCREEN_Y, 5.05);
    group.add(gunRing);
    this.gunGlow = this.addStaticGlow([0, SCREEN_Y, 4.95], '#a4ffd1', 2.4, 0.4);
    addStationSign(group, 'SINGLE-PARTICLE GUN', 'ONE QUANTUM AT A TIME', '#a4ffd1', [0, 5.25, 6.8], 3.9);
    this.beamLine = makeLine(
      [new THREE.Vector3(0, SCREEN_Y, 4.9), new THREE.Vector3(0, SCREEN_Y, 0.2)],
      0x8dffd4,
      0.14,
    );
    group.add(this.beamLine);

    // Screen spark pool.
    this.sparks = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.055, 6, 5),
      new THREE.MeshBasicMaterial({
        color: 0xc7ffe9,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      80,
    );
    this.sparks.frustumCulled = false;
    group.add(this.sparks);
    for (let i = 0; i < 80; i++) {
      this.sparkData.push({ active: false, x: 0, y: 0, z: 0, life: 0, maxLife: 1 });
    }

    // Particle pool.
    this.particles = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.065, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xc7ffe9, toneMapped: false }),
      40,
    );
    this.particles.frustumCulled = false;
    group.add(this.particles);
    for (let i = 0; i < 40; i++) {
      this.particleData.push({
        active: false,
        t: 0,
        speed: 0.8,
        startX: 0,
        slitX: 0,
        slitY: SCREEN_Y,
        landX: 0,
        landY: SCREEN_Y,
      });
    }

    // Floating readout.
    this.signalBoard = new CanvasBoard(4.15, 2.3, 620, 344);
    this.signalBoard.mesh.position.set(-5.3, 4.55, 2.1);
    this.signalBoard.mesh.rotation.y = 0.42;
    group.add(this.signalBoard.mesh);
    this.fringeLabel = makeTextLabel('Δy —', 'FRINGE SPACING', '#a4ffd1', { width: 800, height: 250 });
    this.fringeLabel.scale.set(3.5, 1.08, 1);
    this.fringeLabel.position.set(4.5, 6.15, 2.0);
    group.add(this.fringeLabel);

    // Decor: probability wave ribs along the optical bench.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const z = 4.0 - i * 1.15;
        const rib = meshBox(0.06, 0.06, 4.6, 0x71ffd0, {
          position: [side * (3.2 + i * 0.12), 0.58, z - 0.55],
          glow: true,
          opacity: 0.1,
        });
        group.add(rib);
      }
    }
    addStationSign(group, 'DOUBLE-SLIT ARENA', 'Δy = λL / d', '#a4ffd1', [0, 8.25, -2.4], 5.3);
    this.addLight('#7dffd0', 1.3, 15, [0, 4.0, 3.5]);
    this.addLight('#b38cff', 0.8, 14, [4, 4.0, -3]);
    this.addLight('#8effff', 0.6, 10, [0, 3.5, -4.5]);

    this.updateBarrier();
    this.drawScreen();
    this.drawSignalBoard();
    this.updateDetectorVisual();
  }

  private buildBarrier(): void {
    const group = this.visualRoot;
    const heights = [1.0, 1.0, 1.0];
    for (let i = 0; i < 3; i++) {
      const mesh = meshBox(5.0, heights[i], 0.3, 0x233d35, {
        position: [0, 3.55, SLIT_Z],
        metalness: 0.35,
        roughness: 0.45,
        emissive: 0x2f7d64,
        emissiveIntensity: 0.08,
      });
      group.add(mesh);
      this.barrierSegments.push(mesh);
    }
    for (const x of [-2.65, 2.65]) {
      group.add(meshBox(0.32, 6.4, 0.5, 0x496c5f, { position: [x, 3.6, SLIT_Z] }));
    }
    group.add(meshBox(5.9, 0.42, 1.2, 0x29453b, { position: [0, 0.55, SLIT_Z] }));
    for (const x of [-2.65, 2.65]) {
      group.add(meshBox(0.5, 0.15, 1.1, Q.brass, { position: [x, 0.78, SLIT_Z + 0.4] }));
    }
    addStationSign(group, 'DOUBLE SLIT PLATE', 'TWO PATHS · ONE AMPLITUDE', '#a4ffd1', [0, 7.55, SLIT_Z - 0.1], 4.2);
  }

  private slitY(index: number): number {
    const dVis = this.separationVisual();
    return SCREEN_Y + (index === 0 ? -dVis / 2 : dVis / 2);
  }

  private separationVisual(): number {
    return 0.34 + ((this.num('separation') - 40) / 120) * 1.1;
  }

  private fringeSpacingMm(): number {
    return (this.num('wavelength') * 1) / Math.max(1, this.num('separation'));
  }

  private fringeSpacingScene(): number {
    return this.fringeSpacingMm() * 0.27;
  }

  private updateBarrier(): void {
    if (!this.barrierSegments.length) return;
    const dVis = this.separationVisual();
    const slitHeight = 0.15;
    const low = SCREEN_Y - dVis / 2;
    const high = SCREEN_Y + dVis / 2;
    const bottom = 0.75;
    const top = 6.85;
    const segments = [
      { y0: bottom, y1: low - slitHeight / 2 },
      { y0: low + slitHeight / 2, y1: high - slitHeight / 2 },
      { y0: high + slitHeight / 2, y1: top },
    ];
    for (let i = 0; i < this.barrierSegments.length; i++) {
      const seg = this.barrierSegments[i];
      const h = Math.max(0.04, segments[i].y1 - segments[i].y0);
      seg.scale.y = h;
      seg.position.y = (segments[i].y0 + segments[i].y1) / 2;
    }
    for (let i = 0; i < 2; i++) {
      const y = this.slitY(i);
      this.slitGlows[i]?.position.set(0, y, SLIT_Z + 0.12);
      this.slitLabels[i]?.position.set(2.95, y + (i === 0 ? -0.3 : 0.3), SLIT_Z + 0.42);
      this.slitLabels[i].visible = dVis > 0.48;
    }
    for (let i = 0; i < this.detectorBeams.length; i++) {
      this.detectorBeams[i].geometry.dispose();
      (this.detectorBeams[i].material as THREE.Material).dispose();
      this.detectorBeams[i].removeFromParent();
    }
    this.detectorBeams = [];
    for (let i = 0; i < 2; i++) {
      const beam = makeLine(
        [
          new THREE.Vector3(0, -0.15, 0.3),
          new THREE.Vector3(0, this.slitY(i) - this.detectorGroup.position.y, -0.02),
        ],
        0xff756f,
        0.28,
      );
      this.detectorGroup.add(beam);
      this.detectorBeams.push(beam);
    }
  }

  private updateDetectorVisual(): void {
    const on = this.detectorOn;
    this.detectorGroup.visible = true;
    for (let i = 0; i < this.detectorBeams.length; i++) this.detectorBeams[i].visible = on;
    const lamp = this.detectorGroup.children[1] as THREE.Mesh;
    if (lamp && (lamp.material as THREE.MeshBasicMaterial)) {
      (lamp.material as THREE.MeshBasicMaterial).color.setHex(on ? 0xff4f49 : 0x70504e);
      (lamp.material as THREE.MeshBasicMaterial).opacity = on ? 0.95 : 0.4;
    }
    this.detectorGroup.scale.setScalar(on ? 1.02 : 1);
  }

  private updateState(): void {
    this.detectorOn = this.bool('detector');
    this.updateBarrier();
    this.detectorGroup.position.y = 6.65;
    this.updateDetectorVisual();
    this.drawScreen();
    this.drawSignalBoard();
    this.updateFringeLabel();
  }

  private updateFringeLabel(): void {
    const key = `${this.num('wavelength')}-${this.num('separation')}-${this.detectorOn}`;
    if (key === this.lastFringeKey) return;
    this.lastFringeKey = key;
    const label = makeTextLabel(
      this.detectorOn ? 'NO FRINGES' : `Δy ${this.fringeSpacingMm().toFixed(2)} mm`,
      this.detectorOn ? 'PATH INFORMATION KNOWN' : 'BRIGHT-FRINGE SPACING',
      this.detectorOn ? '#ff8c85' : '#a4ffd1',
      { width: 800, height: 250 },
    );
    this.fringeLabel.material.map?.dispose();
    this.fringeLabel.material.map = label.material.map;
    this.fringeLabel.material.needsUpdate = true;
    label.material.dispose();
  }

  private intensityAt(offset: number): number {
    const dVis = this.separationVisual();
    if (this.detectorOn) {
      const g1 = Math.exp(-(((offset + dVis / 2) / 0.26) ** 2));
      const g2 = Math.exp(-(((offset - dVis / 2) / 0.26) ** 2));
      return clamp(Math.max(g1, g2) * 0.95, 0, 1);
    }
    const spacing = Math.max(0.05, this.fringeSpacingScene());
    const envelope = Math.exp(-((offset / 3.8) ** 2));
    return clamp(Math.cos((Math.PI * offset) / spacing) ** 2 * envelope, 0, 1);
  }

  private drawScreen(): void {
    if (!this.screenBoard) return;
    const accent = new THREE.Color(0xa4ffd1);
    const deep = new THREE.Color(0x061711);
    this.patternCanvasVersion++;
    this.screenBoard.draw((ctx, w, h) => {
      ctx.fillStyle = '#04110c';
      ctx.fillRect(0, 0, w, h);
      for (let py = 0; py < h; py++) {
        const offset = (0.5 - py / h) * SCREEN_H;
        const intensity = this.intensityAt(offset);
        const c = deep.clone().lerp(accent, intensity * 0.9);
        ctx.fillStyle = `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
        ctx.fillRect(26, py, w - 52, 1);
      }
      // Screen edge ruler.
      ctx.fillStyle = 'rgba(3,10,7,0.72)';
      ctx.fillRect(0, 0, 24, h);
      ctx.fillRect(w - 24, 0, 24, h);
      ctx.fillStyle = 'rgba(164,255,209,0.3)';
      for (let i = 0; i <= 20; i++) {
        const y = 10 + (i / 20) * (h - 20);
        ctx.fillRect(i % 5 === 0 ? 4 : 11, y, i % 5 === 0 ? 17 : 9, 1.5);
      }
      // Interference markers and labels.
      if (!this.detectorOn) {
        const spacing = Math.max(0.05, this.fringeSpacingScene());
        ctx.strokeStyle = 'rgba(255,212,138,0.5)';
        ctx.lineWidth = 1.5;
        for (let m = -3; m <= 3; m++) {
          const offset = m * spacing;
          if (Math.abs(offset) > SCREEN_H / 2) continue;
          const py = h / 2 - (offset / SCREEN_H) * h;
          ctx.beginPath();
          ctx.moveTo(28, py);
          ctx.lineTo(54, py);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,212,138,0.82)';
          ctx.font = '500 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`m${m}`, 54, py + 4);
        }
      }
      const grad = ctx.createLinearGradient(0, 0, 0, 46);
      grad.addColorStop(0, 'rgba(4,17,12,0.95)');
      grad.addColorStop(1, 'rgba(4,17,12,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(24, 0, w - 48, 46);
      ctx.fillStyle = '#a4ffd1';
      ctx.font = '600 17px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(this.detectorOn ? 'WHICH-PATH KNOWN · TWO BANDS' : 'PROBABILITY DENSITY · INTERFERENCE', 34, 26);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd48a';
      ctx.fillText(`λ ${this.num('wavelength').toFixed(0)} nm · d ${this.num('separation').toFixed(0)} µm`, w - 34, 26);
      ctx.fillStyle = 'rgba(164,255,209,0.65)';
      ctx.textAlign = 'left';
      ctx.font = '500 13px "JetBrains Mono", monospace';
      ctx.fillText(`MAGNIFIED · L = 1.0 m · REAL Δy = ${this.fringeSpacingMm().toFixed(2)} mm`, 34, h - 18);
    });
  }

  private drawSignalBoard(): void {
    if (!this.signalBoard) return;
    const sep = this.num('separation');
    const wavelength = this.num('wavelength');
    const spacing = this.fringeSpacingMm();
    const dVis = this.separationVisual();
    this.signalBoard.draw((ctx, w, h) => {
      this.signalBoard.frame(ctx, '#a4ffd1', 'INTERFERENCE COMPUTER');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f0fff8';
      ctx.font = '700 47px "Space Grotesk", sans-serif';
      ctx.fillText(this.detectorOn ? 'COLLAPSED' : `${spacing.toFixed(2)} mm`, 34, 84);
      ctx.fillStyle = '#a4ffd1';
      ctx.font = '500 20px "JetBrains Mono", monospace';
      ctx.fillText(this.detectorOn ? 'PATH MEASURED — NO FRINGES' : 'BRIGHT-FRINGE SPACING Δy', 34, 122);
      ctx.fillStyle = '#d7c7ff';
      ctx.fillText(`λ ${wavelength.toFixed(0)} nm`, 34, 168);
      ctx.fillStyle = '#9fffd0';
      ctx.fillText(`d ${sep.toFixed(0)} µm`, 210, 168);
      ctx.fillStyle = '#ffd48a';
      ctx.fillText(`m = 1 order at ${Math.atan2(wavelength * 1e-9, sep * 1e-6) * 180 / Math.PI > 0 ? (Math.asin(Math.min(1, wavelength * 1e-9 / (sep * 1e-6))) * 180 / Math.PI).toFixed(1) : '—'}°`, 34, 210);
      ctx.fillStyle = 'rgba(164,255,209,0.14)';
      ctx.fillRect(34, 240, w - 68, 14);
      const count = Math.round(12 * clamp(spacing / 10, 0, 1));
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i < count ? '#a4ffd1' : 'rgba(164,255,209,0.12)';
        ctx.fillRect(34 + i * 29, 240, 17, 14);
      }
      ctx.fillStyle = this.detectorOn ? '#ff8c85' : '#e8fff4';
      ctx.font = '500 18px "JetBrains Mono", monospace';
      ctx.fillText(this.detectorOn ? 'DETECTOR ON — COMPLEMENTARITY ACTIVE' : 'DETECTOR OFF — AMPLITUDES INTERFERE', 34, 286);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText(`visual slit gap ${dVis.toFixed(2)} scene units`, 34, 318);
    });
  }

  private spawnParticle(): void {
    const slot = this.particleData.find((p) => !p.active);
    if (!slot) return;
    const index = Math.random() < 0.5 ? 0 : 1;
    slot.active = true;
    slot.t = 0;
    slot.speed = 1.0 + Math.random() * 0.35;
    slot.startX = (Math.random() - 0.5) * 0.16;
    const slitX = (Math.random() - 0.5) * 0.14;
    slot.slitX = slitX;
    slot.slitY = this.slitY(index);
    slot.landX = (Math.random() - 0.5) * (SCREEN_W - 0.8);
    slot.landY = this.sampleLandingY();
  }

  private sampleLandingY(): number {
    for (let attempt = 0; attempt < 32; attempt++) {
      const offset = (Math.random() - 0.5) * SCREEN_H;
      if (Math.random() < this.intensityAt(offset)) return SCREEN_Y + offset;
    }
    return SCREEN_Y + (Math.random() - 0.5) * 1.4;
  }

  private spawnSpark(x: number, y: number): void {
    const slot = this.sparkData.find((s) => !s.active);
    if (!slot) return;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.z = SCREEN_Z + 0.11;
    slot.life = 0.75 + Math.random() * 0.3;
    slot.maxLife = slot.life;
  }

  resetSim(): void {
    this.emitTimer = 0;
    for (const p of this.particleData) p.active = false;
    for (const s of this.sparkData) s.active = false;
    this.detectorOn = this.bool('detector');
    this.updateState();
  }

  protected onParamChange(): void {
    this.updateState();
  }

  protected onObservationStart(): void {
    this.params.detector = false;
    this.detectorOn = false;
    this.updateState();
  }

  private observationSwitch = false;

  step(dt: number): void {
    if (!this.particles) return;
    if (this.observationActive) {
      if (!this.observationSwitch && this.simTime > 6.0) {
        this.observationSwitch = true;
        this.params.detector = true;
        this.detectorOn = true;
        this.updateState();
      } else if (this.observationSwitch && this.simTime > 9.2) {
        this.observationSwitch = false;
        this.params.detector = false;
        this.detectorOn = false;
        this.updateState();
      }
    }

    this.emitTimer += dt;
    const interval = this.detectorOn ? 0.085 : 0.06;
    while (this.emitTimer > interval) {
      this.emitTimer -= interval;
      this.spawnParticle();
    }

    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    for (let i = 0; i < this.particleData.length; i++) {
      const p = this.particleData[i];
      if (!p.active) {
        matrix.makeScale(0, 0, 0);
        this.particles.setMatrixAt(i, matrix);
        continue;
      }
      p.t += dt * p.speed;
      let x: number;
      let y: number;
      let z: number;
      if (p.t < 0.42) {
        const local = p.t / 0.42;
        z = 5.0 + (SLIT_Z + 0.3 - 5.0) * local;
        y = SCREEN_Y + (p.slitY - SCREEN_Y) * local;
        x = p.startX + (p.slitX - p.startX) * local;
      } else {
        const local = clamp((p.t - 0.42) / 0.58, 0, 1);
        z = SLIT_Z + 0.3 + (SCREEN_Z + 0.1 - (SLIT_Z + 0.3)) * local;
        y = p.slitY + (p.landY - p.slitY) * local;
        x = p.slitX + (p.landX - p.slitX) * local;
      }
      pos.set(x, y, z);
      const scale = p.t < 0.42 ? 1 : 0.78 + Math.sin(p.t * Math.PI) * 0.2;
      matrix.compose(pos, new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
      this.particles.setMatrixAt(i, matrix);
      if (p.t >= 1) {
        p.active = false;
        this.spawnSpark(p.landX, p.landY);
        if (Math.random() < 0.16) this.spawnSpark(p.landX + (Math.random() - 0.5) * 0.1, p.landY + (Math.random() - 0.5) * 0.1);
      }
    }
    this.particles.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.sparkData.length; i++) {
      const spark = this.sparkData[i];
      if (!spark.active) {
        matrix.makeScale(0, 0, 0);
        this.sparks.setMatrixAt(i, matrix);
        continue;
      }
      spark.life -= dt;
      if (spark.life <= 0) {
        spark.active = false;
        matrix.makeScale(0, 0, 0);
        this.sparks.setMatrixAt(i, matrix);
        continue;
      }
      const life = spark.life / spark.maxLife;
      pos.set(spark.x, spark.y, spark.z);
      const s = 0.6 + (1 - life) * 1.6;
      matrix.compose(pos, new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      this.sparks.setMatrixAt(i, matrix);
    }
    this.sparks.instanceMatrix.needsUpdate = true;

    this.gunGlow.material.opacity = 0.28 + Math.sin(this.simTime * 9) * 0.1;
    this.screenBackGlow.material.opacity = 0.12 + (this.detectorOn ? 0.06 : 0.1) + Math.sin(this.simTime * 2) * 0.02;
    this.boardTimer += dt;
    if (this.boardTimer > 0.18) {
      this.boardTimer = 0;
      this.drawSignalBoard();
    }
  }

  isSolved(): boolean {
    if (!this.challengeArmed) return false;
    if (this.detectorOn) return false;
    if (Math.abs(this.num('wavelength') - 500) > 2.1) return false;
    return Math.abs(this.fringeSpacingMm() - 5) < 0.045;
  }

  getMetrics(): Readout[] {
    const spacing = this.fringeSpacingMm();
    const angle = Math.asin(clamp((this.num('wavelength') * 1e-9) / (this.num('separation') * 1e-6), 0, 1));
    return [
      { label: 'Wavelength', value: this.num('wavelength').toFixed(0), unit: 'nm', tone: 'cool' },
      { label: 'Slit separation', value: this.num('separation').toFixed(0), unit: 'µm' },
      { label: 'Fringe spacing', value: spacing.toFixed(2), unit: 'mm', tone: Math.abs(spacing - 5) < 0.05 ? 'accent' : 'cool' },
      { label: 'First maximum', value: (angle * 180 / Math.PI).toFixed(2), unit: '°' },
      { label: 'Detector', value: this.detectorOn ? 'WHICH-PATH ON' : 'OFF', tone: this.detectorOn ? 'danger' : 'accent' },
      { label: 'Pattern', value: this.detectorOn ? 'Two bands' : 'Interference', tone: 'muted' },
    ];
  }

  getTelemetryTargets(): TelemetryTarget[] {
    return [
      this.makeTelemetry('slit-particle', this.particles, 'Quantum particle', 9.109e-31, () => {
        const p = this.particleData.find((item) => item.active);
        const position = p
          ? new THREE.Vector3(p.slitX, p.slitY, SLIT_Z + 0.3)
          : new THREE.Vector3(0, SCREEN_Y, 4.9);
        const velocity = p
          ? new THREE.Vector3(0.25, (p.landY - p.slitY) * 2.2, -3.2)
          : new THREE.Vector3();
        return {
          position,
          velocity,
          acceleration: new THREE.Vector3(),
          extra: [
            { label: 'De Broglie λ', value: `${this.num('wavelength').toFixed(0)} nm` },
            { label: 'Path info', value: this.detectorOn ? 'known' : 'interfering' },
          ],
        };
      }),
    ];
  }

  override getVectorProbes(): VectorProbe[] {
    if (!this.particles) return [];
    return [
      {
        id: 'slit-particle',
        position: new THREE.Vector3(0, SCREEN_Y, 2.0),
        velocity: new THREE.Vector3(0, 0, -4).multiplyScalar(0.3),
        acceleration: new THREE.Vector3(0, 0, 0),
        gravity: new THREE.Vector3(0, 0, 0),
        scale: 0.7,
      },
    ];
  }

  override getGraphSample(): GraphSample {
    return {
      t: this.simTime,
      position: this.fringeSpacingMm(),
      velocity: this.num('separation'),
      ke: (HC / this.num('wavelength')),
      pe: 0,
      primaryLabel: 'Fringe spacing',
      secondaryLabel: 'Double-slit geometry',
    };
  }
}

// -----------------------------------------------------------------------------
// 6.2 — Photoelectric Vault
// -----------------------------------------------------------------------------

const photoMeta: ExperimentMeta = {
  id: 'photoelectric',
  biome: 'quantum',
  number: '6.2',
  title: 'Photoelectric Vault',
  shortTitle: 'Photoelectric Vault',
  subtitle: 'Light pays an entrance fee.',
  description:
    'Shine light on a metal plate inside a vacuum vault. Only photons above the metal’s work-function threshold free electrons; use a reverse voltage to measure their maximum kinetic energy.',
  concept:
    'Light arrives in photons of energy E = hc/λ. An electron escapes only if E exceeds the work function φ; the excess becomes kinetic energy K_max = hc/λ − φ. A stopping voltage V_s = K_max/e just halts the current.',
  realWorld:
    'Solar cells, photomultipliers, night-vision tubes, camera sensors, and the experiments that founded quantum theory all depend on the photoelectric effect.',
  formula: 'E = hf = hc/λ     ·     K_max = hc/λ − φ     ·     eV_s = K_max',
  formulaNote:
    'Intensity changes how many photons arrive per second — it changes the current, not the maximum electron energy. Wavelength determines whether any electron can escape at all.',
  badgeName: 'Quantum Gatekeeper',
  accent: '#a4ffd1',
  accentNumber: 0xa4ffd1,
  badgeGlyph: '⌁',
  controls: [
    {
      id: 'material',
      label: 'Cathode metal',
      kind: 'select',
      options: [
        { value: 'potassium', label: 'Potassium · φ = 2.30 eV' },
        { value: 'sodium', label: 'Sodium · φ = 2.28 eV' },
        { value: 'zinc', label: 'Zinc · φ = 4.30 eV' },
        { value: 'gold', label: 'Gold · φ = 5.10 eV' },
      ],
    },
    { id: 'wavelength', label: 'Light wavelength λ', kind: 'range', min: 200, max: 700, step: 5, unit: 'nm', hint: 'Red: 680nm (no emission), Green: 530nm, Blue: 450nm, UV: 250nm' },
    { id: 'intensity', label: 'Beam intensity', kind: 'range', min: 10, max: 100, step: 5, unit: '%' },
    { id: 'bias', label: 'Anode voltage', kind: 'range', min: -3, max: 1, step: 0.01, unit: 'V', hint: 'Negative values oppose the electrons: this is the stopping-voltage setting.' },
  ],
  defaults: { material: 'potassium', wavelength: 450, intensity: 70, bias: 0 },
  observeParams: { material: 'potassium', wavelength: 560, intensity: 75, bias: 0 },
  observeCues: [
    { at: 0.1, text: 'The lamp starts at 560 nm. Potassium needs 2.30 eV to release an electron; this green photon carries only 2.21 eV.' },
    { at: 2.3, text: 'The wavelength steps to 540 nm. The photons are more energetic, but at 2.30 eV they still sit just below the threshold.' },
    { at: 4.4, text: 'Still no electrons. Brightness only sends more photons — it cannot raise the energy of each one above the work function.' },
    { at: 5.4, text: 'Now the lamp drops to 450 nm. Each photon carries 2.76 eV, and electrons begin to cross the gap.' },
    { at: 7.6, text: 'At 350 nm the photons carry 3.54 eV. The extra 1.24 eV appears as faster electrons, not as more current per photon.' },
  ],
  challenge: {
    title: 'The Stopping Potential',
    brief:
      'Use 400 nm light on potassium. Set the reverse (anode) voltage to exactly the stopping potential so the current just falls to zero.',
    hint: 'E = 1240/400 = 3.10 eV. Potassium has φ = 2.30 eV, so K_max = 0.80 eV and the stopping voltage is −0.80 V.',
    success: 'The current flatlines at −0.80 V. The battery has precisely cancelled the maximum photoelectron energy.',
    targetLabel: 'K · λ = 400 nm · V = −0.80 V',
  },
  chart: {
    title: 'Photoelectron energy',
    positionLabel: 'Maximum kinetic energy (eV)',
    velocityLabel: 'Electron speed (a.u.)',
    energyLabel: 'Photon energy (eV)',
  },
};

interface PhotonPacket {
  active: boolean;
  x: number;
  y: number;
  z: number;
  phase: number;
  speed: number;
  jitter: number;
}

interface ElectronPacket {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  age: number;
  hitAnode: boolean;
}

const CATHODE_X = -2.95;
const ANODE_X = 3.15;

export class PhotoelectricExperiment extends Experiment {
  private cathode!: THREE.Mesh;
  private cathodeLabel!: THREE.Sprite;
  private lamp!: THREE.Group;
  private lampGlow!: THREE.Sprite;
  private photons!: THREE.InstancedMesh;
  private photonData: PhotonPacket[] = [];
  private electrons!: THREE.InstancedMesh;
  private electronData: ElectronPacket[] = [];
  private meterBoard!: CanvasBoard;
  private meterTimer = 0;
  private current = 0;
  private kmax = 0;
  private photonEnergy = 0;
  private stopping = 0;
  private beamOn = true;
  private emissionFlash = 0;
  private ammeterLamp!: THREE.Mesh;
  private ammeterGlow!: THREE.Sprite;
  private cathodeGlow!: THREE.Sprite;
  private fieldPlane!: THREE.Mesh;
  private chargeSymbols: THREE.Sprite[] = [];
  private beamTimer = 0;
  private photonPhase = 0;
  private lastMaterial = '';
  private beamLine!: THREE.Line;
  private emissionCount = 0;
  private meterNeedle!: THREE.Group;
  private lightColor = new THREE.Color(0x68f0d1);

  constructor() {
    super(photoMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 14.5, height: 5.4, targetHeight: 2.8 };
  }

  buildVisual(): void {
    const group = this.visualRoot;
    group.add(meshBox(16, 0.36, 8.2, 0x0e211d, { position: [0, 0.18, 0] }));
    group.add(meshBox(15.3, 0.08, 7.6, 0x1b3a31, { position: [0, 0.4, 0] }));

    // Vacuum chamber.
    const tube = glassBox(9.4, 3.7, 3.3, 0x9ef6e4, 0.07);
    tube.position.set(0.35, 2.9, 0);
    group.add(tube);
    for (const x of [-4.55, 5.25]) {
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(1.72, 0.11, 8, 32),
        new THREE.MeshStandardMaterial({ color: 0x5d7e73, metalness: 0.75, roughness: 0.3 }),
      );
      rim.rotation.y = Math.PI / 2;
      rim.position.set(x, 2.9, 0);
      group.add(rim);
    }
    for (const z of [-1.66, 1.66]) {
      group.add(meshBox(9.4, 0.16, 0.16, 0x7da99b, { position: [0.35, 4.77, z], metalness: 0.55, roughness: 0.35 }));
      group.add(meshBox(9.4, 0.16, 0.16, 0x7da99b, { position: [0.35, 1.03, z], metalness: 0.55, roughness: 0.35 }));
    }
    // Support girders and warning stripes.
    for (const x of [-4.9, 4.9]) {
      group.add(meshBox(0.5, 1.5, 4.1, 0x29433a, { position: [x, 0.93, 0] }));
      group.add(meshBox(0.6, 0.12, 4.25, 0xd4b273, { position: [x, 1.62, 0] }));
    }

    // Cathode plate (front face toward the light).
    this.cathode = meshBox(0.16, 2.3, 2.0, 0xcbb6da, {
      position: [CATHODE_X, 2.9, 0],
      metalness: 0.55,
      roughness: 0.35,
      emissive: 0x76618d,
      emissiveIntensity: 0.2,
    });
    group.add(this.cathode);
    group.add(meshBox(0.4, 2.6, 2.3, 0x483e58, { position: [CATHODE_X - 0.25, 2.9, 0], metalness: 0.5, roughness: 0.4 }));
    this.cathodeLabel = makeTextLabel('CATHODE', 'WORK FUNCTION METAL', '#d9c8ff', { width: 700, height: 220 });
    this.cathodeLabel.scale.set(2.7, 0.84, 1);
    this.cathodeLabel.position.set(CATHODE_X, 4.65, 0.1);
    group.add(this.cathodeLabel);
    this.cathodeGlow = this.addStaticGlow([CATHODE_X + 0.15, 2.9, 0], '#cfb4ff', 2.6, 0.22);

    // Anode grid.
    group.add(meshBox(0.18, 2.7, 2.6, 0x3e5b51, { position: [ANODE_X, 2.9, 0], metalness: 0.55, roughness: 0.35 }));
    for (let i = 0; i < 5; i++) {
      group.add(meshBox(0.06, 2.35, 0.06, 0x9ed7c5, { position: [ANODE_X + 0.08, 2.9, -0.95 + i * 0.475], glow: true, opacity: 0.45 }));
    }
    addStationSign(group, 'ANODE GRID', 'COLLECTS PHOTOELECTRONS', '#a4ffd1', [ANODE_X, 4.65, 0.1], 2.7);

    // Field tint between plates.
    this.fieldPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(ANODE_X - CATHODE_X - 0.4, 3.2),
      new THREE.MeshBasicMaterial({
        color: 0x7f9bff,
        transparent: true,
        opacity: 0.045,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.fieldPlane.rotation.y = Math.PI / 2;
    this.fieldPlane.position.set((CATHODE_X + ANODE_X) / 2, 2.9, 0);
    group.add(this.fieldPlane);
    for (let i = 0; i < 8; i++) {
      const pos = [
        THREE.MathUtils.lerp(CATHODE_X + 0.5, ANODE_X - 0.4, (i % 4) / 3),
        1.55 + Math.floor(i / 4) * 2.6,
        0,
      ] as [number, number, number];
      const symbol = makeTextLabel(i < 4 ? '−' : '+', i < 4 ? 'field' : 'field', i < 4 ? '#8c9cff' : '#ffb36b', { width: 160, height: 160, border: false, background: 'rgba(0,0,0,0)' });
      symbol.scale.set(0.6, 0.6, 1);
      symbol.position.set(...pos);
      group.add(symbol);
      this.chargeSymbols.push(symbol);
    }

    // UV / visible lamp.
    this.lamp = new THREE.Group();
    this.lamp.position.set(-7.1, 3.2, 0);
    group.add(this.lamp);
    this.lamp.add(meshBox(0.7, 0.9, 0.9, 0x39493f, { position: [0, 0, 0], metalness: 0.45, roughness: 0.4 }));
    this.lamp.add(meshBox(0.35, 0.5, 0.5, 0xedf4e9, { position: [0.48, 0, 0], glow: true, opacity: 0.9 }));
    this.lamp.add(meshBox(0.9, 0.22, 1.4, 0x53484a, { position: [-0.1, -0.4, 0] }));
    this.lamp.add(meshBox(0.15, 1.4, 0.15, 0x6b7b70, { position: [-0.2, -1.2, 0] }));
    this.lampGlow = this.addStaticGlow([-6.55, 3.2, 0], '#68f0d1', 3.2, 0.35);
    addStationSign(group, 'TUNABLE LAMP', 'WAVELENGTH SELECTOR · hc/λ', '#a4ffd1', [-7.1, 5.0, 1.5], 2.9);

    // Beam and streams.
    this.beamLine = makeLine(
      [new THREE.Vector3(-6.3, 3.2, 0), new THREE.Vector3(CATHODE_X - 0.12, 2.9, 0)],
      0x68f0d1,
      0.28,
    );
    group.add(this.beamLine);

    this.photons = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.055, 0.055, 0.22),
      new THREE.MeshBasicMaterial({ color: 0x68f0d1, transparent: true, opacity: 0.9, toneMapped: false }),
      26,
    );
    this.photons.frustumCulled = false;
    group.add(this.photons);
    for (let i = 0; i < 26; i++) {
      this.photonData.push({
        active: false,
        x: -6.3,
        y: 3.2,
        z: 0,
        phase: Math.random(),
        speed: 0.85 + Math.random() * 0.3,
        jitter: 0,
      });
    }

    this.electrons = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.06, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xb7ffdf, transparent: true, opacity: 0.95, toneMapped: false }),
      28,
    );
    this.electrons.frustumCulled = false;
    group.add(this.electrons);
    for (let i = 0; i < 28; i++) {
      this.electronData.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, age: 0, hitAnode: false });
    }

    // Current meter tower.
    this.meterBoard = new CanvasBoard(3.7, 2.2, 560, 334);
    this.meterBoard.mesh.position.set(5.0, 4.8, 2.15);
    this.meterBoard.mesh.rotation.y = 0.05;
    group.add(this.meterBoard.mesh);
    group.add(meshBox(0.22, 3.7, 0.22, 0x5b4b40, { position: [5.0, 2.65, 1.9] }));
    this.meterNeedle = new THREE.Group();
    this.meterNeedle.position.set(6.3, 3.6, 1.1);
    group.add(this.meterNeedle);
    const dial = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 32),
      new THREE.MeshBasicMaterial({ color: 0x17251f, transparent: true, opacity: 0.88, side: THREE.DoubleSide }),
    );
    dial.position.z = -0.05;
    this.meterNeedle.add(dial);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.04, 0.06, 6, 40),
      new THREE.MeshStandardMaterial({ color: Q.brass, metalness: 0.8, roughness: 0.3 }),
    );
    this.meterNeedle.add(rim);
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI * 0.8 + (i / 10) * Math.PI * 1.6;
      this.meterNeedle.add(
        meshBox(0.03, i % 5 === 0 ? 0.2 : 0.11, 0.03, 0xe4e0c7, {
          position: [Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0.02],
          rotation: [0, 0, a - Math.PI / 2],
          glow: true,
          opacity: 0.7,
        }),
      );
    }
    const needle = meshBox(0.035, 0.68, 0.035, 0xff756f, { position: [0, 0.3, 0.05], glow: true, opacity: 0.95 });
    this.meterNeedle.add(needle);
    addStationSign(group, 'A', 'PHOTOELECTRIC CURRENT', '#ffd48a', [6.3, 5.15, 1.1], 1.6);

    // Battery stack.
    group.add(meshBox(1.2, 0.2, 1.3, 0x4c3d36, { position: [5.6, 0.5, -1.6] }));
    for (let i = 0; i < 4; i++) {
      group.add(meshBox(1.06, 0.28, 1.12, i % 2 ? 0x6f5862 : 0x3d4f4a, { position: [5.6, 0.73 + i * 0.32, -1.6] }));
    }
    addStationSign(group, 'STOPPING BATTERY', 'REVERSE BIAS V', '#ffd48a', [5.6, 2.5, -0.6], 2.5);
    group.add(meshBox(0.08, 0.08, 1.5, 0x8e8078, { position: [5.6, 1.4, -0.7] }));
    group.add(meshBox(0.8, 0.08, 0.08, 0x8e8078, { position: [5.2, 1.4, -0.1] }));

    // Current lamp.
    this.ammeterLamp = meshBox(0.32, 0.32, 0.32, 0xffd48a, {
      position: [4.0, 5.7, 0],
      glow: true,
      opacity: 0.4,
    });
    group.add(this.ammeterLamp);
    this.ammeterGlow = this.addStaticGlow([4.0, 5.7, 0], '#ffd48a', 2.2, 0.12);

    addStationSign(group, 'PHOTOELECTRIC VAULT', 'E = hf · K_max = hf − φ', '#a4ffd1', [0, 7.9, -2.8], 5.5);
    this.addLight('#72ffd3', 1.4, 13, [-2.4, 3.2, 2.4]);
    this.addLight('#ffd18a', 0.85, 9, [5.4, 3.4, 2.2]);
    this.addLight('#b77dff', 0.8, 12, [0, 3.8, -2.5]);

    this.beamOn = true;
    this.refreshPhysics();
    this.drawMeter();
    this.updateCathode();
  }

  private material() {
    return MATERIALS[this.str('material')] ?? MATERIALS.potassium;
  }

  private computePhysics(): void {
    const mat = this.material();
    this.photonEnergy = HC / Math.max(1, this.num('wavelength'));
    this.kmax = Math.max(0, this.photonEnergy - mat.work);
    this.stopping = this.kmax;
    const bias = this.num('bias');
    const drive = Math.max(0, this.kmax + bias);
    this.current = this.beamOn && this.kmax > 0.0001
      ? (this.num('intensity') / 100) * 8 * Math.sqrt(clamp(drive / Math.max(0.02, this.kmax), 0, 1))
      : 0;
  }

  private refreshPhysics(): void {
    this.computePhysics();
    this.updateCathode();
    this.drawMeter();
    this.updateBeamVisual();
  }

  private updateCathode(): void {
    if (!this.cathode) return;
    const mat = this.material();
    const material = this.cathode.material as THREE.MeshStandardMaterial;
    material.color.setHex(mat.color);
    const energized = this.beamOn && this.kmax > 0;
    material.emissiveIntensity = energized ? 0.55 : 0.16;
    material.emissive.setHex(energized ? 0x79ffd2 : 0x574c73);
    this.cathodeGlow.material.color.set(energized ? '#a4ffd1' : '#cfb4ff');
    this.cathodeGlow.material.opacity = energized ? 0.5 : 0.18;
    this.lampGlow.material.opacity = this.beamOn ? 0.4 + Math.sin(this.simTime * 4) * 0.06 : 0.05;
    (this.lamp.children[1] as THREE.Mesh).visible = this.beamOn;
    this.lightColor = wavelengthColor(this.num('wavelength'));
    const lampMat = (this.lamp.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    if (lampMat && 'color' in lampMat) lampMat.color.copy(this.lightColor);
    this.lampGlow.material.color.copy(this.lightColor);
    (this.beamLine.material as THREE.LineBasicMaterial).color.copy(this.lightColor);
    if (this.photons) (this.photons.material as THREE.MeshBasicMaterial).color.copy(this.lightColor);
    if (this.electrons) (this.electrons.material as THREE.MeshBasicMaterial).color.copy(new THREE.Color(0xb7ffdf));
    this.cathodeLabel.visible = true;
    const fieldMat = this.fieldPlane.material as THREE.MeshBasicMaterial;
    fieldMat.color.setHex(this.num('bias') < 0 ? 0x7f9bff : 0xffb36b);
    fieldMat.opacity = 0.035 + Math.abs(this.num('bias')) * 0.015;
    this.chargeSymbols.forEach((symbol, index) => {
      symbol.visible = Math.abs(this.num('bias')) > 0.02;
      if (index < 4) symbol.visible = this.num('bias') < 0;
      else symbol.visible = this.num('bias') > 0;
    });
  }

  private updateBeamVisual(): void {
    if (!this.beamLine) return;
    (this.beamLine.material as THREE.LineBasicMaterial).opacity = this.beamOn ? 0.2 + Math.sin(this.simTime * 7) * 0.05 : 0.03;
    for (const p of this.photonData) p.active = this.beamOn;
  }

  resetSim(): void {
    this.beamOn = true;
    this.photonPhase = 0;
    this.lastMaterial = '';
    for (const p of this.photonData) {
      p.active = true;
      p.phase = Math.random();
    }
    for (const e of this.electronData) e.active = false;
    this.refreshPhysics();
  }

  protected onParamChange(id: string): void {
    this.computePhysics();
    if (id === 'material') this.updateCathode();
    this.updateCathode();
    this.drawMeter();
    this.updateBeamVisual();
  }

  protected onObservationStart(): void {
    this.beamOn = true;
    this.params.wavelength = 560;
    this.params.bias = 0;
    this.computePhysics();
    this.updateCathode();
    this.drawMeter();
    this.updateBeamVisual();
  }

  triggerPrimaryAction(): void {
    this.beamOn = !this.beamOn;
    this.computePhysics();
    this.updateCathode();
    this.drawMeter();
    this.updateBeamVisual();
    this.labelCue(this.beamOn ? 'Photon beam open. Watch the cathode for emission.' : 'Photon beam blocked. The current falls to zero.');
  }

  getPrimaryActionLabel(): string | null {
    return this.beamOn ? 'BLOCK LIGHT BEAM' : 'EMIT LIGHT BEAM';
  }

  getPrimaryActionHint(): string {
    return 'Toggle the lamp to isolate the photoelectric response.';
  }

  step(dt: number): void {
    if (!this.photons) return;
    if (this.observationActive) {
      let target = 560;
      if (this.simTime > 2.6 && this.simTime <= 5.2) target = 540;
      else if (this.simTime > 5.2 && this.simTime <= 7.4) target = 450;
      else if (this.simTime > 7.4) target = 350;
      const snapped = Math.round(target / 5) * 5;
      if (snapped !== this.num('wavelength')) {
        this.params.wavelength = snapped;
        this.computePhysics();
        this.updateCathode();
        this.drawMeter();
      }
    }

    this.computePhysics();
    if (this.ammeterLamp) {
      const lit = clamp(this.current / 4, 0, 1);
      (this.ammeterLamp.material as THREE.MeshBasicMaterial).opacity = 0.25 + lit * 0.75;
      this.ammeterLamp.scale.setScalar(1 + lit * 0.4);
      this.ammeterGlow.material.opacity = 0.06 + lit * 0.42;
      this.ammeterGlow.scale.setScalar(1.2 + lit * 2.2);
    }
    if (this.meterNeedle) {
      const fraction = clamp(this.current / 8, 0, 1);
      this.meterNeedle.rotation.z = -Math.PI * 0.8 + fraction * Math.PI * 1.6;
    }
    this.emissionFlash = Math.max(0, this.emissionFlash - dt * 2.5);
    this.cathodeGlow.material.opacity = (this.kmax > 0 ? 0.42 : 0.16) + this.emissionFlash * 0.4;

    this.updatePhotonStream(dt);
    this.updateElectronStream(dt);

    this.meterTimer += dt;
    if (this.meterTimer > 0.16) {
      this.meterTimer = 0;
      this.drawMeter();
    }
  }

  private updatePhotonStream(dt: number): void {
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3(1, 1, 1);
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const visible = Math.round((this.num('intensity') / 100) * 22);
    for (let i = 0; i < this.photonData.length; i++) {
      const photon = this.photonData[i];
      if (!this.beamOn || i >= visible) {
        matrix.makeScale(0, 0, 0);
        this.photons.setMatrixAt(i, matrix);
        continue;
      }
      photon.phase += dt * photon.speed;
      if (photon.phase > 1) {
        photon.phase = 0;
        photon.y = 2.9 + (Math.random() - 0.5) * 0.9;
        photon.z = (Math.random() - 0.5) * 0.9;
        if (this.kmax > 0) {
          this.emissionFlash = Math.min(1, this.emissionFlash + 0.06);
          if (Math.random() < 0.22 * (this.num('intensity') / 100)) this.spawnElectron();
        }
      }
      const x = -6.3 + photon.phase * (CATHODE_X - 0.18 + 6.3);
      const y = photon.y + Math.sin(photon.phase * 12 + i) * 0.05;
      const z = photon.z + Math.cos(photon.phase * 9 + i * 0.7) * 0.05;
      pos.set(x, y, z);
      matrix.compose(pos, quat, scale);
      this.photons.setMatrixAt(i, matrix);
    }
    this.photons.instanceMatrix.needsUpdate = true;
    (this.photons.material as THREE.MeshBasicMaterial).opacity = 0.5 + (this.num('intensity') / 100) * 0.45;
  }

  private spawnElectron(): void {
    const slot = this.electronData.find((e) => !e.active);
    if (!slot || this.kmax <= 0.001) return;
    slot.active = true;
    slot.x = CATHODE_X + 0.12;
    slot.y = 2.9 + (Math.random() - 0.5) * 1.65;
    slot.z = (Math.random() - 0.5) * 1.5;
    // Energy spectrum capped strictly by K_max (Fermi-Dirac distribution)
    const energyFraction = 0.25 + Math.random() * 0.75;
    slot.vx = Math.sqrt(this.kmax * energyFraction);
    slot.vy = (Math.random() - 0.5) * 0.25;
    slot.age = 0;
    slot.hitAnode = false;
  }

  private updateElectronStream(dt: number): void {
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    for (let i = 0; i < this.electronData.length; i++) {
      const e = this.electronData[i];
      if (!e.active) {
        matrix.makeScale(0, 0, 0);
        this.electrons.setMatrixAt(i, matrix);
        continue;
      }
      e.age += dt;
      const accel = this.num('bias') * 0.082;
      e.vx += accel * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.y = clamp(e.y, 1.35, 4.45);
      e.z = clamp(e.z, -1.4, 1.4);
      if (e.x >= ANODE_X - 0.1) {
        e.active = false;
        e.hitAnode = true;
        this.emissionCount++;
      } else if (e.x < CATHODE_X + 0.05 && e.vx < 0) {
        e.active = false;
      } else if (e.age > 5.5) {
        e.active = false;
      }
      pos.set(e.x, e.y, e.z);
      matrix.compose(pos, quat, new THREE.Vector3(1, 1, 1));
      this.electrons.setMatrixAt(i, matrix);
    }
    this.electrons.instanceMatrix.needsUpdate = true;
  }

  private drawMeter(): void {
    if (!this.meterBoard) return;
    const mat = this.material();
    const bias = this.num('bias');
    this.meterBoard.draw((ctx, w, h) => {
      this.meterBoard.frame(ctx, '#a4ffd1', 'PHOTOELECTRIC ANALYSER');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f1fff8';
      ctx.font = '700 44px "Space Grotesk", sans-serif';
      ctx.fillText(`${this.current.toFixed(2)} mA`, 34, 76);
      ctx.fillStyle = '#a4ffd1';
      ctx.font = '500 18px "JetBrains Mono", monospace';
      ctx.fillText(this.beamOn ? 'BEAM ON' : 'BEAM BLOCKED', 34, 112);
      ctx.fillStyle = '#d8c7ff';
      ctx.fillText(`E ${this.photonEnergy.toFixed(2)} eV`, 34, 154);
      ctx.fillStyle = '#ffd48a';
      ctx.fillText(`φ ${mat.work.toFixed(2)} eV`, 232, 154);
      ctx.fillStyle = this.kmax > 0 ? '#a4ffd1' : '#ff8c85';
      ctx.fillText(`Kmax ${this.kmax.toFixed(2)} eV`, 34, 192);
      ctx.fillStyle = '#e6f5ed';
      ctx.fillText(`Vs ${this.kmax > 0 ? `−${this.stopping.toFixed(2)}` : '—'} V`, 232, 192);
      ctx.fillStyle = 'rgba(164,255,209,0.14)';
      ctx.fillRect(34, 226, w - 68, 16);
      ctx.fillStyle = this.current > 0.05 ? '#a4ffd1' : '#ff8c85';
      ctx.fillRect(34, 226, (w - 68) * clamp(this.current / 8, 0, 1), 16);
      ctx.fillStyle = '#cfbfb0';
      ctx.font = '500 17px "JetBrains Mono", monospace';
      ctx.fillText(`λ ${this.num('wavelength').toFixed(0)} nm · I ${this.num('intensity').toFixed(0)}% · bias ${bias >= 0 ? '+' : ''}${bias.toFixed(2)} V`, 34, 278);
      ctx.fillStyle = this.kmax > 0 ? '#a4ffd1' : '#ff8c85';
      ctx.fillText(this.kmax > 0 ? `PHOTOEMISSION ACTIVE · ${this.emissionCount} ELECTRONS COLLECTED` : 'BELOW THRESHOLD · NO EMISSION', 34, 312);
    });
  }

  isSolved(): boolean {
    if (!this.challengeArmed || !this.beamOn) return false;
    if (this.str('material') !== 'potassium') return false;
    if (Math.abs(this.num('wavelength') - 400) > 3) return false;
    if (Math.abs(this.num('bias') + 0.8) > 0.031) return false;
    return this.current < 0.3 && this.kmax > 0.7;
  }

  getMetrics(): Readout[] {
    const mat = this.material();
    const bias = this.num('bias');
    return [
      { label: 'Cathode', value: mat.label, unit: `φ ${mat.work.toFixed(2)} eV`, tone: 'warm' },
      { label: 'Photon energy', value: this.photonEnergy.toFixed(2), unit: 'eV', tone: 'cool' },
      { label: 'Maximum KE', value: this.kmax.toFixed(2), unit: 'eV', tone: this.kmax > 0 ? 'accent' : 'danger' },
      { label: 'Stopping potential', value: this.kmax > 0 ? `−${this.stopping.toFixed(2)}` : '—', unit: 'V' },
      { label: 'Applied bias', value: `${bias >= 0 ? '+' : ''}${bias.toFixed(2)}`, unit: 'V' },
      { label: 'Current', value: this.current.toFixed(2), unit: 'mA', tone: this.current > 0.05 ? 'accent' : 'muted' },
      { label: 'Emission', value: this.kmax > 0 ? 'YES' : 'NO', tone: this.kmax > 0 ? 'accent' : 'danger' },
    ];
  }

  getTelemetryTargets(): TelemetryTarget[] {
    return [
      this.makeTelemetry('photoelectron', this.electrons, 'Photoelectron', 9.109e-31, () => {
        const e = this.electronData.find((item) => item.active);
        return {
          position: e ? new THREE.Vector3(e.x, e.y, e.z) : new THREE.Vector3(CATHODE_X + 0.3, 2.9, 0),
          velocity: e ? new THREE.Vector3(e.vx, e.vy, 0) : new THREE.Vector3(),
          acceleration: new THREE.Vector3(this.num('bias') * 0.082, 0, 0),
          extra: [
            { label: 'Photon energy', value: `${this.photonEnergy.toFixed(2)} eV` },
            { label: 'Work function', value: `${this.material().work.toFixed(2)} eV` },
            { label: 'Kmax', value: `${this.kmax.toFixed(2)} eV` },
          ],
        };
      }),
    ];
  }

  override getVectorProbes(): VectorProbe[] {
    if (!this.electrons) return [];
    const e = this.electronData.find((item) => item.active);
    const pos = e ? new THREE.Vector3(e.x, e.y, e.z) : new THREE.Vector3(CATHODE_X + 0.3, 2.9, 0);
    return [
      {
        id: 'photoelectron',
        position: pos,
        velocity: e ? new THREE.Vector3(e.vx, e.vy, 0).multiplyScalar(0.7) : new THREE.Vector3(),
        acceleration: new THREE.Vector3(this.num('bias') * 0.082, 0, 0),
        gravity: new THREE.Vector3(0, 0, 0),
        scale: 0.6,
      },
    ];
  }

  override getGraphSample(): GraphSample {
    return {
      t: this.simTime,
      position: this.kmax,
      velocity: Math.sqrt(Math.max(0, this.kmax)),
      ke: this.photonEnergy,
      pe: this.material().work,
      primaryLabel: 'Maximum kinetic energy',
      secondaryLabel: 'Photon energy vs work function',
    };
  }
}
