import * as THREE from 'three';
import { Experiment } from '../BaseExperiment';
import type { ExperimentMeta, GraphSample, Readout, TelemetryTarget, VectorProbe } from '../types';
import type { EnvironmentState } from '../../config';
import { meshBox } from '../../world/voxel';
import { makeTextLabel } from '../../world/labels';
import { clamp, damp } from '../../core/utils';
import { addStationSign, CanvasBoard, drawClockFace, makeLine } from './sceneKit';

const R = {
  steel: 0x3a3038,
  steelLight: 0x7d6b72,
  dark: 0x160f14,
  brass: 0xd9ae78,
  peach: 0xffc2a5,
  amber: 0xffb36b,
  cyan: 0x89dcff,
  violet: 0x9e8bff,
  rose: 0xff8f9e,
  star: 0xffe2b8,
  green: 0x9dffc9,
};

// -----------------------------------------------------------------------------
// 5.1 — Spacetime Curvature Grid
// -----------------------------------------------------------------------------

const curvatureMeta: ExperimentMeta = {
  id: 'spacetime',
  biome: 'relativity',
  number: '5.1',
  title: 'Spacetime Curvature Grid',
  shortTitle: 'Curvature Grid',
  subtitle: 'Mass tells spacetime how to curve.',
  description:
    'Lower a probe onto a flexible spacetime grid around a compact mass. Choose its launch speed and angle, then watch the curved grid steer it into an orbit — or into the well.',
  concept:
    'In general relativity, gravity is the curvature of spacetime. For weak fields the orbit obeys Newtonian dynamics with a small relativistic correction that makes the ellipse precess. A circular orbit needs just the right tangential speed.',
  realWorld:
    'GPS satellites need relativistic clock corrections; Mercury’s orbit precesses by 43 arcseconds per century; black-hole imaging and gravitational-wave astronomy all trace curved spacetime.',
  formula: 'v_circ = √(GM/r)     ·     a = −GM r̂/r² + (GR precession)',
  formulaNote:
    'The grid is a visual embedding, not literal space. The probe integrates the gravitational acceleration directly, with an exaggerated relativistic term so the precession is visible in seconds.',
  badgeName: 'Orbit Cartographer',
  accent: '#ffc2a5',
  accentNumber: 0xffc2a5,
  badgeGlyph: '◉',
  controls: [
    { id: 'mass', label: 'Central mass M', kind: 'range', min: 2, max: 14, step: 0.5, unit: 'M' },
    { id: 'speed', label: 'Launch speed', kind: 'range', min: 0.8, max: 3.2, step: 0.01, unit: 'u/s' },
    { id: 'angle', label: 'Launch angle', kind: 'range', min: 70, max: 110, step: 0.5, unit: '°', hint: '90° is purely tangential — the best starting point for a circular orbit.' },
    {
      id: 'model',
      label: 'Gravity model',
      kind: 'select',
      options: [
        { value: 'newton', label: 'Newtonian · no precession' },
        { value: 'gr', label: 'Einstein · exaggerated precession' },
      ],
    },
  ],
  defaults: { mass: 6, speed: 1.4, angle: 90, model: 'gr' },
  observeParams: { mass: 8, speed: 2.25, angle: 90, model: 'gr' },
  observeCues: [
    { at: 0.1, text: 'The grid is a map of gravitational potential. The central mass pulls a deep well into it.' },
    { at: 2.2, text: 'The probe is released tangentially. It would travel straight if spacetime were flat — but the grid is not flat.' },
    { at: 4.6, text: 'It swings through the well and climbs back out, trading kinetic energy for gravitational potential.' },
    { at: 6.8, text: 'The orbit does not close on itself. General relativity adds a tiny extra pull, rotating the ellipse with every lap.' },
    { at: 8.8, text: 'This is precession. Mercury does it by 43 arcseconds per century; here we exaggerate the curvature so you can see it.' },
  ],
  challenge: {
    title: 'The Circular Orbit',
    brief:
      'With the central mass at 8.0 and Einstein precession enabled, place the probe in a near-circular orbit. Launch it tangentially and hold the orbit for at least half a revolution.',
    hint:
      'Start with v = √(GM/r) = √(8/3.2) ≈ 1.58 u/s, then fine-tune upward slightly for the extra relativistic curvature. The eccentricity readout is your guide.',
    success:
      'A clean, nearly circular orbit. The probe hugs the curvature of the grid and precesses like a tiny Mercury.',
    targetLabel: 'M = 8.0 · e < 0.08 · GR on',
  },
  chart: {
    title: 'Orbit telemetry',
    positionLabel: 'Radial distance (u)',
    velocityLabel: 'Orbital speed (u/s)',
    energyLabel: 'Specific orbital energy',
  },
};

const GRID_HALF = 9.4;
const GRID_CELLS = 32;
const GRID_BASE_Y = 1.5;
const LAUNCH_RADIUS = 3.2;
const C_GRID = 8;

export class SpacetimeExperiment extends Experiment {
  private probe!: THREE.Mesh;
  private probeGlow!: THREE.Sprite;
  private trailLine!: THREE.Line;
  private trail: THREE.Vector3[] = [];
  private gridMesh!: THREE.LineSegments;
  private gridPositions = new Float32Array((GRID_CELLS + 1) * GRID_CELLS * 2 * 6);
  private gridColors = new Float32Array((GRID_CELLS + 1) * GRID_CELLS * 2 * 3);
  private wellGroup!: THREE.Group;
  private centralStar!: THREE.Mesh;
  private accretion!: THREE.Mesh;
  private starGlow!: THREE.Sprite;
  private eventRing!: THREE.Mesh;
  private state = { pos: new THREE.Vector2(LAUNCH_RADIUS, 0), vel: new THREE.Vector2(0, 0) };
  private launched = false;
  private absorbed = false;
  private escaped = false;
  private trailAngle = 0;
  private eccentricity = 0;
  private maxEccentricity = 0;
  private minRadius = LAUNCH_RADIUS;
  private maxRadius = LAUNCH_RADIUS;
  private lastAngle = 0;
  private unwrappedAngle = 0;
  private orbitTime = 0;
  private infoBoard!: CanvasBoard;
  private infoTimer = 0;
  private status = 'Awaiting launch';
  private clockPulse = 0;

  constructor() {
    super(curvatureMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 17, height: 11.5, targetHeight: 1.4 };
  }

