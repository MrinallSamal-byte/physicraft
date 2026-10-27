import * as THREE from 'three';
import { Experiment } from '../BaseExperiment';
import type { ExperimentMeta, GraphSample, Readout, TelemetryTarget, VectorProbe } from '../types';
import type { EnvironmentState } from '../../config';
import { meshBox } from '../../world/voxel';
import { makeReadoutTexture } from '../../world/labels';
import { clamp } from '../../core/utils';

const T = {
  steel: 0x394b55,
  steelLight: 0x6b8490,
  copper: 0xb7744d,
  brass: 0xc7a45f,
  ink: 0x0c1a20,
  glass: 0xa8e8ef,
  water: 0x1c7d9d,
  oil: 0xb38a45,
  mercury: 0xb8c4cd,
  mint: 0x60efcf,
  heater: 0xff6b3d,
  cyan: 0x69e7ff,
};

const MATERIAL_DENSITIES: Record<string, { label: string; density: number; color: number }> = {
  wood: { label: 'Pine wood', density: 600, color: 0xa36e3f },
  ice: { label: 'Glacial ice', density: 917, color: 0xaedbea },
  aluminum: { label: 'Aluminium', density: 2700, color: 0xaebfc7 },
  iron: { label: 'Cast iron', density: 7874, color: 0x53636c },
  gold: { label: 'Gold', density: 19300, color: 0xe6b855 },
};

const FLUID_DENSITIES: Record<string, { label: string; density: number; color: number; opacity: number }> = {
  water: { label: 'Water', density: 1000, color: 0x268db0, opacity: 0.32 },
  oil: { label: 'Olive oil', density: 850, color: 0xb2914f, opacity: 0.38 },
  mercury: { label: 'Mercury', density: 13546, color: 0xbac5cb, opacity: 0.5 },
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
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: true,
      alphaTest: 0.05,
      toneMapped: false,
      side: THREE.FrontSide,
    }),
  );
  mesh.position.set(...position);

  // Solid physical backing casing preventing visual slicing
  const casingHeight = size / 3;
  const casing = new THREE.Mesh(
    new THREE.BoxGeometry(size + 0.1, casingHeight + 0.08, 0.06),
    new THREE.MeshStandardMaterial({
      color: 0x0c1622,
      roughness: 0.35,
      metalness: 0.8,
    }),
  );
  casing.position.set(0, 0, -0.031);
  mesh.add(casing);

  // Metallic trim
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(size + 0.12, casingHeight + 0.1, 0.015),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(accent).multiplyScalar(0.75),
      roughness: 0.25,
      metalness: 0.9,
    }),
  );
  trim.position.set(0, 0, -0.042);
  mesh.add(trim);

  parent.add(mesh);
  return mesh;
}

