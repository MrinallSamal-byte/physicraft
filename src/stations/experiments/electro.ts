import * as THREE from 'three';
import { Experiment } from '../BaseExperiment';
import type { ExperimentMeta, GraphSample, Readout, TelemetryTarget, VectorProbe } from '../types';
import type { EnvironmentState } from '../../config';
import { meshBox } from '../../world/voxel';
import { makeReadoutTexture, makeTextLabel } from '../../world/labels';
import { clamp } from '../../core/utils';

const E = {
  steel: 0x344650,
  steelLight: 0x6d8794,
  dark: 0x09151d,
  copper: 0xc87648,
  brass: 0xe0b468,
  cyan: 0x5ee8ff,
  blue: 0x728cff,
  violet: 0xa276ff,
  wire: 0x26333a,
  gold: 0xffdc85,
  red: 0xff6e56,
};

function addSign(
  parent: THREE.Object3D,
  title: string,
  subtitle: string,
  accent: string,
  position: [number, number, number],
  size = 2.7,
): THREE.Mesh {
  const texture = makeReadoutTexture([`#${title}`, subtitle], accent, 900, 300);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size / 3),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
  );
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function line(points: THREE.Vector3[], color: number, opacity = 0.6): THREE.Line {
  const mesh = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, toneMapped: false }),
  );
  return mesh;
}

// -----------------------------------------------------------------------------
// 3.1 — Ohm's Law Interactive River
// -----------------------------------------------------------------------------

const ohmMeta: ExperimentMeta = {
  id: 'ohm',
  biome: 'electro',
  number: '3.1',
  title: "Ohm's Law Interactive River",
  shortTitle: "Ohm's River",
  subtitle: 'Voltage is a drop. Current is a flow.',
  description:
    'Raise the charge reservoir to push a stronger current through a narrowable resistor gate. Watch the glowing electron orbs speed up as the gate heats.',
  concept: 'Current is the rate of charge flow. For a fixed resistance, doubling voltage doubles current. The resistor’s power dissipation is P = I²R = VI.',
  realWorld: 'Every phone charger, motor controller, and LED circuit is a negotiation between voltage, current, and heat. Ohm’s law is the ledger.',
  formula: 'I = V/R     ·     P = I²R = VI',
  formulaNote: 'The resistor heats at P watts. Narrowing the gate increases resistance; the same voltage drop then produces less current and more heat per unit charge.',
  badgeName: 'Circuit Whisperer',
  accent: '#72caff',
  accentNumber: 0x72caff,
  badgeGlyph: 'Ω',
  controls: [
    { id: 'voltage', label: 'Charge-pump height (V)', kind: 'range', min: 1, max: 24, step: 1, unit: 'V' },
    { id: 'resistance', label: 'Resistance gate (R)', kind: 'range', min: 2, max: 40, step: 0.5, unit: 'Ω' },
  ],
  defaults: { voltage: 9, resistance: 12 },
  observeParams: { voltage: 12, resistance: 12 },
  observeCues: [
    { at: 0.1, text: 'The left tower is the charge pump. Its height is voltage: the electrical pressure pushing charge around the loop.' },
    { at: 2.3, text: 'The glowing orbs are charge carriers. Their flow rate is current, measured in amperes.' },
    { at: 4.5, text: 'Now watch the gate narrow. Resistance rises, the flow slows, and the bottleneck heats up.' },
    { at: 6.5, text: 'I = V/R. The circuit trades pressure for flow through a resistance — and dissipates the difference as heat.' },
  ],
  challenge: {
    title: 'Exactly Half an Amp',
    brief: 'Use a 12 V source and tune the resistor so the current is exactly 0.50 A.',
    hint: 'Ohm’s law gives R = V/I. With V = 12 V and I = 0.50 A, the gate should be 24 Ω.',
    success: 'The river settles at half an ampere. V = IR, and the resistor tells the rest.',
    targetLabel: 'V = 12 V · I = 0.50 A',
  },
  chart: {
    title: 'Circuit response',
    positionLabel: 'Current (A)',
    velocityLabel: 'Flow speed',
    energyLabel: 'Power (W)',
  },
};

const OHM_LOOP = [
  new THREE.Vector3(-4.2, 0.9, -2.0),
  new THREE.Vector3(4.2, 0.9, -2.0),
  new THREE.Vector3(4.2, 0.9, 2.0),
  new THREE.Vector3(-4.2, 0.9, 2.0),
];

export class OhmExperiment extends Experiment {
  private orbs!: THREE.InstancedMesh;
  private orbParams: number[] = [];
  private sourceFill!: THREE.Mesh;
  private sourceGlow!: THREE.Sprite;
  private gates: THREE.Mesh[] = [];
  private gateGlow!: THREE.Sprite;
  private bulb!: THREE.Mesh;
  private bulbGlow!: THREE.Sprite;
  private bulbLight!: THREE.PointLight;
  private current = 0;
  private power = 0;
  private elapsedFlow = 0;
  private loopLength = 0;

  constructor() {
    super(ohmMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 12.5, height: 5.5, targetHeight: 2.0 };
  }