  buildVisual(): void {
    const group = this.visualRoot;

    // Platform ring and outer frame.
    group.add(meshBox(23, 0.35, 23, 0x1d151c, { position: [0, 0.17, 0] }));
    group.add(meshBox(22.2, 0.08, 22.2, 0x2e222c, { position: [0, 0.39, 0] }));
    for (const [x, z] of [
      [-10.8, -10.8],
      [10.8, -10.8],
      [-10.8, 10.8],
      [10.8, 10.8],
    ]) {
      group.add(meshBox(0.65, 4.6, 0.65, 0x4c3c46, { position: [x, 2.6, z] }));
      group.add(meshBox(0.9, 0.16, 0.9, R.brass, { position: [x, 4.95, z], metalness: 0.6, roughness: 0.35 }));
      this.addStaticGlow([x, 5.1, z], '#ffb987', 2.3, 0.25);
    }

    // Curvature grid.
    this.gridMesh = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.gridMesh.frustumCulled = false;
    group.add(this.gridMesh);
    this.rebuildGrid();

    // Central compact mass and accretion ring.
    this.wellGroup = new THREE.Group();
    group.add(this.wellGroup);
    this.centralStar = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.64, 2),
      new THREE.MeshStandardMaterial({
        color: 0x140a10,
        emissive: 0xff8c5c,
        emissiveIntensity: 0.25,
        roughness: 0.25,
        metalness: 0.5,
      }),
    );
    this.centralStar.position.set(0, 1.45, 0);
    this.wellGroup.add(this.centralStar);
    this.accretion = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.13, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.55, toneMapped: false }),
    );
    this.accretion.rotation.x = Math.PI / 2.35;
    this.accretion.position.set(0, 1.45, 0);
    this.wellGroup.add(this.accretion);
    this.starGlow = this.addStaticGlow([0, 1.5, 0], '#ffb077', 5.8, 0.42);
    this.eventRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.98, 0.035, 5, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd5ab, transparent: true, opacity: 0.65, toneMapped: false }),
    );
    this.eventRing.rotation.x = Math.PI / 2;
    this.eventRing.position.set(0, 1.42, 0);
    this.wellGroup.add(this.eventRing);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const radius = 1.5 + (i % 3) * 0.6;
      const glow = this.addStaticGlow([Math.cos(a) * radius, 1.2 - (i % 3) * 0.3, Math.sin(a) * radius], '#ffab73', 0.9, 0.2);
      glow.userData.orbitAngle = a;
      glow.userData.orbitRadius = radius;
    }

    // Probe and trail.
    this.probe = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.19, 1),
      new THREE.MeshStandardMaterial({
        color: 0xfff1cf,
        emissive: 0xffb269,
        emissiveIntensity: 1.4,
        metalness: 0.2,
        roughness: 0.25,
      }),
    );
    group.add(this.probe);
    this.probeGlow = this.addStaticGlow([0, 0, 0], '#ffc18d', 1.6, 0.5);
    this.trailLine = makeLine([], 0xffb98e, 0.5);
    group.add(this.trailLine);

    // Orbit guide arc for the launch radius.
    const guide = new THREE.Mesh(
      new THREE.RingGeometry(LAUNCH_RADIUS - 0.025, LAUNCH_RADIUS + 0.025, 96),
      new THREE.MeshBasicMaterial({
        color: 0xffc2a5,
        transparent: true,
        opacity: 0.17,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    guide.rotation.x = -Math.PI / 2;
    guide.position.y = 1.01;
    group.add(guide);

    // Launch marker and velocity pointer.
    group.add(meshBox(0.09, 1.2, 0.09, R.brass, { position: [LAUNCH_RADIUS, 1.65, 0] }));
    group.add(meshBox(0.5, 0.08, 0.5, R.brass, { position: [LAUNCH_RADIUS, 2.25, 0] }));
    this.addStaticGlow([LAUNCH_RADIUS, 2.3, 0], '#ffd2a3', 1.2, 0.25);

    // Arch and station signage.
    for (const x of [-6.6, 6.6]) {
      group.add(meshBox(0.4, 8.0, 0.4, 0x4b3a43, { position: [x, 4.2, -5.8] }));
    }
    group.add(meshBox(14.1, 0.4, 0.4, 0x4b3a43, { position: [0, 8.0, -5.8] }));
    addStationSign(group, 'SPACETIME CURVATURE GRID', 'MASS CURVES · PROBES MAP', '#ffc2a5', [0, 9.35, -5.5], 5.8);

    // Live orbital data.
    this.infoBoard = new CanvasBoard(4.8, 2.6, 640, 346);
    this.infoBoard.mesh.position.set(-7.2, 5.0, 3.7);
    this.infoBoard.mesh.rotation.y = 0.33;
    group.add(this.infoBoard.mesh);
    this.drawBoard();

    // Orbital observatory decorations.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const radius = 9.3;
      const monolith = meshBox(0.5, 1.4 + (i % 3) * 0.6, 0.5, 0x4a3743, {
        position: [Math.cos(a) * radius, 1.2, Math.sin(a) * radius],
        emissive: 0xffa570,
        emissiveIntensity: 0.15,
      });
      group.add(monolith);
      const glyph = meshBox(0.36, 0.36, 0.06, 0xffb783, {
        position: [Math.cos(a) * radius, 1.8, Math.sin(a) * radius + 0.28],
        glow: true,
        opacity: 0.4,
      });
      group.add(glyph);
    }

    this.addLight('#ff9b64', 1.8, 18, [0, 3.0, 0]);
    this.addLight('#ffcf9e', 0.9, 14, [-6, 6, 5]);
    this.addLight('#8a7dff', 0.8, 18, [6, 4, -5]);

    this.resetSim();
  }

  private warpHeight(radius: number): number {
    const depth = 0.75 + (this.num('mass') / 14) * 2.6;
    return GRID_BASE_Y - depth / (1 + radius * radius * 0.55);
  }

  private rebuildGrid(): void {
    if (!this.gridMesh) return;
    let cursor = 0;
    let colorCursor = 0;
    const half = GRID_HALF;
    const step = (half * 2) / GRID_CELLS;
    const accent = new THREE.Color(R.peach);
    const deep = new THREE.Color(0x4b2033);
    const far = new THREE.Color(0x6c3f51);

    const pushVertex = (x: number, z: number) => {
      const radius = Math.sqrt(x * x + z * z);
      const y = this.warpHeight(radius);
      this.gridPositions[cursor++] = x;
      this.gridPositions[cursor++] = y;
      this.gridPositions[cursor++] = z;
      const t = clamp(radius / half, 0, 1);
      const color = deep.clone().lerp(accent, Math.max(0, 1 - t * 1.2)).lerp(far, t * 0.25);
      color.multiplyScalar(0.55 + 0.45 * (1 - t));
      this.gridColors[colorCursor++] = color.r;
      this.gridColors[colorCursor++] = color.g;
      this.gridColors[colorCursor++] = color.b;
    };

    for (let iz = 0; iz <= GRID_CELLS; iz++) {
      const z = -half + iz * step;
      for (let ix = 0; ix < GRID_CELLS; ix++) {
        const x0 = -half + ix * step;
        const x1 = x0 + step;
        pushVertex(x0, z);
        pushVertex(x1, z);
      }
    }
    for (let ix = 0; ix <= GRID_CELLS; ix++) {
      const x = -half + ix * step;
      for (let iz = 0; iz < GRID_CELLS; iz++) {
        const z0 = -half + iz * step;
        const z1 = z0 + step;
        pushVertex(x, z0);
        pushVertex(x, z1);
      }
    }

    const geometry = this.gridMesh.geometry;
    geometry.setAttribute('position', new THREE.BufferAttribute(this.gridPositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.gridColors, 3));
    geometry.computeBoundingSphere();
  }

  private circularSpeed(): number {
    return Math.sqrt(this.num('mass') / LAUNCH_RADIUS);
  }

  resetSim(): void {
    if (!this.probe) return;
    this.launched = false;
    this.absorbed = false;
    this.escaped = false;
    this.trail = [];
    this.trailAngle = 0;
    this.eccentricity = 0;
    this.maxEccentricity = 0;
    this.minRadius = LAUNCH_RADIUS;
    this.maxRadius = LAUNCH_RADIUS;
    this.unwrappedAngle = 0;
    this.lastAngle = 0;
    this.orbitTime = 0;
    this.status = 'Awaiting launch';
    this.state.pos.set(LAUNCH_RADIUS, 0);
    this.state.vel.set(0, 0);
    this.placeProbe();
    this.trailLine.geometry.dispose();
    this.trailLine.geometry = new THREE.BufferGeometry();
    this.rebuildGrid();
    this.drawBoard();
    this.updateStarVisual();
  }

  private placeProbe(): void {
    const x = this.state.pos.x;
    const z = this.state.pos.y;
    const r = this.state.pos.length();
    const y = this.warpHeight(r) + 0.38;
    this.probe.position.set(x, y, z);
    this.probeGlow.position.copy(this.probe.position);
    this.probeGlow.position.y += 0.15;
  }

  private updateStarVisual(): void {
    if (!this.centralStar) return;
    const mass = this.num('mass');
    this.centralStar.scale.setScalar(0.5 + (mass / 14) * 0.7);
    this.accretion.scale.setScalar(0.65 + (mass / 14) * 0.9);
    this.starGlow.scale.setScalar(3.0 + (mass / 14) * 4.5);
    this.eventRing.scale.setScalar(0.7 + (mass / 14) * 0.6);
    (this.accretion.material as THREE.MeshBasicMaterial).opacity = 0.35 + (mass / 14) * 0.35;
  }

  protected onParamChange(): void {
    this.rebuildGrid();
    this.updateStarVisual();
    this.resetSim();
  }

  triggerPrimaryAction(): void {
    this.resetSim();
    const angle = THREE.MathUtils.degToRad(this.num('angle'));
    const speed = this.num('speed');
    this.state.vel.set(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.launched = true;
    this.status = 'Probe in flight';
    this.trail.push(this.probe.position.clone());
  }

  getPrimaryActionLabel(): string | null {
    return this.launched ? 'RESET ORBIT' : 'RELEASE PROBE';
  }

  getPrimaryActionHint(): string {
    return this.launched ? 'Clear the trajectory and prepare another launch.' : 'Release the probe with the current launch speed and angle.';
  }

  step(dt: number): void {
    if (!this.probe) return;
    if (this.observationActive && !this.launched && this.simTime > 0.9) {
      this.triggerPrimaryAction();
    }
    this.clockPulse += dt;
    this.accretion.rotation.z += dt * 0.55;
    this.centralStar.rotation.y += dt * 0.3;
    this.eventRing.rotation.z -= dt * 0.4;
    this.probeGlow.material.opacity = 0.34 + Math.sin(this.clockPulse * 6) * 0.12;
    if (this.observationActive && this.launched && this.simTime > 9.6 && this.unwrappedAngle > Math.PI * 1.9) {
      // Loop the demo once so the viewer can compare successive precessing laps.
      if (this.simTime > 14) this.triggerPrimaryAction();
    }

    if (!this.launched) {
      this.drawBoard(false);
      return;
    }

    this.orbitTime += dt;
    const substeps = 5;
    const h = (dt * 1.75) / substeps;
    const mass = this.num('mass');
    const gr = this.str('model') === 'gr';
    for (let s = 0; s < substeps; s++) {
      const x = this.state.pos.x;
      const z = this.state.pos.y;
      const r2 = x * x + z * z;
      const r = Math.sqrt(r2);
      if (r < 0.45) {
        this.launched = false;
        this.absorbed = true;
        this.status = 'Absorbed by the well';
        break;
      }
      if (r > 11.5) {
        this.launched = false;
        this.escaped = true;
        this.status = 'Escaped the potential well';
        break;
      }
      const g = mass / Math.pow(r2 + 0.04, 1.5);
      let ax = -g * x;
      let az = -g * z;
      if (gr) {
        // Exaggerated Schwarzschild-like precession term with softened core.
        const angular = x * this.state.vel.y - z * this.state.vel.x;
        const correction = (3 * angular * angular) / (C_GRID * C_GRID * Math.pow(r2 + 0.04, 2.5));
        ax -= correction * x;
        az -= correction * z;
      }
      this.state.vel.x += ax * h;
      this.state.vel.y += az * h;
      this.state.pos.x += this.state.vel.x * h;
      this.state.pos.y += this.state.vel.y * h;
    }

    if (this.launched) {
      this.placeProbe();
      const angle = Math.atan2(this.state.pos.y, this.state.pos.x);
      let delta = angle - this.lastAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      this.unwrappedAngle += delta;
      this.lastAngle = angle;
      this.trail.push(this.probe.position.clone());
      if (this.trail.length > 900) this.trail.shift();
      this.trailLine.geometry.dispose();
      this.trailLine.geometry = new THREE.BufferGeometry().setFromPoints(this.trail);
      this.updateOrbitMetrics();
      this.status = this.launched ? `Orbit · ${(this.unwrappedAngle / (Math.PI * 2)).toFixed(2)} laps` : this.status;
    }

    this.drawBoard(false);
    this.updateStarVisual();
  }

  private updateOrbitMetrics(): void {
    const r = this.state.pos.length();
    const v = this.state.vel.length();
    const mass = this.num('mass');
    const energy = (v * v) / 2 - mass / Math.max(0.001, r);
    const angular = this.state.pos.x * this.state.vel.y - this.state.pos.y * this.state.vel.x;
    const eSq = 1 + (2 * energy * angular * angular) / (mass * mass);
    this.eccentricity = eSq > 0 ? Math.sqrt(eSq) : 0;
    this.maxEccentricity = Math.max(this.maxEccentricity, this.eccentricity);
    this.minRadius = Math.min(this.minRadius, r);
    this.maxRadius = Math.max(this.maxRadius, r);
    this.trailAngle = this.unwrappedAngle;
  }

  private drawBoard(force = true): void {
    if (!this.infoBoard) return;
    this.infoTimer += 0.1;
    const speed = this.state.vel.length();
    const r = this.state.pos.length();
    const precession = THREE.MathUtils.radToDeg((6 * Math.PI * this.num('mass')) / (C_GRID * C_GRID * LAUNCH_RADIUS));
    this.infoBoard.draw(
      (ctx, w, h) => {
        this.infoBoard.frame(ctx, '#ffc2a5', 'GRAVITY OBSERVATORY');
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f5ede6';
        ctx.font = '600 25px "JetBrains Mono", monospace';
        ctx.fillText(`r ${r.toFixed(2)} u`, 34, 70);
        ctx.fillText(`v ${speed.toFixed(2)} u/s`, 230, 70);
        ctx.fillStyle = '#ffd2ae';
        ctx.font = '700 40px "Space Grotesk", sans-serif';
        ctx.fillText(`e = ${this.eccentricity.toFixed(3)}`, 34, 120);
        ctx.fillStyle = '#cbb7aa';
        ctx.font = '500 21px "JetBrains Mono", monospace';
        ctx.fillText(`M ${this.num('mass').toFixed(1)} · GR ${this.str('model') === 'gr' ? 'ON' : 'OFF'} · precession ${precession.toFixed(1)}°/lap`, 34, 163);
        ctx.fillText(this.status.toUpperCase(), 34, 200);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(34, 228, w - 68, 16);
        const fill = clamp(this.unwrappedAngle / (Math.PI * 2), 0, 1);
        ctx.fillStyle = '#ffc2a5';
        ctx.fillRect(34, 228, (w - 68) * fill, 16);
        ctx.fillStyle = '#e7d6ca';
        ctx.font = '500 19px "JetBrains Mono", monospace';
        ctx.fillText(`lap ${(this.unwrappedAngle / (Math.PI * 2)).toFixed(2)} · r ${this.minRadius.toFixed(2)}–${this.maxRadius.toFixed(2)} u`, 34, 274);
        ctx.fillStyle = this.launched ? '#9dffc9' : '#ffb49d';
        ctx.font = '600 19px "JetBrains Mono", monospace';
        ctx.fillText(this.launched ? 'PROBE ACTIVE' : 'PROBE PARKED', w - 230, 274);
      },
      force,
      0.12,
    );
  }

  isSolved(): boolean {
    if (!this.challengeArmed || !this.launched) return false;
    if (this.str('model') !== 'gr') return false;
    if (Math.abs(this.num('mass') - 8) > 0.26) return false;
    if (Math.abs(this.num('angle') - 90) > 1.6) return false;
    return this.orbitTime > 2.0 && this.unwrappedAngle > 2.2 && this.maxEccentricity < 0.09;
  }

  getMetrics(): Readout[] {
    const speed = this.state.vel.length();
    const r = this.state.pos.length();
    const rows: Readout[] = [
      { label: 'Central mass', value: this.num('mass').toFixed(1), unit: 'M', tone: 'warm' },
      { label: 'Orbital radius', value: r.toFixed(2), unit: 'u' },
      { label: 'Speed', value: speed.toFixed(2), unit: 'u/s', tone: 'accent' },
      { label: 'Eccentricity', value: this.eccentricity.toFixed(3), tone: this.eccentricity < 0.09 ? 'accent' : 'muted' },
      { label: 'Laps', value: (this.unwrappedAngle / (Math.PI * 2)).toFixed(2), unit: 'orbit' },
      { label: 'Status', value: this.status, tone: this.absorbed ? 'danger' : this.escaped ? 'danger' : this.launched ? 'cool' : 'muted' },
    ];
    if (!this.challengeArmed) {
      rows.push({ label: 'Circular speed', value: this.circularSpeed().toFixed(2), unit: 'u/s', tone: 'warm' });
    }
    return rows;
  }

  getTelemetryTargets(): TelemetryTarget[] {
    return [
      this.makeTelemetry('orbit-probe', this.probe, 'Orbital probe', 1, () => {
        const r = Math.max(0.001, this.state.pos.length());
        const g = this.num('mass') / (r * r * r);
        return {
          position: this.probe.position.clone(),
          velocity: new THREE.Vector3(this.state.vel.x, 0, this.state.vel.y),
          acceleration: new THREE.Vector3(-g * this.state.pos.x, 0, -g * this.state.pos.y),
          potentialReference: GRID_BASE_Y,
          extra: [
            { label: 'Eccentricity', value: this.eccentricity.toFixed(3) },
            { label: 'Laps', value: (this.unwrappedAngle / (Math.PI * 2)).toFixed(2) },
          ],
        };
      }),
    ];
  }

  override getVectorProbes(): VectorProbe[] {
    if (!this.probe) return [];
    const r = Math.max(0.001, this.state.pos.length());
    const g = this.num('mass') / (r * r * r);
    return [
      {
        id: 'orbit-probe',
        position: this.probe.position.clone(),
        velocity: new THREE.Vector3(this.state.vel.x, 0, this.state.vel.y).multiplyScalar(1.4),
        acceleration: new THREE.Vector3(-g * this.state.pos.x, 0, -g * this.state.pos.y).multiplyScalar(2.4),
        gravity: new THREE.Vector3(-g * this.state.pos.x, 0, -g * this.state.pos.y).normalize().multiplyScalar(this.currentEnv?.gravity ?? 9.81),
        scale: 0.9,
      },
    ];
  }

  override getGraphSample(): GraphSample {
    const r = this.state.pos.length();
    const v = this.state.vel.length();
    const mass = this.num('mass');
    return {
      t: this.simTime,
      position: r,
      velocity: v,
      ke: 0.5 * v * v,
      pe: -mass / Math.max(0.001, r),
      primaryLabel: 'Orbital radius',
      secondaryLabel: this.str('model') === 'gr' ? 'Einstein precession' : 'Newtonian gravity',
    };
  }
}

// -----------------------------------------------------------------------------
// 5.2 — Twin Paradox Rail
// -----------------------------------------------------------------------------

const twinMeta: ExperimentMeta = {
  id: 'twin-paradox',
  biome: 'relativity',
  number: '5.2',
  title: 'Twin Paradox Rail',
  shortTitle: 'Twin Paradox',
  subtitle: 'Two clocks. One journey. Two answers.',
  description:
    'Send one twin on a high-speed rail loop to a distant star and back while the other stays behind. Compare the clocks at reunion: the traveller has aged less.',
  concept:
    'The travelling clock measures proper time along its worldline: Δτ = Δt/γ, where γ = 1/√(1−β²). The stay-at-home twin measures the longer Earth-frame time. The asymmetry of the turnaround resolves the “paradox”.',
  realWorld:
    'GPS clocks, muon lifetimes, particle accelerators, and atomic-clock flights all measure this same proper-time difference.',
  formula: 'γ = 1/√(1 − β²)     ·     Δτ = Δt/γ     ·     β = v/c',
  formulaNote:
    'The round trip is not symmetric: the travelling twin changes inertial frames at the turnaround. Earth-frame distance is fixed; the ship clock accumulates less time.',
  badgeName: 'Proper Time',
  accent: '#ffc2a5',
  accentNumber: 0xffc2a5,
  badgeGlyph: '⌛',
  controls: [
    { id: 'speed', label: 'Ship speed β = v/c', kind: 'range', min: 0.1, max: 0.99, step: 0.01, unit: 'c' },
    { id: 'distance', label: 'One-way route', kind: 'range', min: 2, max: 8, step: 0.5, unit: 'ly' },
  ],
  defaults: { speed: 0.6, distance: 4 },
  observeParams: { speed: 0.8, distance: 4 },
  observeCues: [
    { at: 0.1, text: 'The station clock and the ship clock start together at zero. The route is 4 light-years out and 4 back.' },
    { at: 2.2, text: 'The ship travels at 0.8c. From Earth, the outbound leg alone takes 5 years.' },
    { at: 4.4, text: 'But the ship clock runs slow by the Lorentz factor γ = 1.667. The traveller experiences less time.' },
    { at: 6.6, text: 'At the star, the ship turns around. This acceleration is what breaks the symmetry between the twins.' },
    { at: 8.8, text: 'Reunion: Earth has aged 10 years, the traveller only 6. The difference is real, measurable, and permanent.' },
  ],
  challenge: {
    title: 'Six Years for the Traveller',
    brief:
      'Use the 4-light-year route. Tune the ship speed so the traveller ages exactly 6.00 years during the round trip, then complete the mission.',
    hint: 'Total Earth time is 8/β years. Set it equal to 6γ: β = 0.80 gives Earth 10 years, ship 6 years.',
    success: 'The clocks agree on the reunion — and disagree on the elapsed time. Proper time is the traveller’s own.',
    targetLabel: 'Route 4 ly · ship time 6.00 y',
  },
  chart: {
    title: 'Clock divergence',
    positionLabel: 'Ship proper time (years)',
    velocityLabel: 'Speed β',
    energyLabel: 'Lorentz factor γ',
  },
};

export class TwinParadoxExperiment extends Experiment {
  private route!: THREE.CatmullRomCurve3;
  private ship = new THREE.Group();
  private trailLine!: THREE.Line;
  private trail: THREE.Vector3[] = [];
  private clockBoard!: CanvasBoard;
  private missionT = 0;
  private running = false;
  private missionDuration = 8.5;
  private earthYears = 0;
  private shipYears = 0;
  private shipGlow!: THREE.Sprite;
  private shipLight!: THREE.PointLight;
  private starGlow!: THREE.Sprite;
  private starMesh!: THREE.Mesh;
  private stationClock!: THREE.Group;
  private stationClockHand!: THREE.Group;
  private shipClock!: THREE.Group;
  private shipClockHand!: THREE.Group;
  private boardTimer = 0;
  private engineTrail: THREE.Line[] = [];
  private twinStay!: THREE.Group;
  private twinGo!: THREE.Group;
  private launchPad!: THREE.Mesh;
  private routeLights: THREE.Mesh[] = [];
  private observationRestart = 0;
  private lastShipPosition = new THREE.Vector3();
  private shipVelocity = new THREE.Vector3();

  constructor() {
    super(twinMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 22, height: 11, targetHeight: 3.8 };
  }

  buildVisual(): void {
    const group = this.visualRoot;
    group.add(meshBox(28, 0.36, 17, 0x1b1218, { position: [4, 0.18, 0] }));
    group.add(meshBox(27.2, 0.08, 16.2, 0x2e2029, { position: [4, 0.4, 0] }));

    this.route = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-8.2, 1.4, 0.2),
      new THREE.Vector3(-4.5, 2.25, -2.1),
      new THREE.Vector3(0.2, 3.4, -3.5),
      new THREE.Vector3(4.8, 4.8, -3.4),
      new THREE.Vector3(8.5, 6.1, -1.7),
      new THREE.Vector3(10.0, 6.55, 0.9),
      new THREE.Vector3(8.7, 6.1, 3.6),
      new THREE.Vector3(4.6, 4.7, 4.1),
      new THREE.Vector3(-0.1, 3.3, 3.3),
      new THREE.Vector3(-4.8, 2.2, 1.9),
      new THREE.Vector3(-8.2, 1.4, 0.2),
    ], true, 'catmullrom', 0.35);

    // Two luminous rails and sleepers.
    for (const offset of [-0.22, 0.22]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 180; i++) {
        const t = i / 180;
        const p = this.route.getPointAt(t);
        const tangent = this.route.getTangentAt(t);
        const side = new THREE.Vector3(0, 1, 0).cross(tangent).normalize().multiplyScalar(offset);
        points.push(p.clone().add(side));
      }
      const rail = makeLine(points, 0xffc2a5, 0.75);
      group.add(rail);
    }
    for (let i = 0; i < 70; i++) {
      const t = i / 70;
      const p = this.route.getPointAt(t);
      const tangent = this.route.getTangentAt(t);
      const sleeper = meshBox(0.75, 0.07, 0.2, 0x6d4e52, {
        position: [p.x, p.y - 0.05, p.z],
        opacity: 0.55,
      });
      sleeper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent.clone().normalize());
      group.add(sleeper);
      if (i % 7 === 0) {
        const bead = meshBox(0.12, 0.12, 0.12, 0xffc2a5, {
          position: [p.x, p.y + 0.16, p.z],
          glow: true,
          opacity: 0.55,
        });
        group.add(bead);
        this.routeLights.push(bead);
      }
    }

    // Platform at the start of the route.
    this.launchPad = meshBox(4.4, 0.32, 3.7, 0x46333c, { position: [-8.2, 0.7, 0], metalness: 0.25, roughness: 0.55 });
    group.add(this.launchPad);
    group.add(meshBox(4.7, 0.12, 4.0, 0x6b4d58, { position: [-8.2, 0.88, 0] }));
    for (let i = 0; i < 4; i++) {
      group.add(meshBox(0.15, 1.8, 0.15, R.brass, { position: [-9.9 + i * 1.15, 1.75, 1.72] }));
    }
    addStationSign(group, 'EARTH STATION', 'STAY-AT-HOME FRAME', '#ffc2a5', [-8.2, 3.2, 2.3], 3.1);

    // Destination star at the turnaround.
    const starPos = this.route.getPointAt(0.31);
    this.starMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.7, 2),
      new THREE.MeshStandardMaterial({
        color: 0xfff0d1,
        emissive: 0xffb468,
        emissiveIntensity: 1.1,
        roughness: 0.22,
      }),
    );
    this.starMesh.position.copy(starPos);
    group.add(this.starMesh);
    this.starGlow = this.addStaticGlow([starPos.x, starPos.y, starPos.z], '#ffd194', 5.2, 0.35);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.1 + i * 0.26, 0.035, 5, 40),
        new THREE.MeshBasicMaterial({ color: 0xffc98f, transparent: true, opacity: 0.34 - i * 0.07, toneMapped: false }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(starPos);
      group.add(ring);
    }
    addStationSign(group, 'TURNAROUND', '4 LIGHT-YEARS FROM EARTH', '#ffd194', [starPos.x, starPos.y + 1.9, starPos.z + 1.4], 3.4);

    // Two station clocks on brass pillars.
    const clockBuild = (x: number, label: string) => {
      const g = new THREE.Group();
      g.position.set(x, 3.7, 1.7);
      group.add(g);
      const face = new THREE.Mesh(
        new THREE.CircleGeometry(0.82, 40),
        new THREE.MeshBasicMaterial({ color: 0x17111a, transparent: true, opacity: 0.92, side: THREE.DoubleSide }),
      );
      g.add(face);
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.86, 0.06, 6, 36),
        new THREE.MeshStandardMaterial({ color: R.brass, metalness: 0.8, roughness: 0.3 }),
      );
      g.add(rim);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const tick = meshBox(0.03, 0.16, 0.03, 0xffd9bd, {
          position: [Math.cos(a) * 0.68, Math.sin(a) * 0.68, 0.055],
          rotation: [0, 0, a - Math.PI / 2],
          glow: true,
          opacity: i % 3 === 0 ? 0.85 : 0.35,
        });
        g.add(tick);
      }
      const hand = new THREE.Group();
      const handMesh = meshBox(0.045, 0.55, 0.045, 0xffc2a5, {
        position: [0, 0.25, 0.07],
        glow: true,
        opacity: 0.95,
      });
      hand.add(handMesh);
      hand.add(meshBox(0.11, 0.11, 0.11, R.brass, { position: [0, 0, 0.07] }));
      g.add(hand);
      g.add(meshBox(0.35, 1.3, 0.2, 0x3c2b34, { position: [0, -1.4, -0.15] }));
      addStationSign(group, label, 'PROPER-TIME CLOCK', '#ffc2a5', [x, 2.05, 2.7], 2.2);
      return { group: g, hand };
    };
    const earthClock = clockBuild(-9.6, 'EARTH CLOCK');
    const shipClock = clockBuild(-6.7, 'SHIP CLOCK');
    this.stationClock = earthClock.group;
    this.stationClockHand = earthClock.hand;
    this.shipClock = shipClock.group;
    this.shipClockHand = shipClock.hand;

    // Twin figures.
    const twin = (color: number) => {
      const g = new THREE.Group();
      g.add(meshBox(0.42, 0.62, 0.32, color, { position: [0, 0.86, 0] }));
      g.add(meshBox(0.36, 0.32, 0.36, 0xd9aa86, { position: [0, 1.35, 0] }));
      g.add(meshBox(0.12, 0.52, 0.12, color, { position: [-0.28, 0.92, 0] }));
      g.add(meshBox(0.12, 0.52, 0.12, color, { position: [0.28, 0.92, 0] }));
      g.add(meshBox(0.12, 0.52, 0.12, 0x2d2236, { position: [-0.14, 0.32, 0] }));
      g.add(meshBox(0.12, 0.52, 0.12, 0x2d2236, { position: [0.14, 0.32, 0] }));
      return g;
    };
    this.twinStay = twin(0x8a6575);
    this.twinStay.position.set(-9.2, 0.9, -1.35);
    group.add(this.twinStay);
    this.twinGo = twin(0x9a7cff);
    this.twinGo.position.set(-7.2, 0.9, -1.35);
    this.twinGo.rotation.y = 0.4;
    group.add(this.twinGo);
    addStationSign(group, 'STAYS HOME', 'AGING AT EARTH RATE', '#ffcfae', [-9.2, 1.9, -0.4], 1.9);
    addStationSign(group, 'TRAVELS', 'AGING SLOWER', '#b9a6ff', [-7.2, 1.9, -0.4], 1.9);

    // The ship.
    this.ship.add(meshBox(1.2, 0.5, 2.3, 0xd9c8df, { position: [0, 0, 0], metalness: 0.55, roughness: 0.3 }));
    this.ship.add(meshBox(0.62, 0.3, 0.85, 0x7f6ba8, { position: [0, 0.36, -0.3], opacity: 0.8 }));
    this.ship.add(meshBox(0.35, 0.15, 0.8, 0x8ce8ff, { position: [0, 0.34, 0.35], glow: true, opacity: 0.75 }));
    for (const z of [-1.25, -0.9]) {
      this.ship.add(meshBox(1.55, 0.08, 0.36, 0xa992d9, { position: [0, 0.08, z] }));
    }
    this.ship.add(meshBox(0.62, 0.06, 0.7, 0xffd6ff, { position: [0, -0.25, -0.9], glow: true, opacity: 0.7 }));
    this.shipLight = new THREE.PointLight(0xffb37a, 1.2, 8, 2);
    this.shipLight.position.set(0, 0.1, -1.3);
    this.ship.add(this.shipLight);
    this.shipGlow = this.addStaticGlow([0, 0, 0], '#ffc2a5', 2.4, 0.4);
    this.ship.add(this.shipGlow);
    group.add(this.ship);

    this.ship.position.copy(this.route.getPointAt(0));
    this.trailLine = makeLine([], 0xaa8cff, 0.4);
    group.add(this.trailLine);
    for (let i = 0; i < 4; i++) {
      const line = makeLine(
        [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1.4 - i * 0.4)],
        0xffb37a,
        0.35,
      );
      this.engineTrail.push(line);
      this.ship.add(line);
    }

    // Living clock ledger.
    this.clockBoard = new CanvasBoard(5.8, 3.15, 700, 380);
    this.clockBoard.mesh.position.set(-1.6, 6.65, 5.6);
    this.clockBoard.mesh.rotation.y = -0.12;
    group.add(this.clockBoard.mesh);

    addStationSign(group, 'TWIN PARADOX RAIL', 'PROPER TIME IS PERSONAL', '#ffc2a5', [4.2, 8.5, -5.2], 5.4);

    // Distant starfield markers.
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const radius = 13 + (i % 4);
      const pos = [Math.cos(a) * radius, 3 + (i % 5) * 1.4, Math.sin(a) * radius];
      const star = meshBox(0.07, 0.07, 0.07, 0xffe0bf, {
        position: pos as [number, number, number],
        glow: true,
        opacity: 0.32 + (i % 4) * 0.12,
      });
      group.add(star);
    }

    this.addLight('#ffb37a', 1.4, 16, [-8, 4, 3]);
    this.addLight('#9e8bff', 0.9, 18, [8, 6, 3]);
    this.addLight('#ffc2a5', 0.6, 12, [2, 6, 6]);

    this.updateStats();
    this.drawClockBoard(true);
  }

  private gamma(): number {
    const beta = clamp(this.num('speed'), 0, 0.995);
    return 1 / Math.sqrt(1 - beta * beta);
  }

  private routeDistance(): number {
    return this.num('distance');
  }

  private totalEarthYears(): number {
    const beta = Math.max(0.01, this.num('speed'));
    return (2 * this.routeDistance()) / beta;
  }

  private totalShipYears(): number {
    return this.totalEarthYears() / this.gamma();
  }

  private updateStats(): void {
    const beta = clamp(this.num('speed'), 0, 0.995);
    const gamma = this.gamma();
    const earth = this.totalEarthYears();
    const ship = this.totalShipYears();
    if (this.running) {
      this.earthYears = earth * this.missionT;
      this.shipYears = ship * this.missionT;
    } else if (this.missionT >= 1) {
      this.earthYears = earth;
      this.shipYears = ship;
    } else {
      this.earthYears = 0;
      this.shipYears = 0;
    }
    if (this.stationClockHand) {
      const earthFrac = (this.earthYears % 10) / 10;
      const shipFrac = (this.shipYears % 10) / 10;
      this.stationClockHand.rotation.z = -earthFrac * Math.PI * 2;
      this.shipClockHand.rotation.z = -shipFrac * Math.PI * 2;
      const halo = 1 + (gamma - 1) * 0.04;
      this.shipClock.scale.setScalar(halo);
      this.stationClock.scale.setScalar(1);
    }
    if (this.twinStay) {
      this.twinStay.scale.y = 1 + (this.earthYears / Math.max(1, this.totalEarthYears())) * 0.03;
      this.twinGo.scale.y = 1 + (this.shipYears / Math.max(1, this.totalShipYears())) * 0.03;
    }
    this.labelCue(
      `β ${beta.toFixed(2)} · γ ${gamma.toFixed(3)} · Earth ${this.totalEarthYears().toFixed(2)} y · ship ${this.totalShipYears().toFixed(2)} y`,
    );
  }

  resetSim(): void {
    this.missionT = 0;
    this.running = false;
    this.earthYears = 0;
    this.shipYears = 0;
    this.trail = [];
    this.observationRestart = 0;
    if (this.ship) {
      this.ship.position.copy(this.route.getPointAt(0));
      this.ship.rotation.set(0, 0, 0);
      this.ship.scale.set(1, 1, 1);
      this.lastShipPosition.copy(this.ship.position);
      this.shipVelocity.set(0, 0, 0);
    }
    if (this.trailLine) {
      this.trailLine.geometry.dispose();
      this.trailLine.geometry = new THREE.BufferGeometry();
    }
    this.updateStats();
    this.drawClockBoard(true);
  }

  protected onParamChange(): void {
    this.resetSim();
  }

  triggerPrimaryAction(): void {
    if (this.running) return;
    if (this.missionT >= 1) this.missionT = 0;
    this.running = true;
    this.missionT = 0;
    this.earthYears = 0;
    this.shipYears = 0;
    this.trail = [];
    this.lastShipPosition.copy(this.route.getPointAt(0));
    this.shipVelocity.set(0, 0, 0);
    this.drawClockBoard(true);
  }

  getPrimaryActionLabel(): string | null {
    return this.running ? 'IN TRANSIT…' : this.missionT >= 1 ? 'RELAUNCH TWIN' : 'LAUNCH THE TWIN';
  }

  getPrimaryActionHint(): string {
    return 'Run the round trip and compare the two clocks at reunion.';
  }

  canUsePrimaryAction(): boolean {
    return !this.running;
  }

  step(dt: number): void {
    if (!this.ship) return;
    const earth = this.totalEarthYears();
    const shipTime = this.totalShipYears();
    let moving = false;

    if (this.observationActive) {
      if (!this.running) {
        this.observationRestart += dt;
        if (this.missionT >= 1) {
          if (this.observationRestart > 1.6) {
            this.missionT = 0;
            this.observationRestart = 0;
            this.running = true;
          }
        } else if (this.observationRestart > 0.6) {
          this.observationRestart = 0;
          this.running = true;
        }
      }
    }

    if (this.running) {
      this.missionT = Math.min(1, this.missionT + dt / this.missionDuration);
      const p = this.route.getPointAt(this.missionT);
      const tangent = this.route.getTangentAt(this.missionT);
      const look = p.clone().add(tangent);
      this.ship.position.copy(p);
      this.ship.lookAt(look);
      this.ship.rotateY(Math.PI);
      this.shipVelocity.copy(p).sub(this.lastShipPosition).divideScalar(Math.max(0.001, dt));
      this.lastShipPosition.copy(p);
      // Special Relativity: Length Contraction along the line of motion (L = L0 / gamma)
      const invGamma = 1 / Math.max(1, this.gamma());
      this.ship.scale.set(1, 1, invGamma);
      this.earthYears = earth * this.missionT;
      this.shipYears = shipTime * this.missionT;
      this.trail.push(p.clone());
      if (this.trail.length > 200) this.trail.shift();
      this.trailLine.geometry.dispose();
      this.trailLine.geometry = new THREE.BufferGeometry().setFromPoints(this.trail);
      moving = true;
      if (this.missionT >= 1) {
        this.running = false;
        this.ship.scale.set(1, 1, 1);
        this.earthYears = earth;
        this.shipYears = shipTime;
        this.challengeStatus = `Reunion: Earth aged ${earth.toFixed(2)} years, traveller aged ${shipTime.toFixed(2)} years.`;
      }
      for (let i = 0; i < this.engineTrail.length; i++) {
        const line = this.engineTrail[i];
        (line.material as THREE.LineBasicMaterial).opacity = 0.25 + Math.abs(Math.sin(this.simTime * 12 + i)) * 0.35;
      }
    }

    if (this.stationClockHand) {
      this.stationClockHand.rotation.z = -((this.earthYears % 10) / 10) * Math.PI * 2;
      this.shipClockHand.rotation.z = -((this.shipYears % 10) / 10) * Math.PI * 2;
    }
    if (this.shipGlow) {
      this.shipGlow.material.opacity = (moving ? 0.5 : 0.26) + Math.sin(this.simTime * 8) * 0.08;
    }
    if (this.starMesh) {
      this.starMesh.rotation.y += dt * 0.2;
      this.starMesh.rotation.x += dt * 0.08;
    }
    if (this.starGlow) {
      this.starGlow.material.opacity = 0.28 + Math.sin(this.simTime * 1.8) * 0.06;
    }
    for (let i = 0; i < this.routeLights.length; i++) {
      const light = this.routeLights[i];
      const phase = this.simTime * 1.4 - i * 0.22;
      (light.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.max(0, Math.sin(phase)) * 0.55;
    }

    this.boardTimer += dt;
    if (this.boardTimer > 0.2) {
      this.boardTimer = 0;
      this.drawClockBoard(false);
    }
  }

  private drawClockBoard(force: boolean): void {
    if (!this.clockBoard) return;
    const beta = clamp(this.num('speed'), 0, 0.995);
    const gamma = this.gamma();
    const earth = this.running || this.missionT >= 1 ? this.earthYears : this.totalEarthYears();
    const ship = this.running || this.missionT >= 1 ? this.shipYears : this.totalShipYears();
    const gap = earth - ship;
    this.clockBoard.draw(
      (ctx, w, h) => {
        ctx.fillStyle = 'rgba(4, 9, 16, 0.92)';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#ffc2a5';
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 2;
        ctx.strokeRect(8, 8, w - 16, h - 16);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffc2a5';
        ctx.font = '600 19px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('RELATIVITY LEDGER · PROPER TIME', 28, 30);
        drawClockFace(ctx, w * 0.27, 150, 92, '#ffc2a5', earth, 'Earth frame');
        drawClockFace(ctx, w * 0.73, 150, 92, '#b9a6ff', ship, 'Ship frame');
        ctx.fillStyle = '#f4ecff';
        ctx.textAlign = 'center';
        ctx.font = '600 22px "JetBrains Mono", monospace';
        ctx.fillText(`${earth.toFixed(2)} y`, w * 0.27, 276);
        ctx.fillStyle = '#c9b8ff';
        ctx.fillText(`${ship.toFixed(2)} y`, w * 0.73, 276);
        ctx.fillStyle = '#ffc2a5';
        ctx.font = '500 18px "JetBrains Mono", monospace';
        ctx.fillText(`β ${beta.toFixed(2)}  ·  γ ${gamma.toFixed(3)}  ·  Δ age ${gap.toFixed(2)} y`, w / 2, 326);
      },
      force,
      0.2,
    );
  }

  isSolved(): boolean {
    if (!this.challengeArmed || this.running) return false;
    if (Math.abs(this.routeDistance() - 4) > 0.01) return false;
    if (this.missionT < 0.995) return false;
    return Math.abs(this.totalShipYears() - 6) < 0.05;
  }

  getMetrics(): Readout[] {
    const beta = clamp(this.num('speed'), 0, 0.995);
    const gamma = this.gamma();
    const earth = this.totalEarthYears();
    const ship = this.totalShipYears();
    return [
      { label: 'Ship speed', value: beta.toFixed(2), unit: 'c', tone: 'warm' },
      { label: 'Lorentz factor', value: gamma.toFixed(3), unit: 'γ', tone: 'accent' },
      { label: 'Route', value: (this.routeDistance() * 2).toFixed(1), unit: 'ly round trip' },
      { label: 'Earth-frame time', value: earth.toFixed(2), unit: 'y' },
      { label: 'Ship proper time', value: ship.toFixed(2), unit: 'y', tone: Math.abs(ship - 6) < 0.05 ? 'accent' : 'cool' },
      { label: 'Age difference', value: (earth - ship).toFixed(2), unit: 'y', tone: 'warm' },
      { label: 'Mission', value: this.running ? 'IN TRANSIT' : this.missionT >= 1 ? 'REUNION' : 'READY', tone: this.running ? 'cool' : 'muted' },
    ];
  }

  getTelemetryTargets(): TelemetryTarget[] {
    const beta = clamp(this.num('speed'), 0, 0.995);
    return [
      this.makeTelemetry('twin-ship', this.ship, 'Travelling twin', 70, () => ({
        position: this.ship.position.clone(),
        velocity: this.shipVelocity.clone().multiplyScalar(0.4),
        acceleration: new THREE.Vector3(),
        extra: [
          { label: 'β', value: beta.toFixed(2) },
          { label: 'Proper time', value: `${this.shipYears.toFixed(2)} y` },
          { label: 'γ', value: this.gamma().toFixed(3) },
        ],
      })),
    ];
  }

  override getVectorProbes(): VectorProbe[] {
    if (!this.ship) return [];
    return [
      {
        id: 'twin-ship',
        position: this.ship.position.clone(),
        velocity: this.shipVelocity.clone().multiplyScalar(0.6),
        acceleration: new THREE.Vector3(0, 0, 0),
        gravity: new THREE.Vector3(0, 0, 0),
        scale: 0.8,
      },
    ];
  }

  override getGraphSample(): GraphSample {
    const beta = clamp(this.num('speed'), 0, 0.995);
    return {
      t: this.simTime,
      position: this.shipYears,
      velocity: beta,
      ke: this.gamma(),
      pe: this.earthYears,
      primaryLabel: 'Ship proper time',
      secondaryLabel: 'Earth-frame reference',
    };
  }
}
