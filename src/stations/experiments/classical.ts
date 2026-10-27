import * as THREE from 'three';
import { Experiment } from '../BaseExperiment';
import type { ExperimentMeta, GraphSample, Readout, TelemetryTarget, VectorProbe } from '../types';
import type { EnvironmentState } from '../../config';
import { meshBox } from '../../world/voxel';
import { makeReadoutTexture } from '../../world/labels';
import { clamp } from '../../core/utils';

const C = {
  iron: 0x27333b,
  ironLight: 0x505f68,
  brass: 0xb78a4e,
  brassLight: 0xe7c17c,
  wood: 0x603f2b,
  sand: 0x9b744a,
  sandLight: 0xc69b64,
  glass: 0xa8e4ef,
  gold: 0xf6ce7d,
  ink: 0x0c1720,
};

function makeGlass(width: number, height: number, depth: number, color = C.glass, opacity = 0.09): THREE.Mesh {
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 0.05,
    metalness: 0.02,
    transmission: 0.7,
    thickness: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
}

function lineFrom(points: THREE.Vector3[], color: number, opacity = 0.6, dashed = false): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.22, gapSize: 0.16, toneMapped: false })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity, toneMapped: false });
  const line = new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  return line;
}

function addSign(
  parent: THREE.Object3D,
  title: string,
  subtitle: string,
  accent: string,
  position: [number, number, number],
  size = 2.6,
): THREE.Mesh {
  const texture = makeReadoutTexture([`#${title}`, subtitle], accent, 900, 300);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size / 3),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }),
  );
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

// -----------------------------------------------------------------------------
// 1.1 — Galileo's Vacuum Tower
// -----------------------------------------------------------------------------

const vacuumMeta: ExperimentMeta = {
  id: 'vacuum-drop',
  biome: 'classical',
  number: '1.1',
  title: "Galileo's Vacuum Tower",
  shortTitle: 'Vacuum Tower',
  subtitle: 'Do heavier things fall faster?',
  description:
    'Release an iron anvil and a feather together. Then pull the vacuum lever and discover that, without air, the two arrive at the pressure plates in the same instant.',
  concept: 'In a vacuum, every object near Earth accelerates downward at g. Mass affects inertia, not the gravitational acceleration itself.',
  realWorld: 'Astronauts on the Moon demonstrated this with a hammer and falcon feather in 1971. The same principle guides parachute design and re-entry modelling.',
  formula: 'a = g − ½ρC_dAv²/m     ·     t = √(2h/g)',
  formulaNote: 'The drag term has m in the denominator. A light feather with large area feels dramatic drag; in a vacuum ρ = 0, the first equation becomes a = g for both bodies.',
  badgeName: 'Equal Fall',
  accent: '#f8c978',
  accentNumber: 0xf8c978,
  badgeGlyph: '⇣',
  controls: [
    { id: 'vacuum', label: 'Vacuum pump', kind: 'toggle', hint: 'Remove the air from the chamber.' },
    { id: 'height', label: 'Release height', kind: 'range', min: 3, max: 13, step: 0.5, unit: 'm' },
  ],
  defaults: { vacuum: false, height: 10 },
  observeParams: { vacuum: true, height: 10 },
  observeCues: [
    { at: 0.1, text: 'The chamber is filled with air. The feather has a huge area for its tiny mass, so drag holds it back.' },
    { at: 2.0, text: 'The vacuum pump removes the particles. With ρ = 0, the drag term vanishes from both equations of motion.' },
    { at: 4.6, text: 'Watch the plates. Same release, same distance, same gravity — and a photo finish.' },
    { at: 6.8, text: 'Gravity tells both bodies the same story. Air resistance is what made everyday falling look unfair.' },
  ],
  challenge: {
    title: 'The Photo Finish',
    brief: 'Evacuate the chamber, release both bodies, and make the pressure plates fire no more than 20 ms apart.',
    hint: 'Use the vacuum toggle and then release. In vacuum there is no drag, so both bodies follow the same acceleration.',
    success: 'Both plates fired in the same instant. Galileo would approve.',
    targetLabel: 'Δ landing time < 20 ms',
  },
  chart: {
    title: 'Fall kinematics',
    positionLabel: 'Height (m)',
    velocityLabel: 'Speed (m/s)',
    energyLabel: 'PE + KE (J)',
  },
};

interface FallBody {
  group: THREE.Group;
  mass: number;
  drag: number;
  y: number;
  velocityY: number;
  landed: boolean;
  landingTime: number | null;
}

export class VacuumDropExperiment extends Experiment {
  private anvil!: FallBody;
  private feather!: FallBody;
  private falling = false;
  private airParticles!: THREE.Points;
  private airMaterial!: THREE.PointsMaterial;
  private pumpWheel!: THREE.Group;
  private plateAnvil!: THREE.Mesh;
  private plateFeather!: THREE.Mesh;
  private plateTop = 0.62;
  private pitch = 10;

  constructor() {
    super(vacuumMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 14, height: 7.4, targetHeight: 6.2 };
  }