  buildVisual(): void {
    const group = this.visualRoot;
    group.add(meshBox(11.5, 0.34, 7.5, 0x16272e, { position: [0, 0.17, 0] }));
    group.add(meshBox(10.8, 0.08, 6.8, 0x293f47, { position: [0, 0.38, 0] }));

    // Reservoir tower.
    group.add(meshBox(1.8, 5.2, 2.4, 0x182a31, { position: [-4.5, 2.8, 0], opacity: 1 }));
    group.add(meshBox(1.4, 4.8, 2.0, 0x263f49, { position: [-4.5, 2.75, 0] }));
    this.sourceFill = meshBox(1.15, 1.8, 1.7, E.cyan, {
      position: [-4.5, 1.5, 0],
      transparent: true,
      opacity: 0.35,
      glow: true,
    });
    group.add(this.sourceFill);
    this.sourceGlow = this.addStaticGlow([-4.5, 5.4, 0], '#66e7ff', 3.4, 0.3);
    addSign(group, 'VOLTAGE', 'CHARGE-PUMP HEIGHT', '#86eaff', [-4.5, 5.9, 0.5], 2.6);
    for (let i = 0; i < 5; i++) {
      group.add(meshBox(0.42, 0.035, 0.08, 0xa4ddec, { position: [-5.05, 1 + i * 0.8, 1.02], opacity: 0.5 }));
    }

    // Rectangular channel.
    for (let i = 0; i < OHM_LOOP.length; i++) {
      const a = OHM_LOOP[i];
      const b = OHM_LOOP[(i + 1) % OHM_LOOP.length];
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const length = a.distanceTo(b);
      const angle = Math.atan2(b.x - a.x, b.z - a.z);
      group.add(meshBox(0.85, 0.35, length + 0.4, 0x1c3038, { position: [mid.x, 0.42, mid.z], rotation: [0, angle, 0] }));
      group.add(meshBox(0.12, 0.08, length - 0.5, 0x63ddf3, {
        position: [mid.x, 0.62, mid.z],
        rotation: [0, angle, 0],
        glow: true,
        opacity: 0.45,
      }));
      group.add(meshBox(0.35, 0.95, 0.35, 0x263c44, { position: [a.x, 0.85, a.z] }));
      this.loopLength += length;
    }
    for (let i = 0; i < OHM_LOOP.length; i++) {
      const a = OHM_LOOP[i];
      const b = OHM_LOOP[(i + 1) % OHM_LOOP.length];
      const count = 7;
      for (let j = 0; j < count; j++) {
        const t = j / count;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        group.add(meshBox(0.045, 0.24, 0.045, 0x8ce4ef, { position: [x, 0.64, z], opacity: 0.25 }));
      }
    }

    // Electron orb instances travel around the loop.
    const count = 22;
    this.orbs = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.12, 1),
      new THREE.MeshBasicMaterial({ color: 0x92f4ff, toneMapped: false }),
      count,
    );
    this.orbs.castShadow = false;
    group.add(this.orbs);
    for (let i = 0; i < count; i++) this.orbParams.push(i / count);

    // Resistor gate.
    for (let i = 0; i < 2; i++) {
      const gate = meshBox(1.3, 1.3, 0.48, 0x59646a, {
        position: [4.2 + (i === 0 ? -0.85 : 0.85), 1.0, 0],
        metalness: 0.55,
        roughness: 0.35,
        emissive: E.red,
        emissiveIntensity: 0.1,
      });
      this.gates.push(gate);
      group.add(gate);
    }
    group.add(meshBox(2.4, 0.16, 1.2, 0x243740, { position: [4.2, 0.45, 0] }));
    this.gateGlow = this.addStaticGlow([4.2, 1.1, 0], '#ff7a5d', 2.6, 0.2);
    addSign(group, 'RESISTANCE', 'NARROW GATE = MORE Ω', '#ff9b7e', [4.2, 2.8, 0.1], 2.6);

    // Bulb tower.
    group.add(meshBox(0.23, 3.6, 0.23, E.steelLight, { position: [0, 2.2, 0.1] }));
    this.bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 12, 10),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        emissive: E.gold,
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 0.65,
        roughness: 0.1,
        transmission: 0.2,
      }),
    );
    this.bulb.position.set(0, 4.3, 0.1);
    group.add(this.bulb);
    group.add(meshBox(0.5, 0.18, 0.5, E.brass, { position: [0, 3.96, 0.1] }));
    this.bulbGlow = this.addStaticGlow([0, 4.3, 0.1], '#ffd57b', 2.8, 0.15);
    this.bulbLight = new THREE.PointLight(0xffce75, 0.4, 8, 2);
    this.bulbLight.position.set(0, 4.3, 0.4);
    group.add(this.bulbLight);
    addSign(group, 'OHM’S RIVER', 'I = V / R · CHARGE IN MOTION', '#72caff', [0, 7.4, -2.9], 4.5);

    // Flow direction chevrons.
    for (let i = 0; i < 4; i++) {
      const a = OHM_LOOP[i];
      const b = OHM_LOOP[(i + 1) % OHM_LOOP.length];
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const angle = Math.atan2(b.x - a.x, b.z - a.z);
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.15, 0.4, 4),
        new THREE.MeshBasicMaterial({ color: 0x68deef, transparent: true, opacity: 0.55, toneMapped: false }),
      );
      arrow.position.set(mid.x, 0.77, mid.z);
      arrow.rotation.z = Math.PI / 2;
      arrow.rotation.y = angle;
      group.add(arrow);
    }
    this.addLight('#76dfff', 1.2, 15, [0, 3, 2]);
    this.addLight('#ff7657', 0.7, 6, [4.2, 1.2, 0.4]);

    this.updateLoop(0);
  }

  resetSim(): void {
    this.elapsedFlow = 0;
    this.updateLoop(0);
  }

  private updateLoop(dt: number): void {
    if (!this.orbs) return;
    this.current = this.num('voltage') / Math.max(this.num('resistance'), 0.1);
    this.power = this.current * this.num('voltage');
    const flow = 0.055 + this.current * 0.12;
    this.elapsedFlow += dt * flow;
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    this.orbParams.forEach((base, i) => {
      let s = (base + this.elapsedFlow) % 1;
      const seg = s * 4;
      const idx = Math.floor(seg) % 4;
      const t = seg - Math.floor(seg);
      const a = OHM_LOOP[idx];
      const b = OHM_LOOP[(idx + 1) % 4];
      pos.copy(a).lerp(b, t);
      pos.y = 1.02;
      pos.z += Math.sin((s + i) * 12.7) * 0.04;
      matrix.makeTranslation(pos.x, pos.y, pos.z);
      this.orbs.setMatrixAt(i, matrix);
    });
    this.orbs.instanceMatrix.needsUpdate = true;

    const voltage = this.num('voltage');
    const fillHeight = 1.0 + (voltage / 24) * 3.0;
    this.sourceFill.scale.y = fillHeight / 1.8;
    this.sourceFill.position.y = 0.6 + fillHeight / 2;
    this.sourceGlow.material.opacity = 0.15 + (voltage / 24) * 0.25;

    const gateGap = 0.28 + (1 - (this.num('resistance') - 2) / 38) * 1.2;
    this.gates[0].position.x = 4.2 - (0.65 + gateGap / 2);
    this.gates[1].position.x = 4.2 + (0.65 + gateGap / 2);
    const heat = clamp(this.power / 140, 0, 1);
    for (const gate of this.gates) {
      const mat = gate.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.05 + heat * 2.0;
      mat.emissive.setHSL(0.03, 1, 0.45 + heat * 0.25);
    }
    this.gateGlow.material.opacity = 0.06 + heat * 0.55;
    this.gateGlow.scale.setScalar(1 + heat * 1.4);
    const bulbIntensity = clamp(this.power / 30, 0, 1.6);
    (this.bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.15 + bulbIntensity * 2.8;
    this.bulbGlow.material.opacity = 0.12 + bulbIntensity * 0.55;
    this.bulbGlow.scale.setScalar(1.4 + bulbIntensity * 2.2);
    this.bulbLight.intensity = 0.2 + bulbIntensity * 3.2;
  }

  step(dt: number): void {
    this.updateLoop(dt);
  }

  isSolved(): boolean {
    return Math.abs(this.num('voltage') - 12) < 0.25 && Math.abs(this.current - 0.5) < 0.012;
  }

  getMetrics(): Readout[] {
    return [
      { label: 'Voltage', value: this.num('voltage').toFixed(0), unit: 'V', tone: 'warm' },
      { label: 'Resistance', value: this.num('resistance').toFixed(1), unit: 'Ω' },
      { label: 'Current', value: this.current.toFixed(3), unit: 'A', tone: this.isSolved() ? 'accent' : 'cool' },
      { label: 'Power', value: this.power.toFixed(1), unit: 'W', tone: this.power > 60 ? 'danger' : 'muted' },
      { label: 'Gate heat', value: `${Math.min(999, Math.round((this.power / 140) * 100))}`, unit: '%', tone: 'warm' },
    ];
  }

  getTelemetryTargets(): TelemetryTarget[] {
    if (!this.orbs) return [];
    return [
      this.makeTelemetry('electron', this.orbs, 'Charge carrier', 9.109e-31, () => ({
        position: new THREE.Vector3(0, 1.02, 0),
        velocity: new THREE.Vector3(0, 0, this.current * 1.8),
        acceleration: new THREE.Vector3(),
        extra: [
          { label: 'Current', value: `${this.current.toFixed(2)} A` },
          { label: 'Charge', value: '−1 e' },
        ],
      })),
    ];
  }

  override getGraphSample(): GraphSample {
    return {
      t: this.simTime,
      position: this.current,
      velocity: this.current,
      ke: this.power,
      pe: 0,
      primaryLabel: 'Current',
      secondaryLabel: 'Resistor gate',
    };
  }
}