function glassBox(width: number, height: number, depth: number, opacity = 0.08): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshPhysicalMaterial({
      color: 0x9ee6ef,
      transparent: true,
      opacity,
      roughness: 0.03,
      metalness: 0.01,
      transmission: 0.75,
      thickness: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
}

// -----------------------------------------------------------------------------
// 2.1 — Archimedes' Displacement Basin
// -----------------------------------------------------------------------------

const buoyancyMeta: ExperimentMeta = {
  id: 'buoyancy',
  biome: 'thermo',
  number: '2.1',
  title: "Archimedes' Displacement Basin",
  shortTitle: 'Displacement Basin',
  subtitle: 'Why does a steel ship float?',
  description:
    'Lower blocks of different density into water, oil, or mercury. Compare displaced-fluid weight with the block’s own weight, then hollow a metal block until it hovers in neutral buoyancy.',
  concept: 'The buoyant force equals the weight of displaced fluid: F_b = ρ_fluid g V_submerged. An object floats when its average density is less than the fluid’s.',
  realWorld: 'Ships float because their hull encloses air; submarines trim ballast tanks; hot-air balloons use the same principle in a fluid of air.',
  formula: 'F_b = ρ_f g V_sub     ·     floating: V_sub/V = ρ_object/ρ_fluid',
  formulaNote: 'The block sinks until the displaced fluid weighs as much as the block. Hollowing lowers average density without changing external volume.',
  badgeName: 'Neutral Buoyancy',
  accent: '#6af3d0',
  accentNumber: 0x6af3d0,
  badgeGlyph: '≈',
  controls: [
    { id: 'material', label: 'Block material', kind: 'select', options: [
      { value: 'wood', label: 'Pine · 600 kg/m³' },
      { value: 'ice', label: 'Ice · 917 kg/m³' },
      { value: 'aluminum', label: 'Aluminium · 2700' },
      { value: 'iron', label: 'Iron · 7874' },
      { value: 'gold', label: 'Gold · 19300' },
    ] },
    { id: 'fluid', label: 'Basin fluid', kind: 'select', options: [
      { value: 'water', label: 'Water · 1000 kg/m³' },
      { value: 'oil', label: 'Oil · 850 kg/m³' },
      { value: 'mercury', label: 'Mercury · 13546 kg/m³' },
    ] },
    { id: 'hollow', label: 'Hollow core', kind: 'range', min: 0, max: 88, step: 1, unit: '%', hint: 'Reduces average density while keeping the outer volume constant.' },
  ],
  defaults: { material: 'wood', fluid: 'water', hollow: 0 },
  observeParams: { material: 'iron', fluid: 'water', hollow: 0 },
  observeCues: [
    { at: 0.1, text: 'The iron block is denser than water, so it cannot displace enough water to support itself. It sinks.' },
    { at: 2.4, text: 'Buoyancy is not a mysterious upward force — it is the weight of the fluid pushed aside.' },
    { at: 4.8, text: 'Now watch the block’s weight and buoyant force. At equilibrium they are exactly equal.' },
    { at: 7.0, text: 'Hollow a dense block and its average density falls. With enough empty volume, iron itself can float.' },
  ],
  challenge: {
    title: 'The Impossible Float',
    brief: 'Make an aluminium block hover at 50% submersion in water. Adjust only the hollow core.',
    hint: 'To float at 50% depth, effective density must be half of water (500 kg/m³). Aluminium is 2700 kg/m³, so hollow it to ~81-82% empty volume.',
    success: 'Aluminium, suspended in water at half-depth. Archimedes would call that a balanced ledger.',
    targetLabel: 'Submerged fraction = 50% ± 4%',
  },
  chart: {
    title: 'Buoyancy balance',
    positionLabel: 'Depth (m)',
    velocityLabel: 'Vertical speed (m/s)',
    energyLabel: 'Energy (J)',
  },
};

interface BuoyancyState {
  y: number;
  vy: number;
  submerged: number;
  buoyant: number;
  weight: number;
  settledFor: number;
}

export class BuoyancyExperiment extends Experiment {
  private block!: THREE.Mesh;
  private fluidMesh!: THREE.Mesh;
  private tankTop = 4.15;
  private tankBottom = 0.95;
  private blockSize = 1.05;
  private dropped = false;
  private state: BuoyancyState = { y: 0, vy: 0, submerged: 0, buoyant: 0, weight: 0, settledFor: 0 };
  private cable!: THREE.Line;
  private craneHook!: THREE.Group;
  private blockMat!: THREE.MeshStandardMaterial;
  private fluidMat!: THREE.MeshPhysicalMaterial;
  private scaleWaterLine!: THREE.Line;
  private bubbles!: THREE.Points;
  private bubblePositions!: Float32Array;
  private surfaceY = 3.45;
  private blockStartY = 0;
  private markers!: THREE.Group;

  constructor() {
    super(buoyancyMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 10.6, height: 4.8, targetHeight: 2.7 };
  }

  buildVisual(): void {
    const group = this.visualRoot;
    group.add(meshBox(7.5, 0.36, 6.4, 0x2b3d42, { position: [0, 0.18, 0] }));
    group.add(meshBox(6.9, 0.12, 5.8, 0x3f585c, { position: [0, 0.4, 0] }));

    // Tank with a visible graduated side.
    group.add(glassBox(4.7, 4.8, 3.8, 0.08).translateY(3.05));
    group.add(meshBox(5.0, 0.28, 4.1, T.steel, { position: [0, 0.55, 0] }));
    for (const x of [-2.45, 2.45]) {
      group.add(meshBox(0.12, 5.2, 0.16, T.steelLight, { position: [x, 3.1, -2.0] }));
      group.add(meshBox(0.12, 5.2, 0.16, T.steelLight, { position: [x, 3.1, 2.0] }));
    }
    for (let level = 0; level < 8; level++) {
      group.add(meshBox(0.28, 0.035, 0.05, 0xd4ecdf, { position: [-2.5, 1.25 + level * 0.5, 2.08], opacity: 0.6 }));
      if (level % 2 === 0) {
        group.add(meshBox(0.5, 0.035, 0.035, 0x7fa8a3, { position: [-2.7, 1.25 + level * 0.5, 2.08] }));
      }
    }

    this.fluidMat = new THREE.MeshPhysicalMaterial({
      color: FLUID_DENSITIES.water.color,
      transparent: true,
      opacity: FLUID_DENSITIES.water.opacity,
      roughness: 0.12,
      metalness: 0,
      transmission: 0.25,
      thickness: 1.6,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.fluidMesh = new THREE.Mesh(new THREE.BoxGeometry(4.25, 1, 3.4), this.fluidMat);
    group.add(this.fluidMesh);
    this.scaleWaterLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-2.1, 0, 1.72),
        new THREE.Vector3(2.1, 0, 1.72),
      ]),
      new THREE.LineBasicMaterial({ color: 0xbafff0, transparent: true, opacity: 0.55, toneMapped: false }),
    );
    group.add(this.scaleWaterLine);

    // Crane and hook.
    group.add(meshBox(0.28, 7.6, 0.28, T.steel, { position: [-3.5, 4.2, -2.4] }));
    group.add(meshBox(0.28, 7.6, 0.28, T.steel, { position: [3.5, 4.2, -2.4] }));
    group.add(meshBox(7.3, 0.32, 0.32, T.steel, { position: [0, 7.95, -2.4] }));
    group.add(meshBox(7.3, 0.05, 0.1, T.brass, { position: [0, 7.72, -2.28], glow: true }));
    this.craneHook = new THREE.Group();
    this.craneHook.position.set(0, 7.35, 0);
    const hookBar = meshBox(0.7, 0.12, 0.12, T.brass, { position: [0, 0, 0] });
    this.craneHook.add(hookBar);
    this.craneHook.add(meshBox(0.08, 0.65, 0.08, T.steelLight, { position: [0, -0.35, 0] }));
    const hook = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.045, 6, 18, Math.PI * 1.5),
      new THREE.MeshStandardMaterial({ color: T.brass, metalness: 0.8, roughness: 0.28 }),
    );
    hook.position.y = -0.83;
    hook.rotation.z = Math.PI * 0.4;
    this.craneHook.add(hook);
    group.add(this.craneHook);
    this.cable = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xd0eaf0, transparent: true, opacity: 0.5 }),
    );
    group.add(this.cable);

    // Block.
    this.blockMat = new THREE.MeshStandardMaterial({
      color: MATERIAL_DENSITIES.wood.color,
      roughness: 0.55,
      metalness: 0.1,
      emissive: 0x000000,
    });
    this.block = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 1.05), this.blockMat);
    this.block.castShadow = true;
    this.block.receiveShadow = true;
    group.add(this.block);
    this.addStaticGlow([0, 4.2, 1.6], '#71ffe0', 3.2, 0.16);
    this.addLight('#6df5d2', 1.2, 9, [0, 4, 2]);
    addSign(group, 'DISPLACEMENT BASIN', 'F_b = WEIGHT OF DISPLACED FLUID', '#6af3d0', [0, 6.95, -2.3], 4.0);
    addSign(group, 'DENSITY', 'ρ = m / V', '#c3fff1', [3.6, 2.9, 0.7], 2.2);
    addSign(group, 'SCALE', 'LITRES DISPLACED', '#a7e6de', [-3.75, 2.9, 0.9], 2.4);
    this.markers = new THREE.Group();
    group.add(this.markers);

    // Air bubbles in the fluid.
    const positions: number[] = [];
    for (let i = 0; i < 40; i++) {
      positions.push((Math.random() - 0.5) * 3.8, Math.random() * 2.4 + 1, (Math.random() - 0.5) * 2.9);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.bubblePositions = new Float32Array(positions);
    this.bubbles = new THREE.Points(
      bg,
      new THREE.PointsMaterial({ color: 0xbaffef, size: 0.055, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    group.add(this.bubbles);

    // A vertical reference rail for 50% submersion.
    const ref = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(2.15, this.surfaceY - 0.525, 1.9), new THREE.Vector3(2.15, this.surfaceY + 1.2, 1.9)]),
      new THREE.LineDashedMaterial({ color: 0xf6dc92, dashSize: 0.12, gapSize: 0.09, transparent: true, opacity: 0.44 }),
    );
    ref.computeLineDistances();
    group.add(ref);

    this.updateVisuals();
  }

  private materialInfo() {
    return MATERIAL_DENSITIES[this.str('material')] ?? MATERIAL_DENSITIES.wood;
  }

  private fluidInfo() {
    return FLUID_DENSITIES[this.str('fluid')] ?? FLUID_DENSITIES.water;
  }

  private effectiveDensity(): number {
    return this.materialInfo().density * (1 - this.num('hollow') / 100);
  }

  private resetDropState(): void {
    const material = this.materialInfo();
    const fluid = this.fluidInfo();
    this.surfaceY = this.tankBottom + 2.5;
    this.blockStartY = this.surfaceY + 2.3;
    this.state = {
      y: this.blockStartY,
      vy: 0,
      submerged: 0,
      buoyant: 0,
      weight: 0,
      settledFor: 0,
    };
    this.dropped = false;
    this.block.position.set(0, this.blockStartY, 0);
    this.block.rotation.set(0, 0, 0);
    this.block.scale.setScalar(1);
    this.block.visible = true;
    this.blockMat.color.setHex(material.color);
    this.blockMat.emissive.setHex(0x000000);
    this.fluidMat.color.setHex(fluid.color);
    this.fluidMat.opacity = fluid.opacity;
    this.fluidMesh.scale.y = 2.5;
    this.fluidMesh.position.set(0, this.tankBottom + 1.25, 0);
    this.scaleWaterLine.position.y = this.surfaceY;
    this.craneHook.position.y = this.blockStartY + 1.6;
    this.craneHook.visible = true;
    this.cable.visible = true;
    this.updateCable();
    this.bubbles.visible = this.str('fluid') !== 'mercury';
    this.craneHook.position.x = 0;
  }

  resetSim(): void {
    if (!this.block) return;
    this.resetDropState();
  }

  private updateCable(): void {
    if (!this.cable) return;
    const positions = this.cable.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, 0, 7.3, 0);
    positions.setXYZ(1, 0, this.block.position.y + 0.7, 0);
    positions.needsUpdate = true;
  }

  protected onParamChange(): void {
    this.resetSim();
  }

  triggerPrimaryAction(): void {
    if (this.dropped) {
      this.resetSim();
      return;
    }
    this.dropped = true;
    this.craneHook.visible = false;
    this.cable.visible = false;
  }

  getPrimaryActionLabel(): string | null {
    return this.dropped ? 'RESET BLOCK' : 'DROP BLOCK';
  }

  step(dt: number, env: EnvironmentState): void {
    if (!this.block) return;
    this.updateVisuals();
    if (this.observationActive && !this.dropped && this.simTime > 1.2) this.triggerPrimaryAction();
    if (!this.dropped) return;

    const material = this.materialInfo();
    const fluid = this.fluidInfo();
    const rhoObj = this.effectiveDensity();
    const volume = this.blockSize ** 3;
    const area = this.blockSize ** 2;
    const mass = rhoObj * volume;
    const g = Math.max(env.gravity, 0.001);
    const bottom = this.state.y - this.blockSize / 2;
    const submergedDepth = clamp(this.surfaceY - bottom, 0, this.blockSize);
    const submergedFraction = submergedDepth / this.blockSize;
    const displacedVolume = submergedFraction * volume;
    const buoyant = fluid.density * displacedVolume * g;
    const weight = mass * g;
    const fluidDamping = fluid.density > 2000 ? 7.5 : 4.0;
    const damping = 0.3 + submergedFraction * fluidDamping;
    const accelY = (buoyant - weight) / Math.max(mass, 0.001) - damping * this.state.vy;
    this.state.vy += accelY * dt;
    this.state.y += this.state.vy * dt;
    const floor = this.tankBottom + this.blockSize / 2;
    if (this.state.y < floor) {
      this.state.y = floor;
      this.state.vy = 0;
    }
    if (this.state.y > this.blockStartY) {
      this.state.y = this.blockStartY;
      this.state.vy = Math.min(0, this.state.vy);
    }
    this.state.submerged = submergedFraction;
    this.state.buoyant = buoyant;
    this.state.weight = weight;
    const equilibriumSpeed = Math.abs(this.state.vy);
    if (equilibriumSpeed < 0.025) this.state.settledFor += dt;
    else this.state.settledFor = 0;

    this.block.position.y = this.state.y;
    this.block.rotation.z = Math.sin(this.simTime * 1.2) * 0.015 * submergedFraction;
    this.block.rotation.y += dt * 0.06 * (submergedFraction > 0.1 ? 1 : 0);

    // Bubbles rise more energetically when a block displaces fluid.
    if (this.bubbles.visible) {
      const attr = this.bubbles.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        let y = attr.getY(i) + dt * (0.16 + submergedFraction * 0.28);
        if (y > this.surfaceY) y = this.tankBottom + 0.2;
        attr.setY(i, y);
      }
      attr.needsUpdate = true;
    }
    this.updateCable();
  }

  private updateVisuals(): void {
    if (!this.fluidMat) return;
    const material = this.materialInfo();
    const fluid = this.fluidInfo();
    this.blockMat.color.setHex(material.color);
    this.fluidMat.color.setHex(fluid.color);
    const elem = this.markers;
    while (elem.children.length) {
      const child = elem.children[0];
      child.removeFromParent();
    }
  }

  isSolved(): boolean {
    if (this.str('material') !== 'aluminum' || this.str('fluid') !== 'water') return false;
    if (!this.dropped) return false;
    if (this.state.settledFor < 0.6) return false;
    const fraction = this.state.submerged;
    return fraction >= 0.46 && fraction <= 0.54;
  }

  getMetrics(env: EnvironmentState): Readout[] {
    const material = this.materialInfo();
    const fluid = this.fluidInfo();
    return [
      { label: 'Block density', value: this.effectiveDensity().toFixed(0), unit: 'kg/m³', tone: 'warm' },
      { label: 'Fluid density', value: fluid.density.toFixed(0), unit: 'kg/m³' },
      { label: 'Buoyant force', value: this.dropped ? (this.state.buoyant / 1000).toFixed(2) : '—', unit: this.dropped ? 'kN' : undefined, tone: 'cool' },
      { label: 'Weight', value: this.dropped ? (this.state.weight / 1000).toFixed(2) : '—', unit: this.dropped ? 'kN' : undefined },
      { label: 'Submerged', value: this.dropped ? (this.state.submerged * 100).toFixed(0) : '—', unit: this.dropped ? '%' : undefined, tone: this.isSolved() ? 'accent' : 'muted' },
      { label: 'Displaced', value: this.dropped ? ((this.state.submerged * this.blockSize ** 3) * 1000).toFixed(0) : '—', unit: this.dropped ? 'L' : undefined },
    ];
  }

  getTelemetryTargets(): TelemetryTarget[] {
    if (!this.block) return [];
    const blockMass = Math.max(0.01, this.effectiveDensity() * this.blockSize ** 3);
    return [
      this.makeTelemetry('buoyancy-block', this.block, `${MATERIAL_DENSITIES[this.str('material')]?.label ?? 'Block'} block`, blockMass, () => ({
        position: this.block.position.clone(),
        velocity: new THREE.Vector3(0, this.state.vy, 0),
        acceleration: new THREE.Vector3(0, (this.state.buoyant - this.state.weight) / blockMass, 0),
        potentialReference: this.tankBottom,
        extra: [
          { label: 'Buoyancy', value: `${(this.state.buoyant / 1000).toFixed(2)} kN` },
          { label: 'Submerged', value: `${(this.state.submerged * 100).toFixed(0)}%` },
        ],
      })),
    ];
  }

  override getVectorProbes(env: EnvironmentState): VectorProbe[] {
    return [
      {
        id: 'buoyancy',
        position: this.block.position.clone(),
        velocity: new THREE.Vector3(0, this.state.vy, 0),
        gravity: new THREE.Vector3(0, -env.gravity * 0.5, 0),
        normal: new THREE.Vector3(0, (this.state.buoyant / Math.max(this.state.weight, 1)) * env.gravity * 0.4, 0),
        friction: new THREE.Vector3(0, -this.state.vy * 0.6, 0),
        scale: 1.1,
      },
    ];
  }

  override getGraphSample(): GraphSample {
    const depth = Math.max(0, this.surfaceY - this.state.y + this.blockSize / 2);
    const blockMass = Math.max(0.01, this.effectiveDensity() * this.blockSize ** 3);
    return {
      t: this.simTime,
      position: depth,
      velocity: Math.abs(this.state.vy),
      ke: 0.5 * blockMass * this.state.vy ** 2,
      pe: this.state.weight * depth,
      primaryLabel: 'Block depth',
      secondaryLabel: 'Displaced block',
    };
  }
}