  buildVisual(): void {
    const group = this.visualRoot;
    group.add(meshBox(6.2, 0.34, 5, C.iron, { position: [0, 0.17, 0] }));
    group.add(meshBox(5.6, 0.09, 4.4, C.ironLight, { position: [0, 0.39, 0] }));

    // Stout drop-frame.
    for (const x of [-3.1, 3.1]) {
      group.add(meshBox(0.32, 14.4, 0.32, C.iron, { position: [x, 7.2, -1.95] }));
      group.add(meshBox(0.18, 0.18, 1.8, C.brass, { position: [x, 13.95, -1.05], glow: true }));
    }
    group.add(meshBox(6.9, 0.42, 0.45, C.iron, { position: [0, 14.25, -1.95] }));
    group.add(meshBox(6.5, 0.08, 0.16, C.brass, { position: [0, 14.05, -1.8], glow: true }));
    group.add(meshBox(5.5, 0.08, 0.3, C.iron, { position: [0, 0.55, -1.95] }));

    // Vacuum chamber.
    for (const x of [-1.35, 1.35]) {
      const tube = makeGlass(1.72, 13.6, 1.9);
      tube.position.set(x, 7.25, 0);
      group.add(tube);
      for (const side of [-0.95, 0.95]) {
        const edge = meshBox(0.055, 13.6, 0.055, C.glass, {
          position: [x + side, 7.25, -0.95],
          glow: true,
          opacity: 0.25,
        });
        group.add(edge);
      }
      for (let level = 1; level <= 8; level++) {
        group.add(meshBox(0.025, 0.025, 0.35, C.brass, { position: [x + 0.92, 0.7 + level * 1.55, 0.8] }));
      }
    }

    // Pressure plates and landing bells.
    const plateMaterial = new THREE.MeshStandardMaterial({
      color: 0x7b633d,
      emissive: 0x3c2e16,
      emissiveIntensity: 0.2,
      metalness: 0.75,
      roughness: 0.3,
    });
    for (const [x, key] of [
      [-1.35, 'anvil'],
      [1.35, 'feather'],
    ] as const) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.78, 0.2, 12), plateMaterial.clone());
      plate.position.set(x, 0.58, 0);
      plate.receiveShadow = true;
      group.add(plate);
      if (key === 'anvil') this.plateAnvil = plate;
      else this.plateFeather = plate;
      group.add(meshBox(0.16, 0.5, 0.16, C.brass, { position: [x, 0.29, 0.75] }));
    }

    // Air particles suspended in the chamber.
    const airPositions: number[] = [];
    for (let i = 0; i < 140; i++) {
      airPositions.push(
        -2 + Math.random() * 4,
        1.4 + Math.random() * 12,
        -0.8 + Math.random() * 1.6,
      );
    }
    const airGeo = new THREE.BufferGeometry();
    airGeo.setAttribute('position', new THREE.Float32BufferAttribute(airPositions, 3));
    this.airMaterial = new THREE.PointsMaterial({
      color: 0xc9f3ff,
      size: 0.055,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.airParticles = new THREE.Points(airGeo, this.airMaterial);
    this.airParticles.frustumCulled = false;
    group.add(this.airParticles);

    // Vacuum pump and pipes.
    group.add(meshBox(0.8, 1.4, 0.8, C.iron, { position: [4.15, 0.8, 0] }));
    group.add(meshBox(0.25, 0.25, 1.7, C.brass, { position: [3.45, 1.2, -0.7] }));
    this.pumpWheel = new THREE.Group();
    this.pumpWheel.position.set(4.15, 1.7, 0);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.53, 0.07, 6, 18),
      new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.8, roughness: 0.28 }),
    );
    this.pumpWheel.add(rim);
    for (let i = 0; i < 4; i++) {
      const spoke = meshBox(0.07, 1.0, 0.07, C.ironLight, { rotation: [0, 0, (i * Math.PI) / 4] });
      this.pumpWheel.add(spoke);
    }
    group.add(this.pumpWheel);
    addSign(group, 'VACUUM PUMP', 'PULL TO EVACUATE', '#f8c978', [4.1, 2.9, 0.5], 2.1);

    // Bodies.
    this.anvil = {
      group: this.buildAnvil(),
      mass: 55,
      drag: 0.00055,
      y: 10,
      velocityY: 0,
      landed: false,
      landingTime: null,
    };
    this.feather = {
      group: this.buildFeather(),
      mass: 0.02,
      drag: 5.4,
      y: 10,
      velocityY: 0,
      landed: false,
      landingTime: null,
    };
    this.anvil.group.position.set(-1.35, 10, 0);
    this.feather.group.position.set(1.35, 10, 0);
    this.dynamicRoot.add(this.anvil.group, this.feather.group);

    this.addStaticGlow([0, 14.6, -1.7], '#ffd68a', 3.2, 0.3);
    this.addLight('#ffd799', 1.4, 10, [0, 3, 1.6]);
  }

  private buildAnvil(): THREE.Group {
    const group = new THREE.Group();
    group.add(meshBox(0.76, 0.42, 0.48, C.iron, { position: [0, 0.25, 0], metalness: 0.72, roughness: 0.38 }));
    group.add(meshBox(0.48, 0.22, 0.35, C.ironLight, { position: [0, 0, 0], metalness: 0.65, roughness: 0.36 }));
    group.add(meshBox(0.24, 0.2, 0.3, C.iron, { position: [0, -0.18, 0] }));
    group.add(meshBox(0.24, 0.05, 0.24, C.gold, { position: [0, 0.49, 0], glow: true }));
    return group;
  }

  private buildFeather(): THREE.Group {
    const group = new THREE.Group();
    const vaneMaterial = new THREE.MeshStandardMaterial({
      color: 0xf3ead6,
      roughness: 0.7,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    const vane = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 1.15), vaneMaterial);
    vane.rotation.y = 0.25;
    vane.position.y = 0.3;
    group.add(vane);
    group.add(meshBox(0.035, 1.5, 0.035, C.brassLight, { position: [0, 0.22, 0.01], rotation: [0, 0, 0.08] }));
    group.add(meshBox(0.1, 0.16, 0.035, C.gold, { position: [0, -0.52, 0.02], glow: true }));
    group.rotation.z = 0.08;
    return group;
  }

  resetSim(): void {
    this.falling = false;
    const height = this.num('height');
    const top = this.plateTop + height;
    for (const body of [this.anvil, this.feather]) {
      body.y = top;
      body.velocityY = 0;
      body.landed = false;
      body.landingTime = null;
    }
    if (!this.anvil || !this.feather) return;
    this.anvil.group.visible = true;
    this.feather.group.visible = true;
    this.anvil.group.position.set(-1.35, top, 0);
    this.feather.group.position.set(1.35, top, 0);
    this.anvil.group.rotation.set(0, 0, 0);
    this.feather.group.rotation.set(0, 0.15, 0.08);
    this.plateAnvil.position.y = 0.58;
    this.plateFeather.position.y = 0.58;
    this.airParticles.visible = !this.bool('vacuum');
    this.updatePump();
  }

  protected override onParamChange(): void {
    if (!this.falling) {
      this.resetSim();
    }
  }

  private updatePump(): void {
    if (!this.pumpWheel) return;
    const target = this.bool('vacuum') ? -0.7 : 0.7;
    this.pitch += (target - this.pitch) * 0.1;
    this.pumpWheel.rotation.z = this.pitch;
  }

  startFall(): void {
    if (this.falling) return;
    this.falling = true;
  }

  triggerPrimaryAction(): void {
    if (!this.falling) this.startFall();
  }

  getPrimaryActionLabel(): string | null {
    return this.falling ? 'FALLING…' : 'RELEASE BOTH';
  }

  canUsePrimaryAction(): boolean {
    return !this.falling;
  }

  step(dt: number, env: EnvironmentState): void {
    this.updatePump();
    const chamberVacuum = this.bool('vacuum') || env.air === 'vacuum';
    this.airParticles.visible = !chamberVacuum;
    if (this.observationActive && this.simTime > 1.1 && !this.falling) this.startFall();
    if (!this.falling) return;

    const isVacuum = chamberVacuum;
    const rho = isVacuum ? 0 : env.airDensity;
    this.airParticles.rotation.y += dt * 0.02;

    for (const [body, plate] of [
      [this.anvil, this.plateAnvil],
      [this.feather, this.plateFeather],
    ] as Array<[FallBody, THREE.Mesh]>) {
      if (body.landed) continue;
      // Semi-implicit drag damping ensures numerical stability in dense air
      const dragCoeff = (body.drag * rho * Math.abs(body.velocityY)) / Math.max(0.001, body.mass);
      body.velocityY = (body.velocityY - env.gravity * dt) / (1 + dragCoeff * dt);
      body.y += body.velocityY * dt;
      if (body.y <= this.plateTop + 0.14) {
        body.y = this.plateTop + 0.14;
        body.velocityY = 0;
        body.landed = true;
        body.landingTime = this.simTime;
        plate.position.y = 0.49;
        const material = plate.material as THREE.MeshStandardMaterial;
        material.emissive.setHex(0xf1b04c);
        material.emissiveIntensity = 1.2;
      }
      body.group.position.y = body.y;
      if (body === this.feather && !body.landed) {
        body.group.rotation.z = 0.08 + Math.sin(this.simTime * 3.1) * (rho > 0 ? 0.32 : 0.06);
        body.group.rotation.y = 0.15 + Math.sin(this.simTime * 2.2) * (rho > 0 ? 0.22 : 0.04);
        body.group.position.x = 1.35 + Math.sin(this.simTime * 2.7) * (rho > 0 ? 0.22 : 0.035);
      }
      if (body === this.anvil && !body.landed) {
        body.group.rotation.z = Math.sin(this.simTime * 0.8) * (rho > 0 ? 0.015 : 0.002);
      }
    }
    if (this.anvil.landed && this.feather.landed) {
      this.falling = false;
    }
    this.plateAnvil.position.y += (0.58 - this.plateAnvil.position.y) * Math.min(1, dt * 8);
    this.plateFeather.position.y += (0.58 - this.plateFeather.position.y) * Math.min(1, dt * 8);
    if (this.anvil.landed && this.feather.landed) {
      const mat = this.plateAnvil.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 1.3 + Math.sin(this.simTime * 9) * 0.6;
    }
  }

  isSolved(): boolean {
    const isVacuum = this.bool('vacuum') || this.currentEnv?.air === 'vacuum';
    if (!isVacuum) return false;
    if (!this.anvil?.landed || !this.feather?.landed) return false;
    if (this.anvil.landingTime == null || this.feather.landingTime == null) return false;
    return Math.abs(this.anvil.landingTime - this.feather.landingTime) < 0.02;
  }

  getMetrics(env: EnvironmentState): Readout[] {
    const dt = this.anvil?.landingTime != null && this.feather?.landingTime != null
      ? Math.abs(this.anvil.landingTime - this.feather.landingTime) * 1000
      : null;
    return [
      { label: 'Chamber', value: this.bool('vacuum') ? 'VACUUM' : 'ATMOSPHERE', tone: this.bool('vacuum') ? 'accent' : 'muted' },
      { label: 'Anvil', value: this.anvil?.landed ? `${this.anvil.landingTime!.toFixed(2)} s` : `${this.anvil ? Math.max(0, this.anvil.y - this.plateTop).toFixed(1) : '—'} m`, tone: 'warm' },
      { label: 'Feather', value: this.feather?.landed ? `${this.feather.landingTime!.toFixed(2)} s` : `${this.feather ? Math.max(0, this.feather.y - this.plateTop).toFixed(1) : '—'} m`, tone: 'cool' },
      { label: 'Landing gap', value: dt == null ? '—' : dt.toFixed(1), unit: dt == null ? undefined : 'ms', tone: dt != null && dt < 20 ? 'accent' : 'danger' },
      { label: 'Local g', value: env.gravity.toFixed(2), unit: 'm/s²' },
    ];
  }

  getTelemetryTargets(): TelemetryTarget[] {
    if (!this.anvil || !this.feather) return [];
    const make = (body: FallBody, label: string) =>
      this.makeTelemetry(body === this.anvil ? 'drop-anvil' : 'drop-feather', body.group, label, body.mass, () => ({
        position: new THREE.Vector3(body.group.position.x, body.y, body.group.position.z),
        velocity: new THREE.Vector3(0, body.velocityY, 0),
        acceleration: new THREE.Vector3(0, body.landed ? 0 : -9.81, 0),
      }));
    return [make(this.anvil, 'Iron anvil'), make(this.feather, 'Feather')];
  }

  getVectorProbes(env: EnvironmentState): VectorProbe[] {
    return this.getTelemetryTargets().map((target) => {
      const state = target.getState();
      const probes: VectorProbe[] = [
        {
          id: target.id,
          position: state.position.clone(),
          velocity: state.velocity.clone().multiplyScalar(0.45),
          gravity: new THREE.Vector3(0, -env.gravity * 0.35, 0),
          scale: target.id.includes('feather') ? 0.7 : 1,
        },
      ];
      return probes[0];
    });
  }

  getGraphSample(): GraphSample | null {
    if (!this.anvil) return null;
    const height = Math.max(0, this.anvil.y - this.plateTop);
    return {
      t: this.simTime,
      position: height,
      velocity: Math.abs(this.anvil.velocityY),
      ke: 0.5 * this.anvil.mass * this.anvil.velocityY ** 2,
      pe: this.anvil.mass * 9.81 * height,
      primaryLabel: 'Anvil height',
      secondaryLabel: 'Iron anvil',
    };
  }
}