// -----------------------------------------------------------------------------
// 3.2 — Faraday's Induction Generator
// -----------------------------------------------------------------------------

const faradayMeta: ExperimentMeta = {
  id: 'faraday',
  biome: 'electro',
  number: '3.2',
  title: "Faraday's Induction Generator",
  shortTitle: 'Induction Generator',
  subtitle: 'Motion becomes electricity.',
  description:
    'Drive a permanent magnet back and forth through a copper coil. Watch the induced voltage reverse with the motion and set the lamp tower alight.',
  concept: 'A changing magnetic flux induces an electromotive force: ε = −N dΦ/dt. More turns, a stronger field, or a faster change all increase the induced voltage.',
  realWorld: 'Almost all grid electricity begins this way: steam, wind, or falling water spins a magnet relative to coils in a generator.',
  formula: 'ε = −N dΦ/dt = NABω sin(ωt)     ·     V_rms = V_peak/√2',
  formulaNote: 'The minus sign is Lenz’s law: the induced current opposes the change in flux. At the instant the magnet is stationary at either end, the induced voltage is zero.',
  badgeName: 'Flux Capacitor',
  accent: '#89a6ff',
  accentNumber: 0x89a6ff,
  badgeGlyph: 'Φ',
  controls: [
    { id: 'turns', label: 'Coil turns N', kind: 'range', min: 20, max: 120, step: 5, unit: 'turns' },
    { id: 'field', label: 'Magnet field B', kind: 'range', min: 0.2, max: 1.2, step: 0.05, unit: 'T' },
    { id: 'frequency', label: 'Crank frequency', kind: 'range', min: 0.3, max: 2.0, step: 0.05, unit: 'Hz' },
  ],
  defaults: { turns: 80, field: 0.8, frequency: 1.0 },
  observeParams: { turns: 80, field: 0.8, frequency: 1.0 },
  observeCues: [
    { at: 0.1, text: 'The stationary magnet produces no current, no matter how strong it is. A field alone is not enough.' },
    { at: 2.0, text: 'As the piston drives the magnet through the coil, the flux changes. The meter swings.' },
    { at: 4.2, text: 'Reverse the motion and the current reverses. Nature opposes the change in flux — that is Lenz’s law.' },
    { at: 6.4, text: 'Faster motion, more turns, or a stronger magnet all raise the induced EMF. Motion is the fuel.' },
  ],
  challenge: {
    title: 'Light the Vault',
    brief: 'Sustain at least 12 V RMS across the coil while using 60 or more turns.',
    hint: 'ε_peak = NABω. Raise the frequency, add turns, or strengthen the magnet. The lamp needs sustained RMS voltage, not a lucky spike.',
    success: 'The bulb tower burns steady. You have turned motion into a sustained electric flow.',
    targetLabel: 'V_rms ≥ 12 V · N ≥ 60',
  },
  chart: {
    title: 'Induction waveform',
    positionLabel: 'EMF (V)',
    velocityLabel: 'Magnet speed',
    energyLabel: 'Lamp power',
  },
};

export class FaradayExperiment extends Experiment {
  private magnet!: THREE.Mesh;
  private coil: THREE.Group = new THREE.Group();
  private lamps: THREE.Mesh[] = [];
  private lampGlows: THREE.Sprite[] = [];
  private lampLight!: THREE.PointLight;
  private emf = 0;
  private rms = 0;
  private phase = 0;
  private crank!: THREE.Group;
  private meterNeedle!: THREE.Group;
  private sparks!: THREE.InstancedMesh;
  private sparkPhase: number[] = [];
  private currentGlow!: THREE.Sprite;
  private meterSamples: number[] = [];

  constructor() {
    super(faradayMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 12, height: 4.8, targetHeight: 2.9 };
  }