// -----------------------------------------------------------------------------
// 2.2 — Ideal Gas Law Piston Chamber
// -----------------------------------------------------------------------------

const gasMeta: ExperimentMeta = {
  id: 'gas-piston',
  biome: 'thermo',
  number: '2.2',
  title: 'Ideal Gas Piston Chamber',
  shortTitle: 'Gas Piston',
  subtitle: 'A room full of pressure.',
  description:
    'Compress a sealed cloud of particles with the giant piston, heat the floor, or inject more gas. The gauge and the molecular speeds do the rest.',
  concept: 'For an ideal gas, PV = nRT. Pressure rises with particle number and temperature, and falls with volume. Temperature is proportional to average molecular kinetic energy.',
  realWorld: 'Internal-combustion pistons, scuba tanks, weather systems, and refrigeration all manipulate these same variables.',
  formula: 'PV = nRT     ·     P = nRT/V     ·     v_rms ∝ √T',
  formulaNote: 'Here R = 0.08206 L·atm/(mol·K). Each visible gas packet represents 0.01 mol, so the displayed pressure is computed from real variables rather than animated on a curve.',
  badgeName: 'Pressure Point',
  accent: '#75ffe2',
  accentNumber: 0x75ffe2,
  badgeGlyph: '⊙',
  controls: [
    { id: 'particles', label: 'Gas packets n', kind: 'range', min: 10, max: 80, step: 5, hint: 'Each packet = 0.01 mol.' },
    { id: 'temperature', label: 'Floor heater T', kind: 'range', min: 150, max: 600, step: 5, unit: 'K' },
    { id: 'volume', label: 'Piston volume V', kind: 'range', min: 4, max: 16, step: 0.1, unit: 'L' },
  ],
  defaults: { particles: 40, temperature: 300, volume: 8 },
  observeParams: { particles: 50, temperature: 300, volume: 8 },
  observeCues: [
    { at: 0.1, text: 'These particles are the gas. Their speed reflects temperature; each wall impact is a tiny pressure event.' },
    { at: 2.4, text: 'Lower the piston to halve the volume. The same particles now hit the walls twice as often — pressure roughly doubles.' },
    { at: 4.6, text: 'Raise the temperature and the particles speed up. Both more frequent and harder impacts raise the pressure.' },
    { at: 6.7, text: 'The equation holds the whole time: PV = nRT. Count the particles, feel their heat, measure the volume.' },
  ],
  challenge: {
    title: 'The 1.20 Atmosphere State',
    brief: 'The chamber must hold exactly 0.50 mol (50 packets) at 300 K and a pressure of 1.20 atm. Find the piston volume.',
    hint: 'Rearrange the ideal gas law: V = nRT/P. Watch the displayed pressure while moving the piston.',
    success: 'PV = nRT, measured and matched. The gas is in the requested state.',
    targetLabel: 'P = 1.20 atm · T = 300 K · n = 0.50 mol',
  },
  chart: {
    title: 'Gas response',
    positionLabel: 'Volume (L)',
    velocityLabel: 'RMS speed (m/s)',
    energyLabel: 'Thermal energy (J)',
  },
};