// -----------------------------------------------------------------------------
// 1.2 — Projectile Artillery Range
// -----------------------------------------------------------------------------

const projectileMeta: ExperimentMeta = {
  id: 'projectile',
  biome: 'classical',
  number: '1.2',
  title: 'Projectile Artillery Range',
  shortTitle: 'Artillery Range',
  subtitle: 'Separate the horizontal from the vertical.',
  description:
    'Set the barrel angle and muzzle speed, then fire through a drifting target ring. Suspended breadcrumbs mark the trajectory every half second.',
  concept: 'Horizontal and vertical motion are independent. Gravity changes only the vertical velocity, while the horizontal velocity stays constant when drag is ignored.',
  realWorld: 'The same equations guide basketball shots, artillery, water jets, and the ballistic arcs of spacecraft coasting between burns.',
  formula: 'x = v₀cosθ·t     ·     y = y₀ + v₀sinθ·t − ½gt²',
  formulaNote: 'Air resistance adds a velocity-squared drag term. A projectile is always accelerating downward at g — even at the top of its arc, where its vertical velocity is zero.',
  badgeName: 'Parabola Perfect',
  accent: '#ffb764',
  accentNumber: 0xffb764,
  badgeGlyph: '⌒',
  controls: [
    { id: 'angle', label: 'Barrel pitch', kind: 'range', min: 5, max: 80, step: 1, unit: '°' },
    { id: 'speed', label: 'Muzzle speed', kind: 'range', min: 6, max: 26, step: 0.5, unit: 'm/s' },
    { id: 'air', label: 'Air resistance', kind: 'toggle', hint: 'Add quadratic drag to the projectile.' },
  ],
  defaults: { angle: 38, speed: 15, air: false },
  observeParams: { angle: 45, speed: 15, air: false },
  observeCues: [
    { at: 0.1, text: 'The barrel is aimed at the ring. Keep your eye on the cyan trail: horizontal motion is constant, vertical motion is being bent by gravity.' },
    { at: 2.5, text: 'At the top of the arc the vertical velocity passes through zero — but gravity never switches off.' },
    { at: 4.7, text: 'Those suspended breadcrumbs are released every half second. The equal horizontal spacing proves vₓ is constant.' },
    { at: 7.2, text: 'A hit needs the right angle and the right speed. Both change the time of flight, which is the ring’s real opponent.' },
  ],
  challenge: {
    title: 'Thread the Moving Ring',
    brief: 'Hit the drifting ring at 13.5 m. Tune the barrel, watch the predicted arc, and fire.',
    hint: 'The predictor helps with the descending limb. Remember: the ring moves sideways, so timing matters.',
    success: 'Dead centre. The projectile carved a perfect parabola through the ring.',
    targetLabel: 'Hit the ring',
  },
  chart: {
    title: 'Ballistic trace',
    positionLabel: 'Height (m)',
    velocityLabel: 'Speed (m/s)',
    energyLabel: 'Energy (J)',
  },
};

interface TrailCube {
  mesh: THREE.Mesh;
  age: number;
}

export class ProjectileExperiment extends Experiment {
  private barrel!: THREE.Group;
  private projectile!: THREE.Mesh;
  private targetRing!: THREE.Mesh;
  private targetGlow!: THREE.Sprite;
  private trailGroup = new THREE.Group();
  private trailCubes: TrailCube[] = [];
  private ghostLine!: THREE.Line;
  private ghostDot!: THREE.Mesh;
  private flying = false;
  private hit = false;
  private landed = false;
  private px = -4.5;
  private py = 2;
  private pz = 0;
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private prevX = -4.5;
  private prevY = 2;
  private timeSinceBreadcrumb = 0;
  private maxHeight = 0;
  private impactX = 0;
  private impactTime = 0;
  private trailFlash = 0;
  private lastGhostKey = '';
  private lastKnownGravity = 9.81;

  constructor() {
    super(projectileMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 22, height: 8.2, targetHeight: 4.3 };
  }