  buildVisual(): void {
    const group = this.visualRoot;
    group.add(meshBox(11, 0.34, 6.8, 0x171c2c, { position: [0, 0.17, 0] }));
    group.add(meshBox(10.4, 0.1, 6.2, 0x2a3043, { position: [0, 0.38, 0] }));

    // Slide rail and magnet.
    group.add(meshBox(8.4, 0.22, 0.22, E.steelLight, { position: [0, 1.1, -0.8] }));
    for (const x of [-3.9, 3.9]) {
      group.add(meshBox(0.36, 2.8, 0.36, E.steel, { position: [x, 1.5, -0.8] }));
      group.add(meshBox(0.6, 0.14, 0.7, E.brass, { position: [x, 2.9, -0.8] }));
    }
    group.add(meshBox(8.0, 0.12, 0.6, 0x1b252d, { position: [0, 0.55, -0.8] }));
    this.magnet = meshBox(1.55, 1.2, 1.2, 0xd8e0e6, {
      position: [0, 2.15, 0],
      metalness: 0.55,
      roughness: 0.3,
      emissive: 0x4c7aff,
      emissiveIntensity: 0.12,
    });
    group.add(this.magnet);
    group.add(meshBox(1.58, 0.28, 1.24, 0x6b86ff, { position: [0, 2.15, 0], glow: true, opacity: 0.32 }));
    addSign(group, 'N', 'MAGNET', '#a8baff', [-2.5, 3.1, 0.1], 1.1);
    addSign(group, 'S', 'MAGNET', '#a8baff', [2.5, 3.1, 0.1], 1.1);

    // Coil of copper rings.
    this.coil.position.set(0, 2.15, 0);
    group.add(this.coil);
    for (let i = 0; i < 10; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.25, 0.075, 7, 32),
        new THREE.MeshStandardMaterial({ color: E.copper, metalness: 0.8, roughness: 0.3, emissive: 0x4a1f10, emissiveIntensity: 0.2 }),
      );
      ring.rotation.y = Math.PI / 2;
      ring.position.x = -0.9 + i * 0.2;
      this.coil.add(ring);
    }
    // Coil support frame.
    for (const z of [-1.5, 1.5]) {
      group.add(meshBox(0.18, 3.0, 0.18, E.steel, { position: [0, 1.5, z] }));
      group.add(meshBox(0.9, 0.2, 0.25, E.brass, { position: [0, 0.15, z] }));
    }
    this.currentGlow = this.addStaticGlow([0, 2.15, 0], '#7697ff', 5.2, 0.2);

    // Piston rods to sell the mechanical drive.
    group.add(meshBox(0.16, 0.16, 0.16, E.steelLight, { position: [-2.5, 2.15, 0] }));
    group.add(meshBox(0.16, 0.16, 0.16, E.steelLight, { position: [2.5, 2.15, 0] }));

    // Lamp tower on the right.
    const lampPositions: Array<[number, number, number]> = [
      [3.8, 2.0, 1.6],
      [3.8, 3.15, 1.6],
      [3.8, 4.3, 1.6],
    ];
    for (let i = 0; i < lampPositions.length; i++) {
      const [x, y, z] = lampPositions[i];
      group.add(meshBox(0.15, 1.3, 0.15, E.steelLight, { position: [x, y - 0.7, z] }));
      group.add(meshBox(0.5, 0.12, 0.5, E.brass, { position: [x, y - 0.15, z] }));
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 12, 9),
        new THREE.MeshPhysicalMaterial({
          color: 0xfff4cc,
          emissive: 0xffd06a,
          emissiveIntensity: 0.15,
          transparent: true,
          opacity: 0.62,
          roughness: 0.12,
          transmission: 0.3,
        }),
      );
      lamp.position.set(x, y + 0.05, z);
      group.add(lamp);
      this.lamps.push(lamp);
      const glow = this.addStaticGlow([x, y + 0.05, z], '#ffd479', 2.2, 0.12);
      this.lampGlows.push(glow);
    }
    this.lampLight = new THREE.PointLight(0xffc76b, 0.3, 10, 2);
    this.lampLight.position.set(3.8, 3.4, 2.2);
    group.add(this.lampLight);
    addSign(group, 'INDUCED CURRENT', 'NO MOTION = NO CURRENT', '#8da5ff', [3.8, 5.4, 1.1], 3.2);

    // Wires to the lamps.
    const wirePoints = [
      new THREE.Vector3(0, 3.3, 0),
      new THREE.Vector3(2.6, 3.3, 1.3),
      new THREE.Vector3(3.2, 2.8, 1.5),
      new THREE.Vector3(3.8, 2.1, 1.6),
    ];
    group.add(line(wirePoints, 0x526980, 0.65));
    group.add(line([new THREE.Vector3(0, 1.0, 1.2), new THREE.Vector3(3.1, 1.0, 1.6), new THREE.Vector3(3.8, 1.4, 1.6)], 0x526980, 0.65));

    // Analog voltmeter.
    const meter = new THREE.Group();
    meter.position.set(-3.2, 3.1, 1.9);
    meter.rotation.y = 0.18;
    group.add(meter);
    const face = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 0.82, 0.16, 24),
      new THREE.MeshStandardMaterial({ color: 0xe7ddc5, roughness: 0.6 }),
    );
    face.rotation.x = Math.PI / 2;
    meter.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.055, 6, 26), new THREE.MeshStandardMaterial({ color: E.brass, metalness: 0.8, roughness: 0.3 }));
    meter.add(rim);
    this.meterNeedle = new THREE.Group();
    this.meterNeedle.position.z = 0.13;
    this.meterNeedle.add(meshBox(0.035, 0.62, 0.025, 0xd86248, { position: [0, 0.27, 0] }));
    this.meterNeedle.add(meshBox(0.09, 0.09, 0.06, E.steel, { position: [0, 0, 0.02] }));
    meter.add(this.meterNeedle);
    addSign(group, 'V', 'INDUCED EMF', '#9ab2ff', [-3.2, 4.5, 1.85], 1.5);

    // Crank wheel.
    this.crank = new THREE.Group();
    this.crank.position.set(-4.6, 1.5, 0.8);
    group.add(this.crank);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.07, 6, 24), new THREE.MeshStandardMaterial({ color: E.brass, metalness: 0.8, roughness: 0.3 }));
    this.crank.add(wheel);
    for (let i = 0; i < 4; i++) this.crank.add(meshBox(0.07, 1.2, 0.07, E.steel, { rotation: [0, 0, i * Math.PI / 4] }));
    addSign(group, 'CRANK', 'MOVE THE FLUX', '#f3ca7d', [-4.6, 2.7, 0.85], 2.0);

    // Flowing spark packets along the upper wire.
    const count = 22;
    this.sparks = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.055, 0),
      new THREE.MeshBasicMaterial({ color: 0x9ab8ff, toneMapped: false }),
      count,
    );
    group.add(this.sparks);
    for (let i = 0; i < count; i++) this.sparkPhase.push(i / count);

    this.addLight('#7896ff', 1.8, 12, [0, 2.6, 0.5]);
    this.addLight('#ffd27b', 0.6, 10, [3.8, 3.2, 2.2]);
    addSign(group, "FARADAY'S GENERATOR", 'ε = −N dΦ/dt', '#89a6ff', [0, 7.6, -2.8], 4.6);
    this.updateGenerator(0);
  }

  resetSim(): void {
    this.phase = 0;
    this.emf = 0;
    this.rms = 0;
    this.meterSamples = [];
    this.updateGenerator(0);
  }

  private updateGenerator(dt: number): void {
    if (!this.magnet) return;
    const omega = Math.PI * 2 * this.num('frequency');
    this.phase += dt * omega;
    this.magnet.position.x = Math.sin(this.phase) * 1.15;
    this.crank.rotation.z = -this.phase * 0.9;
    const peak = this.num('turns') * this.num('field') * 0.045 * omega + 0.0001;
    this.emf = peak * Math.cos(this.phase);
    this.rms = Math.sqrt(this.rms * this.rms * 0.94 + this.emf * this.emf * 0.06);
    this.meterSamples.push(this.emf);
    if (this.meterSamples.length > 120) this.meterSamples.shift();
    const avgSquares = this.meterSamples.reduce((sum, v) => sum + v * v, 0) / Math.max(1, this.meterSamples.length);
    this.rms = Math.sqrt(avgSquares);
    const brightness = clamp(this.rms / 14, 0, 1.5);
    this.lamps.forEach((lamp, i) => {
      const mat = lamp.material as THREE.MeshPhysicalMaterial;
      const threshold = i === 0 ? 0.12 : i === 1 ? 0.35 : 0.72;
      mat.emissiveIntensity = brightness > threshold ? 0.25 + (brightness - threshold) * 2.5 : 0.1;
      const glow = this.lampGlows[i];
      glow.material.opacity = 0.08 + Math.max(0, brightness - threshold) * 0.35;
      glow.scale.setScalar(1 + brightness * 1.8);
    });
    this.lampLight.intensity = 0.2 + brightness * 3.4;
    this.meterNeedle.rotation.z = clamp(this.emf / 60, -1.2, 1.2);
    this.currentGlow.material.opacity = 0.08 + Math.min(0.5, Math.abs(this.emf) / 40);
    const current = Math.abs(this.emf) / 55;
    this.orbsOnWire(dt, current);

    for (let i = 0; i < this.lamps.length; i++) {
      const mat = this.lamps[i].material as THREE.MeshPhysicalMaterial;
      if (mat.emissiveIntensity > 0.8) {
        this.lamps[i].scale.setScalar(1 + Math.sin(this.simTime * 8 + i) * 0.025);
      }
    }
  }

  private orbsOnWire(dt: number, _current: number): void {
    if (!this.sparks) return;
    const positions: THREE.Vector3[] = [
      new THREE.Vector3(0, 3.3, 0),
      new THREE.Vector3(2.6, 3.3, 1.3),
      new THREE.Vector3(3.2, 2.8, 1.5),
      new THREE.Vector3(3.8, 2.1, 1.6),
    ];
    const count = this.sparkPhase.length;
    const speed = 0.02 + Math.abs(this.emf) * 0.005;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      let s = (this.sparkPhase[i] + this.phase * 0.02 + this.simTime * speed) % 1;
      let seg = 0;
      let t = s;
      let p = positions[0];
      for (let j = 0; j < positions.length - 1; j++) {
        const len = positions[j].distanceTo(positions[j + 1]) / 4.3;
        if (t < len) {
          p = positions[j].clone().lerp(positions[j + 1], t / Math.max(len, 0.001));
          break;
        }
        t -= len;
        seg = j + 1;
      }
      void seg;
      matrix.makeTranslation(p.x, p.y, p.z);
      this.sparks.setMatrixAt(i, matrix);
      const material = this.sparks.material as THREE.MeshBasicMaterial;
      material.opacity = 0.25 + Math.min(0.7, Math.abs(this.emf) / 35);
    }
    this.sparks.instanceMatrix.needsUpdate = true;
  }

  step(dt: number): void {
    this.updateGenerator(dt);
  }

  isSolved(): boolean {
    return this.num('turns') >= 60 && this.rms >= 12;
  }

  getMetrics(): Readout[] {
    const peak = this.num('turns') * this.num('field') * 0.045 * Math.PI * 2 * this.num('frequency');
    const stableRms = peak / Math.SQRT2;
    return [
      { label: 'Coil turns', value: this.num('turns').toFixed(0), tone: this.num('turns') >= 60 ? 'accent' : 'muted' },
      { label: 'Peak EMF', value: peak.toFixed(1), unit: 'V', tone: 'warm' },
      { label: 'Theoretical RMS', value: stableRms.toFixed(1), unit: 'V' },
      { label: 'Live RMS', value: this.rms.toFixed(1), unit: 'V', tone: this.rms >= 12 ? 'accent' : 'cool' },
      { label: 'Frequency', value: this.num('frequency').toFixed(2), unit: 'Hz' },
      { label: 'Lamp tower', value: this.rms > 12 ? 'LIT' : this.rms > 4 ? 'DIM' : 'COLD', tone: this.rms > 12 ? 'accent' : 'muted' },
    ];
  }

  getTelemetryTargets(): TelemetryTarget[] {
    if (!this.magnet) return [];
    return [
      this.makeTelemetry('magnet', this.magnet, 'Permanent magnet', 4.2, () => ({
        position: this.magnet.position.clone().add(new THREE.Vector3(0, 2.15, 0)),
        velocity: new THREE.Vector3(
          Math.cos(this.phase) * 1.15 * Math.PI * 2 * this.num('frequency'),
          0,
          0,
        ),
        acceleration: new THREE.Vector3(
          -Math.sin(this.phase) * 1.15 * (Math.PI * 2 * this.num('frequency')) ** 2,
          0,
          0,
        ),
        extra: [{ label: 'EMF', value: `${this.emf.toFixed(1)} V` }],
      })),
    ];
  }

  override getGraphSample(): GraphSample {
    return {
      t: this.simTime,
      position: this.emf,
      velocity: Math.abs(this.rms),
      ke: Math.abs(this.emf) * 0.12,
      pe: 0,
      primaryLabel: 'EMF (V)',
      secondaryLabel: 'Copper coil',
    };
  }
}