interface GasParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
}

export class GasPistonExperiment extends Experiment {
  private chamberWidth = 4.0;
  private chamberDepth = 3.0;
  private chamberBottom = 1.2;
  private chamberTop = 7.4;
  private pistonPlate!: THREE.Mesh;
  private pistonRod!: THREE.Mesh;
  private particles: GasParticle[] = [];
  private gasPoints!: THREE.Points;
  private gasMaterial!: THREE.PointsMaterial;
  private floor!: THREE.Mesh;
  private gaugeNeedle!: THREE.Group;
  private collisions = 0;
  private collisionRate = 0;
  private collisionWindow = 0;
  private collisionCount = 0;

  constructor() {
    super(gasMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 11.5, height: 5.4, targetHeight: 3.7 };
  }

  buildVisual(): void {
    const group = this.visualRoot;
    group.add(meshBox(8.2, 0.35, 6.4, 0x243638, { position: [0, 0.18, 0] }));
    group.add(meshBox(7.5, 0.1, 5.8, 0x385356, { position: [0, 0.4, 0] }));

    const glass = glassBox(this.chamberWidth, 7.0, this.chamberDepth, 0.1);
    glass.position.set(0, this.chamberBottom + 3.5, 0);
    group.add(glass);
    for (const x of [-this.chamberWidth / 2, this.chamberWidth / 2]) {
      for (const z of [-this.chamberDepth / 2, this.chamberDepth / 2]) {
        group.add(meshBox(0.075, 7.0, 0.075, T.steelLight, { position: [x, this.chamberBottom + 3.5, z], opacity: 0.5 }));
      }
    }
    this.floor = meshBox(this.chamberWidth + 0.2, 0.22, this.chamberDepth + 0.2, T.steel, {
      position: [0, this.chamberBottom - 0.08, 0],
      emissive: 0xff5a30,
      emissiveIntensity: 0.2,
    });
    group.add(this.floor);
    for (let x = -1.5; x <= 1.5; x += 0.5) {
      group.add(meshBox(0.08, 0.04, 2.7, T.heater, { position: [x, this.chamberBottom + 0.06, 0], glow: true, opacity: 0.55 }));
    }

    this.pistonPlate = meshBox(this.chamberWidth - 0.08, 0.32, this.chamberDepth - 0.08, T.steelLight, {
      position: [0, 7.4, 0],
      metalness: 0.7,
      roughness: 0.3,
    });
    group.add(this.pistonPlate);
    this.pistonRod = meshBox(0.55, 2.5, 0.55, T.steel, { position: [0, 8.8, 0], metalness: 0.55, roughness: 0.35 });
    group.add(this.pistonRod);
    group.add(meshBox(2.2, 0.28, 2.0, T.brass, { position: [0, 10.05, 0], metalness: 0.7, roughness: 0.3 }));
    group.add(meshBox(0.75, 0.6, 0.4, T.ink, { position: [0, 10.35, 0] }));
    addSign(group, 'GIANT PISTON', 'V CHANGES PV = nRT', '#75ffe2', [0, 9.15, 1.55], 2.9);

    // Pressure gauge dial.
    const gaugeGroup = new THREE.Group();
    gaugeGroup.position.set(2.8, 3.2, 1.9);
    gaugeGroup.rotation.y = 0.22;
    group.add(gaugeGroup);
    const dial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 0.82, 0.18, 24),
      new THREE.MeshStandardMaterial({ color: 0xded6bc, metalness: 0.2, roughness: 0.55 }),
    );
    dial.rotation.x = Math.PI / 2;
    gaugeGroup.add(dial);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.86, 0.07, 6, 28),
      new THREE.MeshStandardMaterial({ color: T.brass, metalness: 0.8, roughness: 0.3 }),
    );
    gaugeGroup.add(rim);
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      const mark = meshBox(0.025, 0.15, 0.025, T.ink, {
        position: [Math.cos(a) * 0.67, Math.sin(a) * 0.67, 0.1],
        rotation: [0, 0, -a],
      });
      gaugeGroup.add(mark);
    }
    this.gaugeNeedle = new THREE.Group();
    this.gaugeNeedle.position.z = 0.14;
    const needle = meshBox(0.035, 0.62, 0.035, 0xdb5a42, { position: [0, 0.23, 0] });
    this.gaugeNeedle.add(needle);
    this.gaugeNeedle.add(meshBox(0.1, 0.1, 0.08, T.brass, { position: [0, 0, 0.02] }));
    gaugeGroup.add(this.gaugeNeedle);
    addSign(group, 'P', 'IDEAL GAS GAUGE', '#ffd08a', [2.75, 4.5, 1.86], 1.6);

    this.addStaticGlow([0, 4, 0], '#77f7e1', 6.5, 0.16);
    this.addLight('#72ffe0', 1.1, 12, [2.5, 3.0, 2.4]);
    this.addLight('#ff6e3e', 1.1, 6, [0, 1.8, 0]);
    addSign(group, 'IDEAL GAS CHAMBER', 'PV = nRT · PARTICLES ARE REAL', '#75ffe2', [0, 11.15, -2.0], 4.7);
  }

  private rebuildParticles(): void {
    const count = Math.round(this.num('particles'));
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        pos: new THREE.Vector3(
          (Math.random() - 0.5) * (this.chamberWidth - 0.4),
          this.chamberBottom + 0.2 + Math.random() * (this.volumeHeight() - 0.4),
          (Math.random() - 0.5) * (this.chamberDepth - 0.4),
        ),
        vel: this.randomVelocity(),
      });
    }
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = this.particles[i].pos.x;
      positions[i * 3 + 1] = this.particles[i].pos.y;
      positions[i * 3 + 2] = this.particles[i].pos.z;
    }
    if (this.gasPoints) {
      this.gasPoints.geometry.dispose();
      this.gasPoints.removeFromParent();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.gasMaterial = new THREE.PointsMaterial({
      color: 0xc8fff3,
      size: 0.13,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.gasPoints = new THREE.Points(geometry, this.gasMaterial);
    this.visualRoot.add(this.gasPoints);
  }

  private randomVelocity(): THREE.Vector3 {
    const speed = 0.45 + Math.sqrt(this.num('temperature') / 300) * 0.65;
    return new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed);
  }

  private volumeHeight(): number {
    return 1.4 + ((this.num('volume') - 4) / 12) * 5.8;
  }

  resetSim(): void {
    this.collisions = 0;
    this.collisionCount = 0;
    this.collisionRate = 0;
    this.collisionWindow = 0;
    this.rebuildParticles();
    this.updateApparatus();
  }

  private updateApparatus(): void {
    if (!this.pistonPlate) return;
    const top = this.chamberBottom + this.volumeHeight();
    this.chamberTop = top;
    this.pistonPlate.position.y = top;
    this.pistonRod.position.y = top + 1.35;
    const temp = this.num('temperature');
    const glow = clamp((temp - 150) / 450, 0, 1);
    (this.floor.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + glow * 1.6;
    if (this.gasMaterial) {
      const c = new THREE.Color().setHSL(0.52 - glow * 0.36, 0.8, 0.66 + glow * 0.12);
      this.gasMaterial.color.copy(c);
    }
    const pressure = this.pressure();
    this.gaugeNeedle.rotation.z = 0.15 + clamp(pressure / 3, 0, 1) * Math.PI * 1.4;
  }

  protected onParamChange(): void {
    this.resetSim();
  }

  triggerPrimaryAction(): void {
    this.rebuildParticles();
  }

  getPrimaryActionLabel(): string | null {
    return 'RECYCLE PARTICLES';
  }

  pressure(): number {
    const n = Math.round(this.num('particles')) * 0.01;
    return (n * 0.082057 * this.num('temperature')) / this.num('volume');
  }

  step(dt: number, env: EnvironmentState): void {
    if (!this.gasPoints) return;
    this.updateApparatus();
    const top = this.chamberBottom + this.volumeHeight();
    const halfW = this.chamberWidth / 2 - 0.22;
    const halfD = this.chamberDepth / 2 - 0.22;
    const prevCollisionCount = this.collisionCount;
    const tempScale = Math.sqrt(this.num('temperature') / 300);
    const attr = this.gasPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.pos.addScaledVector(p.vel, dt * 2.4);
      if (Math.abs(p.pos.x) > halfW) {
        p.pos.x = clamp(p.pos.x, -halfW, halfW);
        p.vel.x *= -1;
        this.collisionCount++;
      }
      if (Math.abs(p.pos.z) > halfD) {
        p.pos.z = clamp(p.pos.z, -halfD, halfD);
        p.vel.z *= -1;
        this.collisionCount++;
      }
      if (p.pos.y < this.chamberBottom + 0.2) {
        p.pos.y = this.chamberBottom + 0.2;
        p.vel.y = Math.abs(p.vel.y);
        this.collisionCount++;
      }
      if (p.pos.y > top - 0.22) {
        p.pos.y = top - 0.22;
        p.vel.y = -Math.abs(p.vel.y);
        this.collisionCount++;
      }
      // Velocity magnitude follows √T, keeping the visual tied to the thermometer.
      p.vel.setLength((0.45 + tempScale * 0.65) * (0.82 + Math.random() * 0.36));
      attr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
    }
    attr.needsUpdate = true;
    this.collisionRate = (this.collisionCount - prevCollisionCount) / Math.max(dt, 0.0001);
    this.collisionWindow += dt;
    if (this.collisionWindow > 1.0) {
      this.collisionWindow = 0;
      this.collisionWindow = 0;
    }
    // Keep the interior sealed when the piston descends.
    for (const p of this.particles) p.pos.y = clamp(p.pos.y, this.chamberBottom + 0.2, top - 0.22);
    this.gasPoints.geometry.computeBoundingSphere();
  }

  isSolved(): boolean {
    const n = Math.round(this.num('particles')) * 0.01;
    return (
      Math.abs(n - 0.5) < 0.0001 &&
      Math.abs(this.num('temperature') - 300) <= 3 &&
      Math.abs(this.pressure() - 1.2) <= 0.025
    );
  }

  getMetrics(env: EnvironmentState): Readout[] {
    const n = Math.round(this.num('particles')) * 0.01;
    const rms = Math.sqrt((3 * 8.314 * this.num('temperature')) / 0.02897);
    return [
      { label: 'Pressure', value: this.pressure().toFixed(3), unit: 'atm', tone: this.isSolved() ? 'accent' : 'warm' },
      { label: 'Volume', value: this.num('volume').toFixed(1), unit: 'L' },
      { label: 'Temperature', value: this.num('temperature').toFixed(0), unit: 'K', tone: 'cool' },
      { label: 'Amount', value: n.toFixed(2), unit: 'mol' },
      { label: 'Wall hits', value: `${Math.round(this.collisionRate)}`, unit: '/s', tone: 'muted' },
      { label: 'v_rms', value: rms.toFixed(0), unit: 'm/s' },
    ];
  }

  override getGraphSample(): GraphSample {
    const n = Math.round(this.num('particles')) * 0.01;
    return {
      t: this.simTime,
      position: this.num('volume'),
      velocity: Math.sqrt(this.num('temperature') * 17.3) * 20,
      ke: n * 3 * 8.314 * this.num('temperature') * 0.5,
      pe: 0,
      primaryLabel: 'Volume',
      secondaryLabel: 'Gas chamber',
    };
  }
}