  buildVisual(): void {
    const group = this.visualRoot;
    group.add(meshBox(27, 0.22, 6.6, 0x3b4a43, { position: [3, 0.11, 0] }));
    group.add(meshBox(25, 0.08, 3.3, 0x6b6a4e, { position: [3, 0.26, 0] }));
    for (let x = -8; x <= 16; x += 2) {
      group.add(meshBox(0.34, 0.015, 2.1, 0x82936c, { position: [x, 0.315, 0], opacity: 0.5 }));
    }

    // Gun carriage.
    const base = new THREE.Group();
    base.position.set(-6.6, 0.34, 0);
    group.add(base);
    base.add(meshBox(2.2, 0.35, 2.1, C.wood, { position: [0, 0.18, 0] }));
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.58, 0.58, 0.16, 14),
        new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.65, roughness: 0.38 }),
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(0.25, 0.18, side * 1.0);
      base.add(wheel);
      const spokes = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const spoke = meshBox(0.06, 1.02, 0.06, C.iron, { rotation: [0, 0, (i * Math.PI) / 4], position: [0.25, 0.18, side * 1.09] });
        spokes.add(spoke);
      }
      base.add(spokes);
    }
    base.add(meshBox(0.8, 0.5, 1.4, C.iron, { position: [0, 0.55, 0] }));

    this.barrel = new THREE.Group();
    this.barrel.position.set(-0.2, 0.95, 0);
    base.add(this.barrel);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.3, 3.2, 12),
      new THREE.MeshStandardMaterial({ color: C.ironLight, metalness: 0.8, roughness: 0.28 }),
    );
    barrel.rotation.z = -Math.PI / 2;
    barrel.position.x = 1.5;
    this.barrel.add(barrel);
    const muzzle = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.06, 6, 18),
      new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.75, roughness: 0.3 }),
    );
    muzzle.rotation.y = Math.PI / 2;
    muzzle.position.x = 3.1;
    this.barrel.add(muzzle);
    for (let i = 0; i < 5; i++) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.235 - i * 0.012, 0.028, 5, 14),
        new THREE.MeshStandardMaterial({ color: C.brassLight, metalness: 0.6, roughness: 0.35 }),
      );
      band.rotation.y = Math.PI / 2;
      band.position.x = 0.3 + i * 0.56;
      this.barrel.add(band);
    }
    addSign(base, 'FIRE CONTROL', 'PITCH + MUZZLE VELOCITY', '#ffb764', [0, 2.7, 0.4], 2.1);

    // Target hoop.
    const ringGroup = new THREE.Group();
    ringGroup.position.set(13.5, 3.65, 0);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.15, 0.09, 8, 48),
      new THREE.MeshStandardMaterial({
        color: 0x85f5ff,
        emissive: 0x1dafc0,
        emissiveIntensity: 0.8,
        metalness: 0.35,
        roughness: 0.28,
      }),
    );
    ring.rotation.y = Math.PI / 2;
    this.targetRing = ring;
    ringGroup.add(ring);
    const stand = new THREE.Group();
    stand.position.set(13.5, 0, 0);
    this.visualRoot.add(stand);
    for (const z of [-1.7, 1.7]) {
      stand.add(meshBox(0.16, 3.3, 0.16, 0x34474d, { position: [0, 1.65, z] }));
      stand.add(meshBox(0.6, 0.09, 0.6, 0x4b6970, { position: [0, 0.08, z] }));
    }
    const glow = this.addGlow([0, 0, 0], '#76f4ff', 4.7, 0.2);
    this.targetGlow = glow;
    this.dynamicRoot.add(ringGroup);
    this.targetRing.userData.ringGroup = ringGroup;
    this.dynamicRoot.add(glow);
    glow.position.set(13.5, 3.65, 0);
    addSign(this.visualRoot, 'TARGET', 'MOVING RING · 13.5 M', '#83f4ff', [14.5, 0.65, 0], 2.4);

    // Suspended trail and projectile.
    this.dynamicRoot.add(this.trailGroup);
    this.projectile = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.22, 1),
      new THREE.MeshStandardMaterial({
        color: 0xffd187,
        emissive: 0xff9a3d,
        emissiveIntensity: 1.3,
        metalness: 0.6,
        roughness: 0.2,
      }),
    );
    this.projectile.visible = false;
    this.dynamicRoot.add(this.projectile);
    const pGlow = this.addGlow([0, 0, 0], '#ffb45d', 1.5, 0.45);
    pGlow.visible = false;
    this.projectile.userData.glow = pGlow;

    // Predicted path (computed with the current barrel and gravity).
    const ghost = lineFrom([], 0x8bf4ff, 0.23, true);
    this.ghostLine = ghost;
    this.dynamicRoot.add(ghost);
    const ghostDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x8bf4ff, toneMapped: false, transparent: true, opacity: 0.6 }),
    );
    this.ghostDot = ghostDot;
    this.dynamicRoot.add(ghostDot);

    this.addBox(0.14, 3.8, 0.14, 0x49655e, [-8, 1.9, 2.2]);
    this.addBox(0.6, 0.2, 0.6, C.brass, [-8, 3.8, 2.2]);
    this.addStaticGlow([-8, 4.0, 2.2], '#ffb764', 1.6, 0.35);

    this.updateVisualControls();
    this.refreshGhost(9.81);
  }

  private updateVisualControls(): void {
    if (!this.barrel) return;
    const angle = THREE.MathUtils.degToRad(this.num('angle'));
    this.barrel.rotation.z = angle;
  }

  private muzzleState(): { x: number; y: number; angle: number } {
    const angle = THREE.MathUtils.degToRad(this.num('angle'));
    return {
      x: -6.8 + Math.cos(angle) * 3.05,
      y: 1.3 + Math.sin(angle) * 3.05,
      angle,
    };
  }

  resetSim(): void {
    this.flying = false;
    this.hit = false;
    this.landed = false;
    this.impactX = 0;
    this.impactTime = 0;
    this.maxHeight = 0;
    this.trailFlash = 0;
    if (!this.projectile) return;
    this.projectile.visible = false;
    (this.projectile.userData.glow as THREE.Sprite).visible = false;
    for (const cube of this.trailCubes) {
      cube.mesh.geometry.dispose();
      (cube.mesh.material as THREE.Material).dispose();
      cube.mesh.removeFromParent();
    }
    this.trailCubes = [];
    this.targetRing.material = (this.targetRing.material as THREE.MeshStandardMaterial).clone();
    (this.targetRing.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8;
    const ring = this.targetRing.userData.ringGroup as THREE.Group;
    ring.position.set(13.5, 3.65, Math.sin(0) * 1.5);
    this.targetRing.userData.baseZ = 0;
    this.updateVisualControls();
    this.refreshGhost(9.81);
  }

  private refreshGhost(gravity: number): void {
    if (!this.ghostLine) return;
    this.lastKnownGravity = gravity;
    const angleVal = this.num('angle');
    const speedVal = this.num('speed');
    const airVal = this.bool('air');
    const key = `${angleVal.toFixed(1)}_${speedVal.toFixed(1)}_${airVal}_${gravity.toFixed(2)}`;
    if (key === this.lastGhostKey) return;
    this.lastGhostKey = key;

    const points: THREE.Vector3[] = [];
    const angle = THREE.MathUtils.degToRad(angleVal);
    let x = -6.8 + Math.cos(angle) * 3.05;
    let y = 1.3 + Math.sin(angle) * 3.05;
    let vx = Math.cos(angle) * speedVal;
    let vy = Math.sin(angle) * speedVal;
    const rho = airVal ? 1.225 : 0;
    const dt = 0.04;
    for (let i = 0; i < 200 && y >= 0.35; i++) {
      points.push(new THREE.Vector3(x, y, 0));
      const speed = Math.hypot(vx, vy);
      const drag = 0.5 * rho * 0.012 * speed * speed;
      vx -= (vx / Math.max(speed, 0.001)) * drag * dt;
      vy -= gravity * dt + (vy / Math.max(speed, 0.001)) * drag * dt;
      x += vx * dt;
      y += vy * dt;
    }
    this.ghostLine.geometry.dispose();
    this.ghostLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
    this.ghostLine.computeLineDistances();
    this.ghostDot.position.copy(points[points.length - 1] ?? new THREE.Vector3());
  }

  protected onParamChange(): void {
    this.updateVisualControls();
    if (!this.flying) {
      this.refreshGhost(this.lastKnownGravity);
    }
  }

  triggerPrimaryAction(): void {
    if (this.flying) return;
    this.fire();
  }

  getPrimaryActionLabel(): string | null {
    return this.flying ? 'IN FLIGHT…' : 'FIRE';
  }

  canUsePrimaryAction(): boolean {
    return !this.flying;
  }

  private fire(): void {
    this.flying = true;
    this.hit = false;
    this.landed = false;
    this.projectile.visible = true;
    (this.projectile.userData.glow as THREE.Sprite).visible = true;
    const muzzle = this.muzzleState();
    this.px = muzzle.x;
    this.py = muzzle.y;
    this.pz = 0;
    this.prevX = this.px;
    const angle = muzzle.angle;
    this.vx = Math.cos(angle) * this.num('speed');
    this.vy = Math.sin(angle) * this.num('speed');
    this.vz = 0;
    this.maxHeight = this.py;
    this.impactTime = 0;
    this.timeSinceBreadcrumb = 0;
    this.projectile.position.set(this.px, this.py, this.pz);
    this.refreshGhost(this.lastKnownGravity);
  }

  step(dt: number, env: EnvironmentState): void {
    const ringGroup = this.targetRing.userData.ringGroup as THREE.Group;
    const zTarget = Math.sin(this.simTime * 0.78) * 1.5;
    ringGroup.position.z = zTarget;
    this.targetGlow.position.z = zTarget;
    this.targetRing.rotation.z = Math.sin(this.simTime * 0.6) * 0.08;
    this.refreshGhost(env.gravity);

    if (this.observationActive && !this.flying && this.simTime > 1.1) this.fire();
    if (!this.flying) return;

    const substeps = 3;
    const sdt = dt / substeps;
    const rho = this.bool('air') && env.air === 'atmosphere' ? env.airDensity : 0;
    const cdA = 0.012;
    for (let s = 0; s < substeps && this.flying; s++) {
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > 0.001 && rho > 0) {
        const dragForce = 0.5 * rho * cdA * speed * speed;
        this.vx -= (this.vx / speed) * (dragForce / 6) * sdt;
        this.vy -= (this.vy / speed) * (dragForce / 6) * sdt;
      }
      this.vy -= env.gravity * sdt;
      this.prevX = this.px;
      this.prevY = this.py;
      this.px += this.vx * sdt;
      this.py += this.vy * sdt;
      this.pz += this.vz * sdt;
      this.maxHeight = Math.max(this.maxHeight, this.py);

      // Breadcrumb every 0.5 seconds of flight.
      this.timeSinceBreadcrumb += sdt;
      if (this.timeSinceBreadcrumb >= 0.5) {
        this.timeSinceBreadcrumb -= 0.5;
        this.dropBreadcrumb();
      }

      const targetX = 13.5;
      if (this.prevX < targetX && this.px >= targetX) {
        const t = (targetX - this.prevX) / Math.max(this.px - this.prevX, 0.0001);
        const yAt = this.prevY + (this.py - this.prevY) * t;
        const zAt = this.pz;
        const dy = yAt - 3.65;
        const dz = zAt - ringGroup.position.z;
        if (Math.hypot(dy, dz) < 2.18) {
          this.hit = true;
          this.flying = false;
          this.landed = true;
          this.impactX = targetX;
          this.impactTime = this.simTime;
          this.trailFlash = 1;
          this.projectile.visible = false;
          (this.projectile.userData.glow as THREE.Sprite).visible = false;
          (this.targetRing.material as THREE.MeshStandardMaterial).emissive.setHex(0xffd36d);
          (this.targetRing.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.2;
          break;
        }
      }

      if (this.py <= 0.3) {
        this.py = 0.3;
        this.flying = false;
        this.landed = true;
        this.impactX = this.px;
        this.impactTime = this.simTime;
        this.projectile.visible = false;
        (this.projectile.userData.glow as THREE.Sprite).visible = false;
        break;
      }
      if (this.px > 20) {
        this.flying = false;
        this.landed = true;
        this.impactX = this.px;
        break;
      }
    }

    this.projectile.position.set(this.px, this.py, this.pz);
    const glow = this.projectile.userData.glow as THREE.Sprite;
    glow.position.copy(this.projectile.position);

    if (this.trailFlash > 0) this.trailFlash = Math.max(0, this.trailFlash - dt * 0.7);
    for (const cube of this.trailCubes) {
      cube.age += dt;
      cube.mesh.scale.setScalar(0.75 + Math.sin(cube.age * 2.5) * 0.16);
      cube.mesh.rotation.y += dt * 0.6;
    }
    if (this.trailCubes.length > 90) {
      const oldest = this.trailCubes.shift();
      if (oldest) {
        oldest.mesh.geometry.dispose();
        (oldest.mesh.material as THREE.Material).dispose();
        oldest.mesh.removeFromParent();
      }
    }
  }

  private dropBreadcrumb(): void {
    const material = new THREE.MeshBasicMaterial({ color: 0xb7f8ff, transparent: true, opacity: 0.75, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), material);
    mesh.position.set(this.px, this.py, this.pz);
    this.trailGroup.add(mesh);
    this.trailCubes.push({ mesh, age: 0 });
  }

  isSolved(): boolean {
    return this.hit;
  }

  getMetrics(env: EnvironmentState): Readout[] {
    const range = this.landed ? this.impactX - this.muzzleState().x : 0;
    return [
      { label: 'Pitch', value: `${this.num('angle').toFixed(0)}`, unit: '°', tone: 'warm' },
      { label: 'Muzzle v₀', value: this.num('speed').toFixed(1), unit: 'm/s' },
      { label: 'Predicted apex', value: this.getPredictedApex(env.gravity).toFixed(1), unit: 'm', tone: 'cool' },
      { label: this.hit ? 'Target' : 'Downrange', value: this.hit ? 'HIT' : this.landed ? range.toFixed(1) : '—', unit: this.hit ? undefined : this.landed ? 'm' : undefined, tone: this.hit ? 'accent' : 'muted' },
      { label: 'Gravity', value: `${env.gravity.toFixed(2)}`, unit: 'm/s²' },
    ];
  }

  private getPredictedApex(gravity: number): number {
    const angle = THREE.MathUtils.degToRad(this.num('angle'));
    const v = this.num('speed');
    return this.muzzleState().y + (v * Math.sin(angle)) ** 2 / (2 * Math.max(gravity, 0.01));
  }

  getTelemetryTargets(): TelemetryTarget[] {
    if (!this.projectile) return [];
    const target = this.makeTelemetry('projectile-orb', this.projectile, 'Artillery shell', 6, () => ({
      position: this.projectile.position.clone(),
      velocity: new THREE.Vector3(this.vx, this.vy, this.vz),
      acceleration: new THREE.Vector3(0, -9.81, 0),
      extra: [{ label: 'Flight', value: `${this.simTime.toFixed(2)} s` }],
    }));
    return [target];
  }

  override getGraphSample(): GraphSample {
    const speed = Math.hypot(this.vx, this.vy);
    return {
      t: this.simTime,
      position: this.py,
      velocity: speed,
      ke: 0.5 * 6 * speed * speed,
      pe: 6 * 9.81 * this.py,
      primaryLabel: 'Shell height',
      secondaryLabel: 'Artillery shell',
    };
  }

  protected onObservationStart(): void {
    this.refreshGhost(9.81);
  }
}