// -----------------------------------------------------------------------------
// 3.3 — Lorentz Force Particle Accelerator
// -----------------------------------------------------------------------------

const lorentzMeta: ExperimentMeta = {
  id: 'lorentz',
  biome: 'electro',
  number: '3.3',
  title: 'Lorentz Force Particle Accelerator',
  shortTitle: 'Lorentz Accelerator',
  subtitle: 'Which way does a charge bend?',
  description:
    'Fire a charged particle through a magnetic gap. Use the right-hand rule — or simply experiment — to steer it into the upper detector.',
  concept: 'A charge moving through a magnetic field feels F = qv × B. The force is perpendicular to both velocity and field, so it curves the path without changing speed.',
  realWorld: 'Cyclotrons, mass spectrometers, tokamaks, and the aurora all depend on this perpendicular magnetic steering.',
  formula: 'F = qv × B     ·     r = mv/(|q|B)',
  formulaNote: 'Reverse the charge or the magnetic field and the force reverses. Note that the magnetic force does no work — it rotates the velocity without changing its magnitude.',
  badgeName: 'Right-Hand Rule',
  accent: '#9aa8ff',
  accentNumber: 0x9aa8ff,
  badgeGlyph: '⊗',
  controls: [
    { id: 'charge', label: 'Particle', kind: 'select', options: [
      { value: 'proton', label: 'Proton · +' },
      { value: 'electron', label: 'Electron · −' },
    ] },
    { id: 'speed', label: 'Injection speed', kind: 'range', min: 3, max: 9, step: 0.25, unit: 'm/s' },
    { id: 'field', label: 'Magnetic field B', kind: 'range', min: 0.2, max: 2.4, step: 0.1, unit: 'T' },
    { id: 'fieldDir', label: 'Field direction', kind: 'select', options: [
      { value: 'out', label: 'Out of screen · ⊙' },
      { value: 'into', label: 'Into screen · ⊗' },
    ] },
  ],
  defaults: { charge: 'proton', speed: 5, field: 0.8, fieldDir: 'out' },
  observeParams: { charge: 'proton', speed: 5, field: 1.3, fieldDir: 'into' },
  observeCues: [
    { at: 0.1, text: 'The proton enters moving right. The magnetic field points into the screen, away from you.' },
    { at: 2.0, text: 'Use your right hand: fingers along v, curl to B, thumb points along F. The force is upward.' },
    { at: 4.2, text: 'The force is always perpendicular to velocity, so it bends the path into a circular arc without changing speed.' },
    { at: 6.2, text: 'A negative electron would bend the other way. That is how charge sign reveals itself in a bubble chamber.' },
  ],
  challenge: {
    title: 'Upper Detector',
    brief: 'Deliver a proton into the upper detector. The magnetic field direction is yours to choose.',
    hint: 'v points right. For an upward force on a positive charge, B must point into the screen. Tune speed and field strength to finish the arc.',
    success: 'A clean strike on the upper detector. The right-hand rule earns its badge.',
    targetLabel: 'Proton → upper detector',
  },
  chart: {
    title: 'Lorentz trajectory',
    positionLabel: 'Vertical position (m)',
    velocityLabel: 'Speed (m/s)',
    energyLabel: 'Kinetic energy (J)',
  },
};