// -----------------------------------------------------------------------------
// 2.3 — Bernoulli Wind Tunnel
// -----------------------------------------------------------------------------

const bernoulliMeta: ExperimentMeta = {
  id: 'bernoulli',
  biome: 'thermo',
  number: '2.3',
  title: "Bernoulli's Wind Tunnel",
  shortTitle: 'Wind Tunnel',
  subtitle: 'Faster air, lower pressure.',
  description:
    'Shape the wing, tilt it into the stream, and find the airflow that balances its weight. Blue streaks above the wing reveal the low-pressure, high-speed region.',
  concept: 'Along a streamline, P + ½ρv² + ρgh is constant. A wing’s camber and angle make air move faster over its upper surface, lowering pressure and producing lift.',
  realWorld: 'Aircraft wings, yacht sails, race-car downforce, and even curveballs all exploit pressure differences created by flow.',
  formula: 'P + ½ρv² + ρgh = constant     ·     L = ½ρv²SC_L',
  formulaNote: 'Lift grows with the square of airspeed. At high angles of attack the flow separates and the wing stalls, so more tilt is not always more lift.',
  badgeName: 'Lift-Off',
  accent: '#82ffe3',
  accentNumber: 0x82ffe3,
  badgeGlyph: '≋',
  controls: [
    { id: 'wind', label: 'Tunnel airspeed', kind: 'range', min: 5, max: 40, step: 0.5, unit: 'm/s' },
    { id: 'angle', label: 'Angle of attack', kind: 'range', min: -4, max: 20, step: 0.5, unit: '°' },
    { id: 'camber', label: 'Wing camber', kind: 'range', min: 0, max: 12, step: 0.5, unit: '%' },
  ],
  defaults: { wind: 24, angle: 5, camber: 6 },
  observeParams: { wind: 30, angle: 7, camber: 8 },
  observeCues: [
    { at: 0.1, text: 'The fan starts. Air splits at the leading edge; the camber forces the upper stream to travel faster.' },
    { at: 2.2, text: 'By Bernoulli’s principle that faster flow has lower pressure. The pressure difference pushes upward across the whole wing.' },
    { at: 4.4, text: 'Lift scales with v². Doubling airspeed can quadruple lift, if the flow stays attached.' },
    { at: 6.3, text: 'Tilt too far and the stream separates from the wing. That is a stall: more angle, less lift.' },
  ],
  challenge: {
    title: 'Balance the Wing',
    brief: 'Tune the tunnel until lift matches the wing assembly’s 560 N weight within ±6%. Keep the flow attached.',
    hint: 'Lift rises steeply with airspeed. Camber adds effective angle, but avoid pushing the real angle beyond roughly 16°.',
    success: 'Lift and weight are in equilibrium. The wing hangs in its own airstream.',
    targetLabel: 'Lift / weight = 1.00 ± 0.06',
  },
  chart: {
    title: 'Aerodynamic response',
    positionLabel: 'Lift (N)',
    velocityLabel: 'Airspeed (m/s)',
    energyLabel: 'Power proxy (W)',
  },
};