// -----------------------------------------------------------------------------
// 1.3 — Momentum & Collision Track
// -----------------------------------------------------------------------------

const collisionMeta: ExperimentMeta = {
  id: 'collision',
  biome: 'classical',
  number: '1.3',
  title: 'Momentum & Collision Track',
  shortTitle: 'Collision Track',
  subtitle: 'What survives a crash?',
  description:
    'Send Cart A into Cart B. Compare your collision with a perfectly elastic reference lane while the momentum ledger balances before and after.',
  concept: 'In a closed system, total momentum is conserved in every collision. Kinetic energy is conserved only in a perfectly elastic collision; clay collisions convert it to heat and sound.',
  realWorld: 'Crash-test barriers, billiard shots, particle detectors, and spacecraft docking all rely on these two conservation laws.',
  formula: 'm₁v₁ + m₂v₂ = m₁u₁ + m₂u₂     ·     u₁ = ((m₁ − em₂)v₁ + (1+e)m₂v₂)/(m₁+m₂)',
  formulaNote: 'e is the coefficient of restitution: e = 1 is a perfectly elastic collision, e = 0 is perfectly inelastic. Momentum is conserved for every e between them.',
  badgeName: 'Momentum Keeper',
  accent: '#f9a969',
  accentNumber: 0xf9a969,
  badgeGlyph: '⇄',
  controls: [
    { id: 'massA', label: 'Cart A mass', kind: 'range', min: 1, max: 10, step: 0.5, unit: 'kg' },
    { id: 'massB', label: 'Cart B mass', kind: 'range', min: 1, max: 10, step: 0.5, unit: 'kg' },
    { id: 'speed', label: 'Launch speed', kind: 'range', min: 2, max: 9, step: 0.5, unit: 'm/s' },
    { id: 'elasticity', label: 'Collision type', kind: 'select', options: [
      { value: 'slime', label: 'Slime · elastic' },
      { value: 'damp', label: 'Spring · partial' },
      { value: 'clay', label: 'Clay · inelastic' },
    ] },
  ],
  defaults: { massA: 4, massB: 2, speed: 6, elasticity: 'slime' },
  observeParams: { massA: 4, massB: 2, speed: 6, elasticity: 'slime' },
  observeCues: [
    { at: 0.1, text: 'Two carts, one collision. Your lane is on top; the reference lane below is always perfectly elastic.' },
    { at: 2.2, text: 'At impact the carts exchange forces. Cart A slows, Cart B accelerates — but the total momentum arrow never changes length.' },
    { at: 4.2, text: 'Now compare kinetic energy: in the elastic lane it is preserved; in clay, it disappears into deformation and heat.' },
    { at: 6.4, text: 'Momentum is a vector: direction matters. Kinetic energy is a scalar ledger, and it can change in a collision.' },
  ],
  challenge: {
    title: 'The Clay Contract',
    brief: 'Using the clay setting, make Cart B finish at 3.0 m/s. Keep it a genuine inelastic collision so the final kinetic energy is below 80% of the initial value.',
    hint: 'With clay they move together: v = m₁v₁/(m₁+m₂). Try equal masses and an initial speed of 6 m/s.',
    success: 'Cart B rolls away at the target speed. Momentum balanced; energy told the real story.',
    targetLabel: 'v_B(final) = 3.0 ± 0.15 m/s',
  },
  chart: {
    title: 'Collision energy',
    positionLabel: 'Cart A position',
    velocityLabel: 'Cart A speed',
    energyLabel: 'Kinetic energy',
  },
};

interface CartState {
  body: THREE.Group;
  x: number;
  vx: number;
  mass: number;
  size: number;
  shape: THREE.Mesh;
}

export class CollisionExperiment extends Experiment {
  private testA!: CartState;
  private testB!: CartState;
  private refA!: CartState;
  private refB!: CartState;
  private started = false;
  private collided = false;
  private flowTime = 0;
  private finalVB = 0;
  private finalVA = 0;
  private initialKE = 0;
  private finalKE = 0;
  private testLaneGroup = new THREE.Group();
  private refLaneGroup = new THREE.Group();
  private targetMarker!: THREE.Mesh;
  private vectorA!: THREE.ArrowHelper;
  private vectorB!: THREE.ArrowHelper;
  private startX = -4.2;
  private bStartX = -0.2;

  constructor() {
    super(collisionMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 12.5, height: 5.1, targetHeight: 2.4 };
  }