interface LorentzParticle {
  pos: THREE.Vector2;
  vel: THREE.Vector2;
  trail: THREE.Vector3[];
}

export class LorentzExperiment extends Experiment {
  private particle: THREE.Mesh | null = null;
  private trailLine!: THREE.Line;
  private particleState: LorentzParticle | null = null;
  private launched = false;
  private hitUpper = false;
  private hitLower = false;
  private hitResult = '—';
  private vArrow!: THREE.ArrowHelper;
  private bArrow!: THREE.ArrowHelper;
  private fArrow!: THREE.ArrowHelper;
  private fieldGroup!: THREE.Group;
  private fieldLabel!: THREE.Sprite;
  private fieldOutLabel!: THREE.Sprite;
  private fieldIntoLabel!: THREE.Sprite;
  private detectorTop!: THREE.Group;
  private detectorBottom!: THREE.Group;
  private elapsedFlight = 0;
  private qmScale = 1.55;

  constructor() {
    super(lorentzMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 14, height: 5.0, targetHeight: 2.9 };
  }

  buildVisual(): void {
    const group = this.visualRoot;
    group.add(meshBox(12, 0.3, 5.8, 0x151727, { position: [0, 0.15, 0] }));
    group.add(meshBox(11.4, 0.09, 5.2, 0x292d49, { position: [0, 0.36, 0] }));

    // Flight axis and field bounds.
    group.add(line([new THREE.Vector3(-5.8, 2.9, -0.2), new THREE.Vector3(6.2, 2.9, -0.2)], 0x42577b, 0.42));
    const fieldMat = new THREE.MeshPhysicalMaterial({
      color: 0x718cff,
      transparent: true,
      opacity: 0.06,
      transmission: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 0.1,
    });
    const fieldBox = new THREE.Mesh(new THREE.BoxGeometry(3.8, 4.2, 2.8), fieldMat);
    fieldBox.position.set(0.5, 3.0, 0);
    group.add(fieldBox);
    group.add(meshBox(0.08, 4.2, 2.8, 0x7896ff, { position: [-1.4, 3.0, 0], glow: true, opacity: 0.24 }));
    group.add(meshBox(0.08, 4.2, 2.8, 0x7896ff, { position: [2.4, 3.0, 0], glow: true, opacity: 0.24 }));
    this.fieldGroup = new THREE.Group();
    group.add(this.fieldGroup);
    for (let i = 0; i < 9; i++) {
      const x = -0.9 + (i % 3) * 1.25;
      const y = 1.6 + Math.floor(i / 3) * 1.2;
      const glyph = new THREE.Mesh(
        new THREE.TorusGeometry(0.12, 0.025, 5, 14),
        new THREE.MeshBasicMaterial({ color: 0x91a8ff, transparent: true, opacity: 0.4, toneMapped: false }),
      );
      glyph.position.set(x, y, 0);
      glyph.rotation.x = Math.PI / 2;
      this.fieldGroup.add(glyph);
    }

    // Emitter on the left.
    group.add(meshBox(0.7, 2.1, 1.6, E.steel, { position: [-5.2, 2.9, 0] }));
    group.add(meshBox(0.2, 1.2, 1.1, 0x91a8ff, { position: [-4.8, 2.9, 0], glow: true, opacity: 0.55 }));
    group.add(meshBox(0.9, 0.4, 2.2, E.brass, { position: [-5.2, 1.7, 0] }));
    addSign(group, 'INJECTOR', 'CHARGED-PARTICLE SOURCE', '#a5b6ff', [-5.2, 4.5, 0.2], 2.4);

    // Detectors.
    const buildDetector = (y: number, label: string, color: string): THREE.Group => {
      const det = new THREE.Group();
      det.position.set(5.6, y, 0);
      group.add(det);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.58, 0.08, 7, 24),
        new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.65, metalness: 0.4, roughness: 0.3 }),
      );
      ring.rotation.y = Math.PI / 2;
      det.add(ring);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        det.add(meshBox(0.08, 0.9, 0.08, 0x3e4a68, {
          position: [0, Math.cos(a) * 0.3, Math.sin(a) * 0.3],
        }));
      }
      det.add(meshBox(0.6, 0.12, 0.6, E.brass, { position: [0, -0.7, 0] }));
      addSign(group, label, 'PARTICLE DETECTOR', color, [5.6, y + 1.35, 0.1], 2.1);
      return det;
    };
    this.detectorTop = buildDetector(4.8, 'UPPER', '#ffd67c');
    this.detectorBottom = buildDetector(1.0, 'LOWER', '#ff9e7e');
    group.add(meshBox(0.18, 4.3, 0.18, E.steel, { position: [5.6, 0.2, 1.2] }));

    // Particle and trail.
    this.particle = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.17, 1),
      new THREE.MeshStandardMaterial({ color: 0xffe6a8, emissive: 0xffb95c, emissiveIntensity: 1.5, roughness: 0.2 }),
    );
    this.particle.visible = false;
    group.add(this.particle);
    this.trailLine = line([new THREE.Vector3(), new THREE.Vector3()], 0xffd286, 0.62);
    group.add(this.trailLine);

    // Right-hand-rule hologram.
    group.add(meshBox(0.06, 1.7, 0.06, 0x596c91, { position: [-2.6, 6.1, -1.2] }));
    const rhrBase = new THREE.Group();
    rhrBase.position.set(-2.6, 6.9, -1.2);
    group.add(rhrBase);
    rhrBase.add(meshBox(0.58, 0.08, 0.58, 0x7887bb, { position: [0, -0.05, 0], glow: true, opacity: 0.35 }));
    this.vArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1.6, 0x84ffc5, 0.24, 0.14);
    this.bArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 1.35, 0x7c9bff, 0.24, 0.14);
    this.fArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 1.2, 0xff8f78, 0.24, 0.14);
    rhrBase.add(this.vArrow, this.bArrow, this.fArrow);
    const rhrLabel = makeTextLabel('RIGHT-HAND RULE', 'v × B = force on +q', '#9aa8ff', { width: 700, height: 220 });
    rhrLabel.position.set(0.9, 1.7, 0);
    rhrLabel.scale.set(2.6, 0.82, 1);
    rhrBase.add(rhrLabel);
    this.fieldOutLabel = makeTextLabel('B OUT ⊙', 'field toward you', '#90a7ff');
    this.fieldOutLabel.position.set(0.9, -0.6, 0);
    this.fieldOutLabel.scale.set(1.6, 0.48, 1);
    rhrBase.add(this.fieldOutLabel);
    this.fieldIntoLabel = makeTextLabel('B IN ⊗', 'field away from you', '#90a7ff');
    this.fieldIntoLabel.position.copy(this.fieldOutLabel.position);
    this.fieldIntoLabel.scale.copy(this.fieldOutLabel.scale);
    rhrBase.add(this.fieldIntoLabel);
    this.fieldLabel = this.fieldOutLabel;

    // Field pole markers.
    addSign(group, 'MAGNETIC GAP', 'UNIFORM FIELD · NO ELECTRIC FIELD', '#91a8ff', [0.5, 5.9, -1.9], 3.2);
    addSign(group, "LORENTZ ACCELERATOR", 'F = q(v × B)', '#9aa8ff', [0, 8.1, -2.7], 4.3);
    this.addLight('#8fa8ff', 1.5, 15, [0, 3, 1.5]);
    this.addLight('#ffcf7f', 0.8, 8, [5.2, 4.8, 1]);
    this.updateRightHandHologram();
  }

  resetSim(): void {
    this.launched = false;
    this.hitUpper = false;
    this.hitLower = false;
    this.hitResult = '—';
    this.elapsedFlight = 0;
    this.particleState = null;
    if (this.particle) this.particle.visible = false;
    if (this.trailLine) this.trailLine.visible = false;
    this.updateRightHandHologram();
    this.resetDetector(this.detectorTop, 0xffd67c);
    this.resetDetector(this.detectorBottom, 0xff9e7e);
  }

  private resetDetector(detector: THREE.Group, color: number): void {
    detector?.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat.emissive) mat.emissive.setHex(color);
      }
    });
  }

  private updateRightHandHologram(): void {
    if (!this.vArrow) return;
    const isProton = this.str('charge') === 'proton';
    const into = this.str('fieldDir') === 'into';
    const bz = into ? -1 : 1;
    this.bArrow.setDirection(new THREE.Vector3(0, 0, bz));
    const fY = (isProton ? 1 : -1) * bz; // v=+x; F_y = q (v × B)_y = -q v B_z
    this.fArrow.setDirection(new THREE.Vector3(0, -fY, 0));
    this.bArrow.setLength(into ? 0.15 : 1.35, 0.24, 0.14);
    this.fieldOutLabel.visible = !into;
    this.fieldIntoLabel.visible = into;
    this.fieldLabel = into ? this.fieldIntoLabel : this.fieldOutLabel;
    for (const glyph of this.fieldGroup?.children ?? []) {
      if (glyph instanceof THREE.Mesh) {
        (glyph.material as THREE.MeshBasicMaterial).opacity = 0.28 + (into ? 0.2 : 0.1);
      }
    }
  }

  protected onParamChange(): void {
    this.updateRightHandHologram();
    this.resetSim();
  }

  triggerPrimaryAction(): void {
    if (this.launched) return;
    this.launched = true;
    this.hitUpper = false;
    this.hitLower = false;
    this.hitResult = 'IN FLIGHT';
    this.elapsedFlight = 0;
    const speed = this.num('speed');
    this.particleState = {
      pos: new THREE.Vector2(-4.7, 2.9),
      vel: new THREE.Vector2(speed, 0),
      trail: [],
    };
    if (this.particle) {
      this.particle.visible = true;
      this.particle.position.set(this.particleState.pos.x, this.particleState.pos.y, 0);
    }
    if (this.trailLine) this.trailLine.visible = true;
  }

  getPrimaryActionLabel(): string | null {
    return this.launched ? 'IN FLIGHT…' : 'FIRE PARTICLE';
  }

  canUsePrimaryAction(): boolean {
    return !this.launched;
  }

  step(dt: number): void {
    if (this.observationActive && !this.launched && this.simTime > 1.0) this.triggerPrimaryAction();
    this.updateRightHandHologram();
    if (!this.launched || !this.particleState) return;
    this.elapsedFlight += dt;
    const state = this.particleState;
    const substeps = 4;
    const sdt = dt / substeps;
    for (let s = 0; s < substeps; s++) {
      const inField = state.pos.x >= -1.4 && state.pos.x <= 2.4;
      if (inField) {
        const q = this.str('charge') === 'proton' ? 1 : -1;
        const bz = this.str('fieldDir') === 'into' ? -1 : 1;
        const B = this.num('field');
        // Lorentz rotation: a = (q/m) v × B. Exact symplectic planar rotation conserves speed |v| identically.
        const dTheta = (-q * bz * B / this.qmScale) * sdt;
        const cosT = Math.cos(dTheta);
        const sinT = Math.sin(dTheta);
        const vx = state.vel.x * cosT - state.vel.y * sinT;
        const vy = state.vel.x * sinT + state.vel.y * cosT;
        state.vel.x = vx;
        state.vel.y = vy;
      }
      state.pos.x += state.vel.x * sdt;
      state.pos.y += state.vel.y * sdt;
      state.trail.push(new THREE.Vector3(state.pos.x, state.pos.y, 0));
      if (state.pos.x >= 5.6) {
        if (Math.abs(state.pos.y - 4.8) < 0.75) {
          this.hitUpper = true;
          this.hitResult = 'UPPER HIT';
          this.flashDetector(this.detectorTop, 0xffd67c);
        } else if (Math.abs(state.pos.y - 1.0) < 0.75) {
          this.hitLower = true;
          this.hitResult = 'LOWER HIT';
          this.flashDetector(this.detectorBottom, 0xff9e7e);
        } else {
          this.hitResult = 'MISS';
        }
        this.launched = false;
        if (this.particle) this.particle.visible = false;
        break;
      }
      if (state.pos.y > 6.4 || state.pos.y < -0.4 || state.pos.x < -6.2 || state.pos.x > 6.4) {
        this.hitResult = 'LEFT THE GAP';
        this.launched = false;
        if (this.particle) this.particle.visible = false;
        break;
      }
    }
    if (this.particle && this.particleState) {
      this.particle.position.set(state.pos.x, state.pos.y, 0);
    }
    if (this.trailLine) {
      const points = state.trail.slice(-160);
      this.trailLine.geometry.dispose();
      this.trailLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
      this.trailLine.visible = points.length > 1;
    }
    if (this.elapsedFlight > 5 && this.launched) {
      this.hitResult = 'TIMEOUT';
      this.launched = false;
      if (this.particle) this.particle.visible = false;
    }
  }

  private flashDetector(detector: THREE.Group, color: number): void {
    detector.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat.emissive) {
          mat.emissive.setHex(color);
          mat.emissiveIntensity = 2.2;
        }
      }
    });
  }

  isSolved(): boolean {
    return this.hitUpper && this.str('charge') === 'proton' && this.str('fieldDir') === 'into';
  }

  getMetrics(): Readout[] {
    const q = this.str('charge') === 'proton' ? 1 : -1;
    const bz = this.str('fieldDir') === 'into' ? -1 : 1;
    const radius = this.num('speed') / Math.max(0.01, this.qmScale * this.num('field')) * Math.abs((q * bz) || 1);
    return [
      { label: 'Particle', value: this.str('charge') === 'proton' ? 'p⁺' : 'e⁻', tone: 'warm' },
      { label: 'Speed', value: this.num('speed').toFixed(2), unit: 'm/s' },
      { label: 'B field', value: this.num('field').toFixed(1), unit: 'T' },
      { label: 'Field', value: this.str('fieldDir') === 'into' ? 'INTO ⊗' : 'OUT ⊙', tone: 'cool' },
      { label: 'Radius', value: `${radius.toFixed(1)}`, unit: 'scene m' },
      { label: 'Result', value: this.hitResult, tone: this.hitUpper ? 'accent' : this.hitLower ? 'danger' : 'muted' },
    ];
  }

  getTelemetryTargets(): TelemetryTarget[] {
    if (!this.particle) return [];
    return [
      this.makeTelemetry('lorentz-particle', this.particle, this.str('charge') === 'proton' ? 'Proton' : 'Electron', this.str('charge') === 'proton' ? 1.67e-27 : 9.11e-31, () => ({
        position: this.particle!.position.clone(),
        velocity: this.particleState ? new THREE.Vector3(this.particleState.vel.x, this.particleState.vel.y, 0) : new THREE.Vector3(),
        acceleration: new THREE.Vector3(
          0,
          -(this.str('charge') === 'proton' ? 1 : -1) * (this.str('fieldDir') === 'into' ? -1 : 1) * this.num('speed') * this.num('field') * this.qmScale,
          0,
        ),
        extra: [
          { label: 'Charge', value: this.str('charge') === 'proton' ? '+e' : '−e' },
          { label: 'B', value: `${this.num('field').toFixed(1)} T ${this.str('fieldDir') === 'into' ? '⊗' : '⊙'}` },
        ],
      })),
    ];
  }

  override getVectorProbes(env: EnvironmentState): VectorProbe[] {
    if (!this.particle || !this.particleState) return [];
    const q = this.str('charge') === 'proton' ? 1 : -1;
    const bz = this.str('fieldDir') === 'into' ? -1 : 1;
    return [
      {
        id: 'lorentz',
        position: this.particle.position.clone(),
        velocity: new THREE.Vector3(this.particleState.vel.x, this.particleState.vel.y, 0).multiplyScalar(0.25),
        acceleration: new THREE.Vector3(0, -q * this.particleState.vel.x * bz * this.num('field') * 0.3, 0),
        gravity: new THREE.Vector3(0, 0, 0),
        scale: 0.8,
      },
    ];
  }

  override getGraphSample(): GraphSample {
    if (!this.particleState) {
      return { t: this.simTime, position: 0, velocity: 0, ke: 0, pe: 0 };
    }
    const speed = this.particleState.vel.length();
    return {
      t: this.simTime,
      position: this.particleState.pos.y,
      velocity: speed,
      ke: 0.5 * speed * speed,
      pe: 0,
      primaryLabel: 'Vertical position',
      secondaryLabel: 'Charged particle',
    };
  }
}