export class BernoulliExperiment extends Experiment {
  private fan!: THREE.Group;
  private wing!: THREE.Group;
  private wingMesh!: THREE.Mesh;
  private wingMaterial!: THREE.MeshStandardMaterial;
  private liftArrow!: THREE.ArrowHelper;
  private weightArrow!: THREE.ArrowHelper;
  private streamPoints!: THREE.Points;
  private streamVelocities: THREE.Vector3[] = [];
  private streamPositions: Float32Array | null = null;
  private pressureTop!: THREE.Sprite;
  private pressureBottom!: THREE.Sprite;
  private stalled = false;
  private lift = 0;
  private ratio = 0;
  private liftPositive = true;

  constructor() {
    super(bernoulliMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 15.5, height: 5.1, targetHeight: 3.35 };
  }

  buildVisual(): void {
    const group = this.visualRoot;
    group.add(meshBox(15.5, 0.32, 6.4, 0x273c40, { position: [0, 0.16, 0] }));
    group.add(meshBox(15, 0.12, 5.7, 0x38585c, { position: [0, 0.38, 0] }));

    // Clear tunnel.
    group.add(glassBox(13.8, 5.2, 3.9, 0.065).translateY(3.0));
    for (const z of [-1.95, 1.95]) {
      for (const x of [-6.9, 6.9]) {
        group.add(meshBox(0.1, 5.2, 0.1, T.steelLight, { position: [x, 3.0, z], opacity: 0.5 }));
      }
    }
    for (const z of [-1.95, 1.95]) {
      group.add(meshBox(13.8, 0.08, 0.08, T.steelLight, { position: [0, 5.6, z], opacity: 0.5 }));
      group.add(meshBox(13.8, 0.08, 0.08, T.steelLight, { position: [0, 0.55, z], opacity: 0.5 }));
    }

    // Fan.
    this.fan = new THREE.Group();
    this.fan.position.set(-5.55, 3.0, 0);
    group.add(this.fan);
    this.fan.add(meshBox(0.3, 4.9, 4.0, T.steel, { position: [0, 0, 0] }));
    for (let i = 0; i < 3; i++) {
      const blade = meshBox(0.15, 1.6, 0.35, 0xd5eef1, {
        position: [0.18, Math.cos((i / 3) * Math.PI * 2) * 0.6, Math.sin((i / 3) * Math.PI * 2) * 0.6],
        rotation: [(i / 3) * Math.PI * 2, 0, 0.3],
        metalness: 0.4,
        roughness: 0.35,
      });
      this.fan.add(blade);
    }
    this.fan.add(meshBox(0.2, 0.6, 0.6, T.brass, { position: [0.15, 0, 0] }));

    // Mount and wing.
    group.add(meshBox(0.35, 3.0, 0.35, T.steel, { position: [0, 1.5, -0.4] }));
    this.wing = new THREE.Group();
    this.wing.position.set(0, 3.25, 0);
    group.add(this.wing);
    this.wingMaterial = new THREE.MeshStandardMaterial({
      color: 0x3fa7a2,
      metalness: 0.55,
      roughness: 0.3,
      emissive: 0x145c62,
      emissiveIntensity: 0.2,
      flatShading: true,
    });
    this.rebuildWing();
    // Structural struts.
    for (const z of [-0.58, 0.58]) {
      this.wing.add(meshBox(2.9, 0.05, 0.06, T.brass, { position: [0, 0.06, z], opacity: 0.65 }));
    }
    addSign(group, 'LOW PRESSURE', 'FAST FLOW', '#8bffff', [0, 5.22, 0], 2.3);
    addSign(group, 'HIGH PRESSURE', 'SLOW FLOW', '#8bd6ff', [0, 1.45, 0.2], 2.3);
    this.pressureTop = addSign(group, 'LIFT', 'UPWARD FORCE', '#82ffe3', [-3.8, 4.75, 0], 2.0) as unknown as THREE.Sprite;
    // The sign helper returns a mesh; add a small directional arrow there.
    this.pressureBottom = addSign(group, 'WEIGHT', '560 N DOWN', '#ffb38a', [-3.8, 1.9, 0], 2.0) as unknown as THREE.Sprite;

    this.liftArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 3.4, 0),
      1.8,
      0x7dffe1,
      0.32,
      0.2,
    );
    this.weightArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0.8, 3.4, 0),
      1.2,
      0xffa27f,
      0.26,
      0.16,
    );
    group.add(this.liftArrow, this.weightArrow);

    // Stream particles.
    const count = 260;
    this.streamVelocities = [];
    this.streamPositions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.streamPositions[i * 3] = -6.7 + Math.random() * 13.2;
      this.streamPositions[i * 3 + 1] = 1.0 + Math.random() * 4.4;
      this.streamPositions[i * 3 + 2] = (Math.random() - 0.5) * 3.3;
      this.streamVelocities.push(new THREE.Vector3(1, 0, 0));
      colors[i * 3] = 0.35 + Math.random() * 0.3;
      colors[i * 3 + 1] = 0.7 + Math.random() * 0.25;
      colors[i * 3 + 2] = 0.9;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.streamPositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.streamPoints = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.075,
        vertexColors: true,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    group.add(this.streamPoints);

    this.addLight('#7affe2', 1.2, 15, [0, 4, 2]);
    this.addStaticGlow([0, 3, 0], '#7dffe8', 4.3, 0.15);
    addSign(group, 'BERNOULLI TUNNEL', 'L = ½ρv²SC_L', '#82ffe3', [0, 7.2, -1.8], 4.4);
  }

  private rebuildWing(): void {
    if (!this.wing) return;
    if (this.wingMesh) {
      this.wingMesh.geometry.dispose();
      this.wingMesh.removeFromParent();
    }
    const camber = this.num('camber') / 100;
    const shape = new THREE.Shape();
    const upper: THREE.Vector2[] = [];
    const lower: THREE.Vector2[] = [];
    const chord = 2.9;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const x = -chord / 2 + t * chord;
      const semi = Math.sin(Math.PI * t) * 0.25;
      const camberLine = camber * Math.sin(Math.PI * t) * 0.9;
      upper.push(new THREE.Vector2(x, camberLine + semi * (1 - 0.15 * t)));
      lower.push(new THREE.Vector2(x, camberLine - semi));
    }
    shape.moveTo(upper[0].x, upper[0].y);
    for (const point of upper.slice(1)) shape.lineTo(point.x, point.y);
    for (let i = lower.length - 2; i >= 0; i--) shape.lineTo(lower[i].x, lower[i].y);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 1.25,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.045,
      bevelThickness: 0.045,
      steps: 1,
    });
    geometry.translate(0, 0, -0.625);
    this.wingMesh = new THREE.Mesh(geometry, this.wingMaterial);
    this.wingMesh.castShadow = true;
    this.wingMesh.receiveShadow = true;
    this.wing.add(this.wingMesh);
    this.updateWingPose();
  }

  private updateWingPose(): void {
    if (!this.wing) return;
    this.wing.rotation.z = THREE.MathUtils.degToRad(this.num('angle'));
  }

  resetSim(): void {
    this.stalled = false;
    this.rebuildWing();
    if (this.streamPositions) {
      const attr = this.streamPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        attr.setX(i, -6.7 + Math.random() * 13.2);
        attr.setY(i, 1.0 + Math.random() * 4.4);
        attr.setZ(i, (Math.random() - 0.5) * 3.3);
      }
      attr.needsUpdate = true;
    }
  }

  protected override onParamChange(id: string): void {
    this.updateWingPose();
    if (id === 'camber') this.rebuildWing();
  }

  private computeLift(env: EnvironmentState): { lift: number; ratio: number; stalled: boolean; cl: number } {
    const angle = this.num('angle');
    const camberPct = this.num('camber');
    const effectiveAngle = THREE.MathUtils.degToRad(angle + camberPct * 0.8);
    const stalled = angle > 16 || effectiveAngle > THREE.MathUtils.degToRad(21);
    let cl = 2 * Math.PI * Math.sin(clamp(effectiveAngle, -0.5, 0.48));
    if (stalled) cl *= 0.58;
    cl = clamp(cl, -1.2, 2.4);
    const rho = env.air === 'vacuum' ? 0 : env.airDensity;
    const q = 0.5 * rho * this.num('wind') ** 2;
    const lift = q * 0.95 * cl;
    return { lift, ratio: lift / 560, stalled, cl };
  }

  step(dt: number, env: EnvironmentState): void {
    this.computeLift(env);
    const result = this.computeLift(env);
    this.lift = result.lift;
    this.ratio = result.ratio;
    this.stalled = result.stalled;
    this.fan.rotation.x += dt * (0.2 + this.num('wind') * 0.06);
    const wingLift = Math.abs(this.lift);
    const arrowLength = clamp(wingLift / 280, 0.25, 3.6);
    this.liftArrow.position.y = 3.45;
    this.liftArrow.setDirection(new THREE.Vector3(0, Math.sign(this.lift || 1), 0));
    this.liftArrow.setLength(arrowLength, Math.min(0.4, arrowLength * 0.22), Math.min(0.22, arrowLength * 0.15));
    this.weightArrow.setLength(clamp(560 / 280, 0.5, 3.2), 0.3, 0.18);
    this.wing.rotation.z = THREE.MathUtils.degToRad(this.num('angle'));
    const mat = this.wingMaterial;
    mat.emissiveIntensity = this.stalled ? 0.02 : 0.2 + clamp(this.ratio, 0, 1.5) * 0.4;
    mat.emissive.setHex(this.stalled ? 0x8e2d1d : 0x1bd4b8);
    this.updateStreams(dt, env);
  }

  private updateStreams(dt: number, env: EnvironmentState): void {
    if (!this.streamPositions) return;
    const attr = this.streamPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    const speed = (0.8 + this.num('wind') * 0.16) * (env.air === 'vacuum' ? 0.25 : 1);
    const camber = this.num('camber') / 100;
    for (let i = 0; i < attr.count; i++) {
      let x = attr.getX(i) + dt * speed;
      let y = attr.getY(i);
      const z = attr.getZ(i);
      if (x > 6.8) {
        x = -6.8;
        y = 1.0 + Math.random() * 4.4;
      }
      // Deflect streamlines around the wing.
      const dx = x;
      const dy = y - 3.25;
      if (Math.abs(dx) < 3.5 && Math.abs(dy) < 1.1) {
        const influence = (1 - Math.abs(dx) / 3.5) ** 2;
        if (dy > 0) y += influence * (0.35 + camber * 5.0) * dt * (8 + this.num('wind') * 0.4);
        else y -= influence * (0.12 + camber * 1.3) * dt * 4;
      }
      if (y < 0.9) y = 0.9;
      if (y > 5.5) y = 5.5;
      attr.setXYZ(i, x, y, z);
      const colorAttr = this.streamPoints.geometry.getAttribute('color') as THREE.BufferAttribute;
      const above = y > 3.25 + camber * 0.2;
      const hue = above ? 0.49 : 0.56;
      const c = new THREE.Color().setHSL(hue, 0.9, above ? 0.68 : 0.55);
      colorAttr.setXYZ(i, c.r, c.g, c.b);
    }
    attr.needsUpdate = true;
    const colorAttr = this.streamPoints.geometry.getAttribute('color') as THREE.BufferAttribute;
    colorAttr.needsUpdate = true;
  }

  isSolved(): boolean {
    return !this.stalled && Math.abs(this.ratio - 1) <= 0.06;
  }

  getMetrics(env: EnvironmentState): Readout[] {
    const result = this.computeLift(env);
    return [
      { label: 'Airspeed', value: this.num('wind').toFixed(1), unit: 'm/s', tone: 'cool' },
      { label: 'Lift coefficient', value: result.cl.toFixed(2), tone: 'warm' },
      { label: 'Lift', value: Math.abs(result.lift).toFixed(0), unit: 'N', tone: 'accent' },
      { label: 'Weight', value: '560', unit: 'N' },
      { label: 'Lift / weight', value: result.ratio.toFixed(2), tone: Math.abs(result.ratio - 1) <= 0.06 ? 'accent' : 'muted' },
      { label: 'Flow state', value: result.stalled ? 'STALLED' : 'ATTACHED', tone: result.stalled ? 'danger' : 'cool' },
    ];
  }

  getTelemetryTargets(): TelemetryTarget[] {
    if (!this.wing) return [];
    return [
      this.makeTelemetry('wing-assembly', this.wing, 'Wing assembly', 57, () => ({
        position: new THREE.Vector3(0, 3.25, 0),
        velocity: new THREE.Vector3(this.num('wind'), 0, 0),
        acceleration: new THREE.Vector3(0, (this.lift - 560) / 57, 0),
        extra: [
          { label: 'Lift', value: `${this.lift.toFixed(0)} N` },
          { label: 'CL', value: this.computeLift(this.currentEnv ?? { gravity: 9.81, gravityPreset: 'earth', air: 'atmosphere', friction: 'frictionless', airDensity: 1.225, frictionCoefficient: 0 }).cl.toFixed(2) },
        ],
      })),
    ];
  }

  override getGraphSample(): GraphSample {
    const rho = this.currentEnv?.air === 'vacuum' ? 0 : (this.currentEnv?.airDensity ?? 1.225);
    return {
      t: this.simTime,
      position: this.lift,
      velocity: this.num('wind'),
      ke: 0.5 * rho * 0.95 * this.num('wind') ** 2,
      pe: 0,
      primaryLabel: 'Lift',
      secondaryLabel: 'Wing section',
    };
  }
}