  buildVisual(): void {
    const group = this.visualRoot;
    group.add(meshBox(12.5, 0.26, 6.8, 0x31433f, { position: [0, 0.13, 0] }));
    for (const [lane, z, label, accent] of [
      ['test', 1.35, 'YOUR LANE', '#f9a969'],
      ['ref', -1.35, 'ELASTIC REFERENCE', '#77e9ff'],
    ] as const) {
      const laneGroup = lane === 'test' ? this.testLaneGroup : this.refLaneGroup;
      laneGroup.position.z = z;
      group.add(laneGroup);
      laneGroup.add(meshBox(11.4, 0.16, 1.22, 0x455852, { position: [0, 0.28, 0] }));
      laneGroup.add(meshBox(11, 0.025, 0.06, 0x88a49a, { position: [0, 0.38, 0], opacity: 0.5 }));
      laneGroup.add(meshBox(11, 0.025, 0.06, 0x88a49a, { position: [0, 0.38, 0.5], opacity: 0.5 }));
      for (let x = -5.4; x <= 5.4; x += 1.08) {
        laneGroup.add(meshBox(0.06, 0.03, 0.7, 0x9bb1a5, { position: [x, 0.4, 0], opacity: 0.3 }));
      }
      const sign = addSign(laneGroup, label, accent === '#f9a969' ? 'MOMENTUM TEST' : 'e = 1.00', accent, [0, 1.65, 0.9], 2.8);
      sign.position.z = 1.3;
    }

    this.testA = this.makeCart(this.testLaneGroup, 0xf2765b, 4, this.startX, 1.35);
    this.testB = this.makeCart(this.testLaneGroup, 0x64d8ff, 2, this.bStartX, 1.35);
    this.refA = this.makeCart(this.refLaneGroup, 0xf2765b, 4, this.startX, -1.35);
    this.refB = this.makeCart(this.refLaneGroup, 0x64d8ff, 2, this.bStartX, -1.35);

    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.035, 5, 20),
      new THREE.MeshBasicMaterial({ color: 0xffe19a, transparent: true, opacity: 0.66, toneMapped: false }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(3.8, 0.43, 1.35);
    this.targetMarker = marker;
    group.add(marker);

    this.vectorA = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-4, 1.3, 1.35), 1, 0xf2765b, 0.25, 0.16);
    this.vectorB = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-0.2, 1.3, 1.35), 1, 0x64d8ff, 0.25, 0.16);
    this.vectorA.visible = false;
    this.vectorB.visible = false;
    group.add(this.vectorA, this.vectorB);

    this.addBox(0.15, 4.3, 0.15, 0x3d5550, [-6.4, 2.15, 2.2]);
    this.addBox(1.1, 0.1, 0.1, 0x7d9c8e, [-6.4, 4.2, 2.2]);
    this.addStaticGlow([-6.4, 4.35, 2.2], '#f9a969', 2.3, 0.25);
    this.addLight('#ffbd7d', 1.1, 12, [0, 3, 3]);

    addSign(group, 'FRICTIONLESS TRACK', 'TOTAL p IS CONSERVED', '#f9a969', [0, 3.05, -2.7], 3.3);
  }

  private makeCart(parent: THREE.Object3D, color: number, mass: number, x: number, z: number): CartState {
    const body = new THREE.Group();
    body.position.set(x, 0.4, z);
    const size = 0.52 + mass * 0.045;
    const shape = meshBox(size, size, size * 0.82, color, {
      position: [0, size / 2, 0],
      metalness: 0.2,
      roughness: 0.48,
      emissive: color,
      emissiveIntensity: 0.08,
    });
    body.add(shape);
    const stripe = meshBox(size * 0.75, 0.05, size * 0.86, 0xf6d595, {
      position: [0, size * 0.66, 0],
      glow: true,
      opacity: 0.85,
    });
    body.add(stripe);
    for (const side of [-1, 1]) {
      for (const xw of [-0.22, 0.22]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10),
          new THREE.MeshStandardMaterial({ color: 0x273239, metalness: 0.5, roughness: 0.5 }),
        );
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(xw, 0.12, side * size * 0.45);
        body.add(wheel);
      }
    }
    parent.add(body);
    return { body, x, vx: 0, mass, size, shape };
  }

  private elasticity(): number {
    const value = this.str('elasticity');
    if (value === 'slime') return 1;
    if (value === 'damp') return 0.55;
    return 0;
  }

  resetSim(): void {
    if (!this.testA) return;
    this.started = false;
    this.collided = false;
    this.flowTime = 0;
    this.finalVA = 0;
    this.finalVB = 0;
    this.initialKE = 0;
    this.finalKE = 0;
    const mA = this.num('massA');
    const mB = this.num('massB');
    const speed = this.num('speed');
    for (const [cart, mass, x] of [
      [this.testA, mA, this.startX],
      [this.testB, mB, this.bStartX],
      [this.refA, mA, this.startX],
      [this.refB, mB, this.bStartX],
    ] as Array<[CartState, number, number]>) {
      cart.x = x;
      cart.vx = 0;
      cart.mass = mass;
      cart.body.position.x = x;
      cart.body.scale.setScalar(0.9 + mass * 0.018);
    }
    this.vectorA.visible = false;
    this.vectorB.visible = false;
    this.targetMarker.visible = this.str('elasticity') === 'clay';
  }

  protected onParamChange(): void {
    this.resetSim();
  }

  triggerPrimaryAction(): void {
    if (this.started) return;
    this.resetSim();
    this.started = true;
    this.flowTime = 0;
    this.collided = false;
    this.finalVB = 0;
    this.testA.vx = this.num('speed');
    this.refA.vx = this.num('speed');
    const mA = this.num('massA');
    const mB = this.num('massB');
    this.initialKE = 0.5 * mA * this.testA.vx ** 2;
    this.finalKE = this.initialKE;
    this.vectorA.visible = true;
    this.vectorB.visible = false;
  }

  getPrimaryActionLabel(): string | null {
    return this.started ? 'RUNNING…' : 'LAUNCH CART A';
  }

  canUsePrimaryAction(): boolean {
    return !this.started;
  }

  step(dt: number, env: EnvironmentState): void {
    if (this.targetMarker) {
      this.targetMarker.visible = this.str('elasticity') === 'clay';
      this.targetMarker.rotation.z += dt * 0.8;
    }
    if (this.observationActive && !this.started && this.simTime > 1.0) {
      this.triggerPrimaryAction();
    }
    if (!this.started) return;
    this.flowTime += dt;
    if (!this.collided) {
      const prevA = this.testA.x;
      this.testA.x += this.testA.vx * dt;
      this.refA.x += this.refA.vx * dt;
      const gapTest = this.testB.x - this.testA.x;
      const gapRef = this.refB.x - this.refA.x;
      if (this.testA.x > prevA && gapTest <= this.testA.size * 0.82 + 0.1) {
        this.resolveCollision(this.testA, this.testB, this.elasticity());
        this.resolveCollision(this.refA, this.refB, 1);
        this.collided = true;
        this.targetMarker.visible = false;
      } else if (gapRef <= this.refA.size * 0.82 + 0.1) {
        this.resolveCollision(this.refA, this.refB, 1);
      }
    } else {
      this.testA.x += this.testA.vx * dt;
      this.testB.x += this.testB.vx * dt;
      this.refA.x += this.refA.vx * dt;
      this.refB.x += this.refB.vx * dt;
    }
    this.testA.body.position.x = this.testA.x;
    this.testB.body.position.x = this.testB.x;
    this.refA.body.position.x = this.refA.x;
    this.refB.body.position.x = this.refB.x;
    this.vectorA.position.set(this.testA.x, 1.1, 1.35);
    this.vectorA.setLength(Math.max(0.3, Math.abs(this.testA.vx) * 0.25), 0.24, 0.14);
    this.vectorA.setDirection(new THREE.Vector3(Math.sign(this.testA.vx) || 1, 0, 0));
    this.vectorB.visible = this.collided;
    this.vectorB.position.set(this.testB.x, 1.1, 1.35);
    this.vectorB.setLength(Math.max(0.32, Math.abs(this.testB.vx) * 0.25), 0.24, 0.14);
    this.vectorB.setDirection(new THREE.Vector3(Math.sign(this.testB.vx) || 1, 0, 0));
    if (this.collided) {
      this.finalVA = this.testA.vx;
      this.finalVB = this.testB.vx;
      this.finalKE = 0.5 * this.testA.mass * this.testA.vx ** 2 + 0.5 * this.testB.mass * this.testB.vx ** 2;
    }
    if (this.flowTime > 5.5) {
      this.started = false;
      this.vectorA.visible = false;
      this.vectorB.visible = false;
    }
  }

  private resolveCollision(a: CartState, b: CartState, e: number): void {
    const m1 = a.mass;
    const m2 = b.mass;
    const v1 = a.vx;
    const v2 = b.vx;
    const u1 = ((m1 - e * m2) * v1 + (1 + e) * m2 * v2) / (m1 + m2);
    const u2 = ((m2 - e * m1) * v2 + (1 + e) * m1 * v1) / (m1 + m2);
    a.vx = u1;
    b.vx = u2;
    // Prevent visual overlap and keep the inelastic train joined.
    if (e === 0) b.x = a.x + a.size * 0.82 + 0.12;
    else b.x = a.x + a.size * 0.82 + 0.15;
  }

  isSolved(): boolean {
    if (this.str('elasticity') !== 'clay') return false;
    if (!this.collided) return false;
    if (this.finalKE >= this.initialKE * 0.8) return false;
    return this.finalVB > 2.85 && this.finalVB < 3.15;
  }

  getMetrics(): Readout[] {
    const mA = this.num('massA');
    const mB = this.num('massB');
    const pInitial = mA * this.num('speed');
    const pFinal = this.started && this.collided ? mA * this.finalVA + mB * this.finalVB : pInitial;
    return [
      { label: 'Momentum before', value: pInitial.toFixed(1), unit: 'kg·m/s', tone: 'warm' },
      { label: 'Momentum after', value: this.collided ? pFinal.toFixed(1) : '—', unit: this.collided ? 'kg·m/s' : undefined, tone: 'accent' },
      { label: 'Cart A final', value: this.collided ? this.finalVA.toFixed(2) : '—', unit: this.collided ? 'm/s' : undefined },
      { label: 'Cart B final', value: this.collided ? this.finalVB.toFixed(2) : '—', unit: this.collided ? 'm/s' : undefined, tone: this.isSolved() ? 'accent' : 'cool' },
      { label: 'KE retained', value: this.started && this.initialKE > 0 ? `${((this.finalKE / this.initialKE) * 100).toFixed(0)}%` : '—', tone: this.str('elasticity') === 'clay' ? 'danger' : 'muted' },
    ];
  }

  getTelemetryTargets(): TelemetryTarget[] {
    if (!this.testA) return [];
    const make = (cart: CartState, id: string, label: string) =>
      this.makeTelemetry(id, cart.body, label, cart.mass, () => ({
        position: new THREE.Vector3(cart.x, 0.5, cart.body.position.z),
        velocity: new THREE.Vector3(cart.vx, 0, 0),
        acceleration: new THREE.Vector3(0, 0, 0),
      }));
    return [make(this.testA, 'cart-a', 'Cart A'), make(this.testB, 'cart-b', 'Cart B')];
  }

  override getGraphSample(): GraphSample {
    const v = this.testA?.vx ?? 0;
    const ke = 0.5 * (this.testA?.mass ?? 1) * v * v + 0.5 * (this.testB?.mass ?? 1) * (this.testB?.vx ?? 0) ** 2;
    return {
      t: this.simTime,
      position: this.testA?.x ?? 0,
      velocity: v,
      ke,
      pe: 0,
      primaryLabel: 'Cart A position',
      secondaryLabel: 'Momentum lane',
    };
  }
}

// -----------------------------------------------------------------------------
// 1.4 — Simple Harmonic Pendulum Clocktower
// -----------------------------------------------------------------------------

const pendulumMeta: ExperimentMeta = {
  id: 'pendulum',
  biome: 'classical',
  number: '1.4',
  title: 'Simple Harmonic Pendulum Clocktower',
  shortTitle: 'Pendulum Clocktower',
  subtitle: 'The mass is a red herring.',
  description:
    'A giant brass pendulum swings beneath a hand-built clock. Lengthen the arm, change the bob, or alter gravity and see which variable actually sets the beat.',
  concept: 'For small swings, a pendulum’s period is T = 2π√(L/g). It depends on length and gravity, not on the mass of the bob.',
  realWorld: 'Pendulum clocks regulated time for centuries. The same simple harmonic motion appears in swings, metronomes, and suspension bridges.',
  formula: 'T ≈ 2π√(L/g)     ·     θ(t) = θ₀cos(√(g/L)t)',
  formulaNote: 'Mass sits on both sides of Newton’s second law and cancels. The large-amplitude exact period is slightly longer; the tower integrates the true nonlinear equation.',
  badgeName: 'Metronome',
  accent: '#efc778',
  accentNumber: 0xefc778,
  badgeGlyph: '◔',
  controls: [
    { id: 'length', label: 'String length', kind: 'range', min: 0.6, max: 4.2, step: 0.02, unit: 'm' },
    { id: 'mass', label: 'Bob mass', kind: 'range', min: 1, max: 20, step: 0.5, unit: 'kg' },
    { id: 'amplitude', label: 'Release angle', kind: 'range', min: 5, max: 35, step: 1, unit: '°' },
  ],
  defaults: { length: 2.4, mass: 8, amplitude: 20 },
  observeParams: { length: 2.4, mass: 8, amplitude: 20 },
  observeCues: [
    { at: 0.1, text: 'The brass bob is heavy, and the wooden one on the left is light. Same string length, same gravity — watch their beats.' },
    { at: 2.8, text: 'Their swings stay in step. Mass changes the force needed to move the bob, but not the time it takes to return.' },
    { at: 5.4, text: 'Now shorten the string. A shorter pendulum has a stronger restoring pull per metre and swings faster.' },
    { at: 7.6, text: 'T = 2π√(L/g). Longer L means a longer period. The bob’s mass never appears in the equation.' },
  ],
  challenge: {
    title: 'Two-Second Beat',
    brief: 'Tune the pendulum so its measured period is 2.00 s, then complete two clean cycles. Gravity is whatever the Environment Book says.',
    hint: 'At Earth gravity, solve T = 2π√(L/g) for L. Mass is irrelevant.',
    success: 'A two-second period. The clock keeps time through length, not weight.',
    targetLabel: 'Measured period = 2.00 ± 0.03 s',
  },
  chart: {
    title: 'Angular motion',
    positionLabel: 'Angle (rad)',
    velocityLabel: 'Angular speed',
    energyLabel: 'Pendulum energy (J)',
  },
};

export class PendulumExperiment extends Experiment {
  private pivot!: THREE.Group;
  private rod!: THREE.Mesh;
  private bob!: THREE.Group;
  private ghostBob!: THREE.Group;
  private clockHand!: THREE.Mesh;
  private theta = 0;
  private omega = 0;
  private measuredPeriod = 0;
  private lastCrossing: number | null = null;
  private previousTheta = 0;
  private crossings = 0;
  private arcLine!: THREE.Line;
  private releaseAmplitude = 20;
  private bobMass = 8;
  private armLength = 2.4;
  private swingTime = 0;
  private targetTick!: THREE.Group;

  constructor() {
    super(pendulumMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 13.5, height: 4.9, targetHeight: 3.7 };
  }

  buildVisual(): void {
    const group = this.visualRoot;
    group.add(meshBox(7.5, 0.3, 4.8, 0x5b4a34, { position: [0, 0.15, 0] }));
    group.add(meshBox(6.9, 0.12, 4.1, 0x8d734d, { position: [0, 0.36, 0] }));
    // Tower posts, crossbar and clock face.
    for (const x of [-2.7, 2.7]) {
      group.add(meshBox(0.34, 7.6, 0.34, 0x4a382b, { position: [x, 3.9, -1.15] }));
      group.add(meshBox(0.52, 0.22, 0.52, C.brass, { position: [x, 0.28, -1.15] }));
      group.add(meshBox(0.16, 1.4, 0.16, 0x1b2630, { position: [x, 7.45, -1.15] }));
    }
    group.add(meshBox(6.5, 0.33, 0.42, 0x5b4634, { position: [0, 7.65, -1.15] }));
    group.add(meshBox(6.1, 0.08, 0.2, C.brassLight, { position: [0, 7.83, -1.0], glow: true }));

    const clockGroup = new THREE.Group();
    clockGroup.position.set(0, 6.45, -1.33);
    group.add(clockGroup);
    const face = new THREE.Mesh(
      new THREE.CylinderGeometry(1.37, 1.37, 0.22, 32),
      new THREE.MeshStandardMaterial({ color: 0xeadcc0, roughness: 0.7, metalness: 0.03 }),
    );
    face.rotation.x = Math.PI / 2;
    clockGroup.add(face);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.12, 8, 36),
      new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.8, roughness: 0.3 }),
    );
    clockGroup.add(rim);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tick = meshBox(0.035, 0.16, 0.035, i % 3 === 0 ? 0x24211b : 0x7c6e58, {
        position: [Math.sin(a) * 1.12, Math.cos(a) * 1.12, 0.15],
        rotation: [0, 0, -a],
      });
      clockGroup.add(tick);
    }
    const hand = meshBox(0.035, 0.78, 0.035, 0x2b271e, { position: [0, 0.35, 0.17], rotation: [0, 0, 0.4] });
    this.clockHand = hand;
    clockGroup.add(hand);
    const smallHand = meshBox(0.025, 0.5, 0.025, C.brass, { position: [0, 0.23, 0.18], rotation: [0, 0, -1.1] });
    clockGroup.add(smallHand);
    addSign(group, 'PERIOD CLOCK', 'THE BOB’S MASS CANCELS OUT', '#efc778', [0, 5.15, -1.03], 3.5);

    // Pendulum pivot and arm.
    this.pivot = new THREE.Group();
    this.pivot.position.set(0, 7.65, 0);
    group.add(this.pivot);
    const axle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 1.4, 12),
      new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.8, roughness: 0.25 }),
    );
    axle.rotation.x = Math.PI / 2;
    axle.position.z = -0.1;
    this.pivot.add(axle);
    this.rod = meshBox(0.035, 1, 0.035, 0x27221e, { position: [0, -0.5, 0], metalness: 0.4, roughness: 0.45 });
    this.pivot.add(this.rod);
    this.bob = new THREE.Group();
    const bobCore = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.58, 1),
      new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.72, roughness: 0.3, flatShading: true }),
    );
    this.bob.add(bobCore);
    const bobRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.035, 6, 26),
      new THREE.MeshBasicMaterial({ color: 0xffe4a1, transparent: true, opacity: 0.55, toneMapped: false }),
    );
    bobRing.rotation.x = Math.PI / 2;
    this.bob.add(bobRing);
    this.pivot.add(this.bob);

    // A small reference bob communicates mass independence.
    const reference = new THREE.Group();
    reference.position.set(-1.75, 7.65, 1.0);
    reference.add(meshBox(0.025, 2.4, 0.025, 0x5e574b, { position: [0, -1.2, 0] }));
    const lightBob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.25, 1),
      new THREE.MeshStandardMaterial({ color: 0x9dd6e2, metalness: 0.2, roughness: 0.45, flatShading: true }),
    );
    lightBob.position.y = -2.4;
    reference.add(lightBob);
    reference.rotation.z = 0.2;
    this.ghostBob = reference;
    group.add(reference);

    // Arc and timing track.
    const arcPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 42; i++) {
      const a = -0.6 + (i / 42) * 1.2;
      arcPoints.push(new THREE.Vector3(Math.sin(a) * 4, 0.48, Math.cos(a) * 0 - 0.2));
    }
    this.arcLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(arcPoints),
      new THREE.LineBasicMaterial({ color: 0xefc778, transparent: true, opacity: 0.25, toneMapped: false }),
    );
    group.add(this.arcLine);
    this.addLight('#ffd38d', 1.4, 15, [0, 5, 2]);

    addSign(group, 'PERIOD CLOCK', 'MASS DOES NOT AFFECT PERIOD', '#efc778', [0, 9.0, 0], 3.6).rotation.y = 0;
  }

  private updateGeometry(): void {
    if (!this.pivot) return;
    const L = this.num('length');
    const mass = this.num('mass');
    this.rod.scale.y = L;
    this.rod.position.y = -L / 2;
    this.bob.position.y = -L;
    const scale = 0.8 + Math.cbrt(mass / 8) * 0.35;
    this.bob.scale.setScalar(scale);
    this.ghostBob.scale.setScalar(Math.max(0.65, Math.min(1.2, 0.8 / scale)));
    this.ghostBob.children[0].scale.y = L / 2.4;
    this.ghostBob.children[0].position.y = -L / 2;
    this.ghostBob.children[1].position.y = -L;
    this.ghostBob.rotation.z = 0.2;
    this.armLength = L;
    this.bobMass = mass;
  }

  resetSim(): void {
    if (!this.pivot) return;
    this.updateGeometry();
    const amp = THREE.MathUtils.degToRad(this.num('amplitude'));
    this.theta = amp;
    this.omega = 0;
    this.releaseAmplitude = amp;
    this.previousTheta = amp;
    this.crossings = 0;
    this.lastCrossing = null;
    this.measuredPeriod = 0;
    this.swingTime = 0;
    this.pivot.rotation.z = this.theta;
    this.ghostBob.rotation.z = this.theta;
    this.syncClock();
  }

  private syncClock(): void {
    if (!this.clockHand) return;
    this.clockHand.rotation.z = -this.simTime * 0.55;
  }

  protected onParamChange(): void {
    this.resetSim();
  }

  triggerPrimaryAction(): void {
    this.resetSim();
  }

  getPrimaryActionLabel(): string | null {
    return 'RESTART SWING';
  }

  step(dt: number, env: EnvironmentState): void {
    if (!this.pivot) return;
    const damping = env.air === 'vacuum' ? 0.001 : 0.014;
    const alpha = -(env.gravity / Math.max(0.1, this.armLength)) * Math.sin(this.theta) - damping * this.omega;
    this.omega += alpha * dt;
    this.previousTheta = this.theta;
    this.theta += this.omega * dt;
    this.swingTime += dt;

    if (this.previousTheta > 0 && this.theta <= 0) {
      const crossing = this.simTime - dt + dt * (this.previousTheta / (this.previousTheta - this.theta));
      if (this.lastCrossing != null) {
        this.measuredPeriod = (crossing - this.lastCrossing);
        this.crossings++;
      }
      this.lastCrossing = crossing;
    }
    this.pivot.rotation.z = this.theta;
    this.ghostBob.rotation.z = this.theta;
    this.syncClock();

    // Let the pendulum ring the hour when a full period is completed.
    if (this.crossings > 0 && this.crossings % 2 === 0) {
      const ring = 1 + Math.sin(this.simTime * 5) * 0.1;
      (this.arcLine.material as THREE.LineBasicMaterial).opacity = 0.2 + ring * 0.04;
    }
    if (this.releaseAmplitude && Math.abs(this.theta) > Math.abs(this.releaseAmplitude)) {
      this.releaseAmplitude = Math.abs(this.theta);
    }
  }

  isSolved(): boolean {
    if (this.crossings < 2) return false;
    return Math.abs(this.measuredPeriod - 2.0) <= 0.03;
  }

  getMetrics(env: EnvironmentState): Readout[] {
    const theoretical = 2 * Math.PI * Math.sqrt(this.armLength / Math.max(env.gravity, 0.001));
    return [
      { label: 'Measured period', value: this.crossings > 0 ? this.measuredPeriod.toFixed(3) : '—', unit: this.crossings > 0 ? 's' : undefined, tone: this.isSolved() ? 'accent' : 'cool' },
      { label: 'Small-angle T', value: theoretical.toFixed(2), unit: 's' },
      { label: 'Frequency', value: theoretical > 0 ? (1 / theoretical).toFixed(3) : '0', unit: 'Hz' },
      { label: 'Bob mass', value: this.num('mass').toFixed(1), unit: 'kg', tone: 'muted' },
      { label: 'Length', value: this.num('length').toFixed(2), unit: 'm', tone: 'warm' },
      { label: 'Gravity', value: env.gravity.toFixed(2), unit: 'm/s²' },
    ];
  }

  getTelemetryTargets(): TelemetryTarget[] {
    if (!this.bob) return [];
    const rodTip = new THREE.Vector3(
      Math.sin(this.theta) * this.armLength,
      7.65 - Math.cos(this.theta) * this.armLength,
      0,
    );
    return [
      this.makeTelemetry('pendulum-bob', this.bob, 'Brass pendulum bob', this.num('mass'), () => ({
        position: rodTip.clone(),
        velocity: new THREE.Vector3(
          Math.cos(this.theta) * this.omega * this.armLength,
          Math.sin(this.theta) * this.omega * this.armLength,
          0,
        ),
        acceleration: new THREE.Vector3(
          -Math.sin(this.theta) * (9.81 / Math.max(this.armLength, 0.1)) * this.armLength,
          -Math.cos(this.theta) * (9.81 / Math.max(this.armLength, 0.1)) * this.armLength,
          0,
        ),
        potentialReference: 7.65 - this.armLength,
      })),
    ];
  }

  override getGraphSample(): GraphSample {
    const mass = this.num('mass');
    const height = 7.65 - Math.cos(this.theta) * this.armLength;
    const speed = Math.abs(this.omega) * this.armLength;
    return {
      t: this.simTime,
      position: this.theta,
      velocity: this.omega,
      ke: 0.5 * mass * speed * speed,
      pe: mass * 9.81 * height,
      primaryLabel: 'Pendulum angle',
      secondaryLabel: 'Brass bob',
    };
  }
}
