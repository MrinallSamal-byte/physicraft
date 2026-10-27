import * as THREE from 'three';
import { Experiment } from '../BaseExperiment';
import type { ExperimentMeta, GraphSample, Readout, TelemetryTarget, VectorProbe } from '../types';
import type { EnvironmentState } from '../../config';
import { meshBox } from '../../world/voxel';
import { makeTextLabel } from '../../world/labels';
import { clamp } from '../../core/utils';
import {
  addStationSign,
  CanvasBoard,
  drawClockFace,
  glassBox,
  makeDashedLine,
  makeLine,
} from './sceneKit';

const O = {
  steel: 0x3c3546,
  steelLight: 0x7a6d8c,
  dark: 0x120c1c,
  brass: 0xd2a96a,
  violet: 0xd878ff,
  pink: 0xff7ad9,
  cyan: 0x79efff,
  ice: 0xa9d8ff,
  gold: 0xffd487,
  red: 0xff6b74,
  green: 0x76ffc2,
  wood: 0x6b4a3a,
};

const MEDIA: Record<string, { label: string; n: number; color: number; opacity: number; dispersion: number }> = {
  air: { label: 'Air / Vacuum', n: 1.0, color: 0xa8f4ff, opacity: 0.04, dispersion: 0 },
  water: { label: 'Water', n: 1.333, color: 0x2b8fbe, opacity: 0.22, dispersion: 0.0033 },
  glass: { label: 'Crown glass', n: 1.5, color: 0x83e3ef, opacity: 0.16, dispersion: 0.0042 },
  diamond: { label: 'Diamond', n: 2.417, color: 0xc7a7ff, opacity: 0.12, dispersion: 0.012 },
};

function wavelengthToColor(wavelength: number): THREE.Color {
  let r = 0;
  let g = 0;
  let b = 0;
  if (wavelength >= 380 && wavelength < 440) {
    r = -(wavelength - 440) / (440 - 380);
    b = 1.0;
  } else if (wavelength >= 440 && wavelength < 490) {
    g = (wavelength - 440) / (490 - 440);
    b = 1.0;
  } else if (wavelength >= 490 && wavelength < 510) {
    g = 1.0;
    b = -(wavelength - 510) / (510 - 490);
  } else if (wavelength >= 510 && wavelength < 580) {
    r = (wavelength - 510) / (580 - 510);
    g = 1.0;
  } else if (wavelength >= 580 && wavelength < 645) {
    r = 1.0;
    g = -(wavelength - 645) / (645 - 580);
  } else if (wavelength >= 645 && wavelength <= 780) {
    r = 1.0;
  }
  return new THREE.Color(r, g, b);
}

const SOUND = 343;

// -----------------------------------------------------------------------------
// 4.1 — Snell's Laser Labyrinth
// -----------------------------------------------------------------------------

const snellMeta: ExperimentMeta = {
  id: 'snell',
  biome: 'optics',
  number: '4.1',
  title: "Snell's Laser Labyrinth",
  shortTitle: 'Snell Labyrinth',
  subtitle: 'Light bends when the medium changes.',
  description:
    'Rotate and swap translucent voxel blocks (Air, Water, Glass, Diamond) to refract and internally reflect laser beams into target sensors. Tune incidence angle, block tilt, and light wavelength.',
  concept:
    'At an interface, the tangential component of the wave is continuous: n₁ sin θ₁ = n₂ sin θ₂. Going from a dense medium to a sparse one, beyond the critical angle there is no real refracted angle — the beam is totally internally reflected.',
  realWorld:
    'Eyeglasses, camera lenses, fibre-optic cables, mirages, and diamond sparkle all come from Snell’s law and total internal reflection.',
  formula: 'n₁ sin θ₁ = n₂ sin θ₂     ·     θ_c = arcsin(n₂/n₁)     ·     R + T = 1',
  formulaNote:
    'Angles are measured from the surface normal. Fresnel equations determine the energy split between reflection R and transmission T; at θ₁ ≥ θ_c, R = 100%.',
  badgeName: 'Critical Angle',
  accent: '#f0b7ff',
  accentNumber: 0xf0b7ff,
  badgeGlyph: '◇',
  controls: [
    {
      id: 'direction',
      label: 'Beam direction',
      kind: 'select',
      options: [
        { value: 'into', label: 'Air → medium' },
        { value: 'out', label: 'Medium → air' },
      ],
    },
    {
      id: 'medium',
      label: 'Optical medium (Voxel Block)',
      kind: 'select',
      options: [
        { value: 'air', label: 'Air · n = 1.000' },
        { value: 'water', label: 'Water · n = 1.333' },
        { value: 'glass', label: 'Crown glass · n = 1.50' },
        { value: 'diamond', label: 'Diamond · n = 2.417' },
      ],
    },
    { id: 'angle', label: 'Incidence angle θ₁', kind: 'range', min: 0, max: 80, step: 0.5, unit: '°' },
    { id: 'tilt', label: 'Block orientation / tilt', kind: 'range', min: -30, max: 30, step: 1, unit: '°', hint: 'Rotate the optical crystal block to align beam with sensors.' },
    { id: 'wavelength', label: 'Laser wavelength λ', kind: 'range', min: 400, max: 700, step: 10, unit: 'nm', hint: 'Sweep from violet (400nm) to red (700nm) to see chromatic dispersion!' },
  ],
  defaults: { direction: 'into', medium: 'glass', angle: 35, tilt: 0, wavelength: 540 },
  observeParams: { direction: 'out', medium: 'glass', angle: 10, tilt: 0, wavelength: 540 },
  observeCues: [
    { at: 0.1, text: 'The laser begins inside the glass, aimed almost straight up the normal. Most of the light escapes into the air.' },
    { at: 2.4, text: 'As the incidence angle grows, the escaping ray bends away from the normal. The ray is being dragged along the surface.' },
    { at: 4.6, text: 'At the critical angle the refracted ray becomes horizontal. Beyond it, the interface becomes a perfect mirror.' },
    { at: 6.8, text: 'This is total internal reflection: no refracted ray carries energy away. The glass traps the beam and sends it back inside.' },
    { at: 8.8, text: 'The critical angle depends only on the two refractive indices: θ_c = arcsin(n₂/n₁).' },
  ],
  challenge: {
    title: 'The Critical Escape',
    brief:
      'Use the glass → air interface and find the critical angle: the largest incidence angle that still lets a refracted ray graze along the surface.',
    hint: 'sin θ_c = n_air / n_glass = 1 / 1.50. Sweep slowly near 42° and watch the escaping ray flatten.',
    success: 'At the critical angle, the escaping ray lies exactly in the interface. One more tenth of a degree and it vanishes.',
    targetLabel: 'Glass → air · θ₁ = θ_c ± 0.8°',
  },
  chart: {
    title: 'Refraction response',
    positionLabel: 'Refraction angle (°)',
    velocityLabel: 'Light speed in medium (×10⁸ m/s)',
    energyLabel: 'Relative transmitted energy',
  },
};

export class SnellExperiment extends Experiment {
  private hit = new THREE.Vector3(0, 2.95, 0);
  private emitter = new THREE.Group();
  private incidentLine!: THREE.Line;
  private refractedLine!: THREE.Line;
  private reflectedLine!: THREE.Line;
  private normalLine!: THREE.Line;
  private arcGroup = new THREE.Group();
  private turntable = new THREE.Group();
  private slab!: THREE.Mesh;
  private slabBlock!: THREE.Mesh;
  private surface!: THREE.Mesh;
  private beamGlow!: THREE.Sprite;
  private hitGlow!: THREE.Sprite;
  private receiverAlpha!: THREE.Group;
  private receiverAlphaGlow!: THREE.Sprite;
  private receiverAlphaLabel!: THREE.Sprite;
  private receiverBeta!: THREE.Group;
  private receiverBetaGlow!: THREE.Sprite;
  private receiverBetaLabel!: THREE.Sprite;
  private photon!: THREE.Mesh;
  private currentEndpoint = new THREE.Vector3();
  private currentReflectedEnd = new THREE.Vector3();
  private photonPhase = 0;
  private theta1 = 0;
  private theta2 = 0;
  private tir = false;
  private critical = 90;
  private n1 = 1;
  private n2 = 1;
  private reflectanceR = 0;
  private transmittanceT = 1;
  private effectiveN = 1.5;
  private receiverAlphaHit = false;
  private receiverBetaHit = false;
  private angleLabelA = new THREE.Sprite();
  private angleLabelB = new THREE.Sprite();
  private angleLabelC = new THREE.Sprite();
  private mediumKey = '';
  private lastLabelKey = '';
  private laserColor = new THREE.Color(0x79efff);

  constructor() {
    super(snellMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 15, height: 6.8, targetHeight: 3.0 };
  }

  buildVisual(): void {
    const group = this.visualRoot;
    group.add(meshBox(14.5, 0.36, 8.2, 0x221a2c, { position: [1.6, 0.18, 0] }));
    group.add(meshBox(13.8, 0.09, 7.6, 0x392b48, { position: [1.6, 0.4, 0] }));

    // Turntable assembly for physical block rotation
    this.turntable.position.set(2.9, 0, 0);
    group.add(this.turntable);

    // Turntable circular brass ring pedestal
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 4.4, 0.16, 36),
      new THREE.MeshStandardMaterial({ color: O.brass, metalness: 0.8, roughness: 0.28 }),
    );
    pedestal.position.set(0, 0.48, 0);
    this.turntable.add(pedestal);

    // The translucent medium crystal block and interface surface
    this.slab = new THREE.Mesh(
      new THREE.BoxGeometry(11, 2.55, 5.6),
      new THREE.MeshPhysicalMaterial({
        color: 0x83e3ef,
        transparent: true,
        opacity: 0.16,
        roughness: 0.03,
        metalness: 0.01,
        transmission: 0.75,
        thickness: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.slab.position.set(0, 1.675, 0);
    this.turntable.add(this.slab);
    this.slabBlock = this.slab;

    this.surface = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 5.6),
      new THREE.MeshBasicMaterial({
        color: 0xbdf6ff,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.position.set(0, 2.96, 0);
    this.turntable.add(this.surface);

    // Tank frame and interior scale
    for (const x of [-5.5, 5.5]) {
      this.turntable.add(meshBox(0.12, 2.9, 5.8, O.steelLight, { position: [x, 1.7, 0], opacity: 0.55 }));
    }
    for (const z of [-2.9, 2.9]) {
      this.turntable.add(meshBox(11.1, 0.12, 0.12, O.steelLight, { position: [0, 2.95, z], opacity: 0.55 }));
      this.turntable.add(meshBox(11.1, 0.12, 0.12, O.steelLight, { position: [0, 0.45, z], opacity: 0.35 }));
    }
    for (let i = 0; i < 5; i++) {
      this.turntable.add(meshBox(0.025, 2.45, 5.5, 0xbfefff, { position: [-4.4 + i * 2.2, 1.7, 0], opacity: 0.06 }));
    }

    // Protractor ring around the hit point
    const protractor = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.29, 64, 1, 0, Math.PI),
      new THREE.MeshBasicMaterial({
        color: 0xd6b8ff,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        toneMapped: false,
        depthWrite: false,
      }),
    );
    protractor.position.set(this.hit.x, this.hit.y + 0.02, 0.25);
    group.add(protractor);
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      const tick = meshBox(0.025, 0.17, 0.025, 0xdfc8ff, {
        position: [this.hit.x + Math.cos(a) * 1.37, this.hit.y + Math.sin(a) * 1.37, 0.25],
        rotation: [0, 0, a - Math.PI / 2],
        glow: true,
        opacity: 0.45,
      });
      group.add(tick);
    }

    // Laser emitter
    this.emitter.add(meshBox(0.48, 0.48, 1.65, O.steelLight, { position: [0, 0, 0], metalness: 0.7, roughness: 0.3 }));
    const diodeLens = meshBox(0.3, 0.3, 0.25, O.pink, { position: [0, 0, 0.88], glow: true, opacity: 0.9 });
    this.emitter.add(diodeLens);
    this.emitter.add(meshBox(0.58, 0.1, 0.4, O.brass, { position: [0, -0.28, 0.45] }));
    group.add(this.emitter);

    // Laser beam lines
    this.incidentLine = makeLine([new THREE.Vector3(), new THREE.Vector3()], 0xff72d8, 0.95);
    this.refractedLine = makeLine([new THREE.Vector3(), new THREE.Vector3()], 0x8ff4ff, 0.9);
    this.reflectedLine = makeLine([new THREE.Vector3(), new THREE.Vector3()], 0xff9de0, 0.6);
    this.normalLine = makeDashedLine(
      [new THREE.Vector3(this.hit.x, 0.45, 0), new THREE.Vector3(this.hit.x, 7.0, 0)],
      0xd8c4ff,
      0.4,
      0.18,
      0.13,
    );
    group.add(this.incidentLine, this.refractedLine, this.reflectedLine, this.normalLine);
    this.arcGroup.position.set(this.hit.x, this.hit.y, 0.02);
    group.add(this.arcGroup);

    this.beamGlow = this.addStaticGlow([this.hit.x, this.hit.y, 0], '#ff9de3', 2.6, 0.38);
    this.hitGlow = this.addStaticGlow([this.hit.x, this.hit.y, 0], '#d8f7ff', 1.6, 0.2);

    this.photon = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.12, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd4f4, toneMapped: false }),
    );
    group.add(this.photon);

    // Target Sensor Alpha (Refracted Beam Target at bottom tank plate)
    const rx = this.hit.x + (this.hit.y - 0.55) * Math.tan(THREE.MathUtils.degToRad(30));
    this.receiverAlpha = new THREE.Group();
    this.receiverAlpha.position.set(rx, 0.55, 0);
    group.add(this.receiverAlpha);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.35 + i * 0.12, 0.028, 5, 24),
        new THREE.MeshBasicMaterial({ color: 0x79efff, transparent: true, opacity: 0.55 - i * 0.12, toneMapped: false }),
      );
      ring.rotation.x = Math.PI / 2;
      this.receiverAlpha.add(ring);
    }
    this.receiverAlpha.add(meshBox(0.3, 0.55, 0.3, 0x22353c, { position: [0, -0.25, 0] }));
    this.receiverAlphaGlow = this.addStaticGlow([rx, 0.62, 0], '#79efff', 1.8, 0.15);
    this.receiverAlphaLabel = makeTextLabel('SENSOR ALPHA', 'refraction target', '#79efff', { width: 640, height: 200 });
    this.receiverAlphaLabel.position.set(rx, 1.65, 0.7);
    this.receiverAlphaLabel.scale.set(1.65, 0.53, 1);
    group.add(this.receiverAlphaLabel);

    // Target Sensor Beta (Total Internal Reflection Target on upper gantry)
    const bx = 4.8;
    const by = 5.8;
    this.receiverBeta = new THREE.Group();
    this.receiverBeta.position.set(bx, by, 0);
    group.add(this.receiverBeta);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.38 + i * 0.12, 0.028, 5, 24),
        new THREE.MeshBasicMaterial({ color: 0xff7ad9, transparent: true, opacity: 0.55 - i * 0.12, toneMapped: false }),
      );
      ring.rotation.y = Math.PI / 2;
      this.receiverBeta.add(ring);
    }
    this.receiverBeta.add(meshBox(0.55, 0.3, 0.3, 0x3c2235, { position: [0.25, 0, 0] }));
    this.receiverBetaGlow = this.addStaticGlow([bx, by, 0], '#ff7ad9', 2.0, 0.15);
    this.receiverBetaLabel = makeTextLabel('SENSOR BETA', 'TIR reflection target', '#ff7ad9', { width: 640, height: 200 });
    this.receiverBetaLabel.position.set(bx, by + 1.1, 0.7);
    this.receiverBetaLabel.scale.set(1.65, 0.53, 1);
    group.add(this.receiverBetaLabel);

    // Floating angle displays
    this.angleLabelA = new THREE.Sprite(
      new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.angleLabelA.scale.set(2.4, 0.78, 1);
    this.angleLabelA.position.set(-3.6, 6.4, 0.8);
    group.add(this.angleLabelA);
    this.angleLabelB = makeTextLabel('θ₂ —', 'refraction', '#8ff4ff', { width: 700, height: 240 });
    this.angleLabelB.scale.set(2.35, 0.78, 1);
    this.angleLabelB.position.set(4.2, 5.35, 0.8);
    group.add(this.angleLabelB);
    this.angleLabelC = makeTextLabel('θ_c —', 'critical angle', '#f0b7ff', { width: 700, height: 240 });
    this.angleLabelC.scale.set(2.2, 0.72, 1);
    this.angleLabelC.position.set(6.3, 6.75, 0.2);
    group.add(this.angleLabelC);

    addStationSign(group, "SNELL'S LASER LABYRINTH", 'n₁ sin θ₁ = n₂ sin θ₂ · R + T = 1', '#f0b7ff', [1.8, 8.8, -2.4], 5.2);
    group.add(meshBox(0.18, 5.5, 0.18, O.steel, { position: [-2.35, 5.6, -2.0] }));
    group.add(meshBox(0.18, 5.5, 0.18, O.steel, { position: [8.15, 5.6, -2.0] }));
    this.addLight('#ff86da', 1.2, 11, [-2.5, 5.0, 2.0]);
    this.addLight('#82f1ff', 1.0, 12, [4.5, 3.0, 2.2]);
    this.addLight('#d8a6ff', 0.8, 10, [0, 1.7, 0]);

    this.updateOptics();
  }

  private media() {
    return MEDIA[this.str('medium')] ?? MEDIA.glass;
  }

  private updateOptics(): void {
    if (!this.incidentLine) return;
    const dir = this.str('direction');
    const medium = this.media();
    const wavelength = this.num('wavelength') || 540;
    const lambdaUm = wavelength / 1000;

    // Cauchy dispersion formula: n(lambda) = n_base + B / lambda^2
    this.effectiveN = medium.n + medium.dispersion / (lambdaUm * lambdaUm);
    this.laserColor = wavelengthToColor(wavelength);

    this.n1 = dir === 'into' ? 1.0 : this.effectiveN;
    this.n2 = dir === 'into' ? this.effectiveN : 1.0;
    this.theta1 = this.num('angle');
    const tilt = this.num('tilt') || 0;
    const tiltRad = THREE.MathUtils.degToRad(tilt);

    // Physically rotate turntable block
    this.turntable.rotation.z = tiltRad;

    const rad = THREE.MathUtils.degToRad(this.theta1);
    const sinOut = (this.n1 / this.n2) * Math.sin(rad);
    this.tir = sinOut > 1.0;
    this.theta2 = this.tir ? 90 : THREE.MathUtils.radToDeg(Math.asin(clamp(sinOut, -1, 1)));
    this.critical = this.n1 > this.n2
      ? THREE.MathUtils.radToDeg(Math.asin(clamp(this.n2 / this.n1, 0, 1)))
      : 90;

    // Fresnel reflectance and transmittance
    const cos1 = Math.cos(rad);
    const cos2 = Math.cos(THREE.MathUtils.degToRad(this.theta2));
    if (this.tir) {
      this.reflectanceR = 1.0;
      this.transmittanceT = 0.0;
    } else {
      const rs = Math.abs((this.n1 * cos1 - this.n2 * cos2) / (this.n1 * cos1 + this.n2 * cos2)) ** 2;
      const rp = Math.abs((this.n1 * cos2 - this.n2 * cos1) / (this.n1 * cos2 + this.n2 * cos1)) ** 2;
      this.reflectanceR = clamp((rs + rp) / 2, 0, 1);
      this.transmittanceT = clamp(1 - this.reflectanceR, 0, 1);
    }

    const key = `${this.str('medium')}-${dir}-${wavelength}-${tilt}`;
    if (key !== this.mediumKey) {
      this.mediumKey = key;
      const mat = this.slab.material as THREE.MeshPhysicalMaterial;
      mat.color.setHex(medium.color);
      mat.opacity = medium.opacity;
      (this.surface.material as THREE.MeshBasicMaterial).color.setHex(medium.color).lerp(new THREE.Color(0xffffff), 0.5);
    }

    const normal =
      dir === 'into'
        ? new THREE.Vector3(-Math.sin(tiltRad), Math.cos(tiltRad), 0)
        : new THREE.Vector3(Math.sin(tiltRad), -Math.cos(tiltRad), 0);
    const tangent = new THREE.Vector3(Math.cos(tiltRad), Math.sin(tiltRad), 0);

    // Incident direction towards hit
    const incDir = tangent.clone().multiplyScalar(-Math.sin(rad)).sub(normal.clone().multiplyScalar(Math.cos(rad))).normalize();
    const distance = dir === 'into' ? 3.8 : 2.35;
    const start = this.hit.clone().sub(incDir.clone().multiplyScalar(distance));
    this.emitter.position.copy(start);
    this.emitter.lookAt(this.hit);

    // Update laser line colors based on wavelength
    (this.incidentLine.material as THREE.LineBasicMaterial).color.copy(this.laserColor);
    (this.refractedLine.material as THREE.LineBasicMaterial).color.copy(this.laserColor);
    (this.reflectedLine.material as THREE.LineBasicMaterial).color.copy(this.laserColor);
    (this.photon.material as THREE.MeshBasicMaterial).color.copy(this.laserColor);
    this.hitGlow.material.color.copy(this.laserColor);
    this.beamGlow.material.color.copy(this.laserColor);

    this.setBeamPoints(this.incidentLine, [start, this.hit]);

    // Law of Reflection vector: d_refl = -sin(theta1) * T + cos(theta1) * N
    const reflectedDir = tangent.clone().multiplyScalar(-Math.sin(rad)).add(normal.clone().multiplyScalar(Math.cos(rad))).normalize();
    const reflectedEnd = this.hit.clone().addScaledVector(reflectedDir, 4.8);
    reflectedEnd.y = clamp(reflectedEnd.y, 0.5, 7.5);
    this.currentReflectedEnd.copy(reflectedEnd);
    this.setBeamPoints(this.reflectedLine, [this.hit, reflectedEnd]);

    // Reflection is always physically active; opacity mirrors Fresnel R
    this.reflectedLine.visible = true;
    (this.reflectedLine.material as THREE.LineBasicMaterial).opacity = Math.max(0.12, this.reflectanceR * 0.95);

    let endpoint: THREE.Vector3;
    if (this.tir) {
      endpoint = reflectedEnd;
      this.refractedLine.visible = false;
    } else {
      const t2Rad = THREE.MathUtils.degToRad(this.theta2);
      // Law of Refraction vector: d_refr = -sin(theta2) * T - cos(theta2) * N
      const refractedDir = tangent.clone().multiplyScalar(-Math.sin(t2Rad)).sub(normal.clone().multiplyScalar(Math.cos(t2Rad))).normalize();
      if (dir === 'into') {
        const length = (this.hit.y - 0.55) / Math.max(0.08, Math.cos(t2Rad));
        endpoint = this.hit.clone().addScaledVector(refractedDir, Math.min(length, 7.4));
      } else {
        endpoint = this.hit.clone().addScaledVector(refractedDir, 4.2);
      }
      this.refractedLine.visible = true;
      (this.refractedLine.material as THREE.LineBasicMaterial).opacity = Math.max(0.05, this.transmittanceT * 0.95);
      this.setBeamPoints(this.refractedLine, [this.hit, endpoint]);
    }
    this.currentEndpoint.copy(endpoint);

    // Target Sensor Alpha check (Refraction Target)
    this.receiverAlphaHit =
      dir === 'into' &&
      !this.tir &&
      Math.abs(endpoint.x - this.receiverAlpha.position.x) < 0.55 &&
      Math.abs(endpoint.y - 0.55) < 0.35;
    this.receiverAlphaGlow.material.opacity = this.receiverAlphaHit ? 0.95 : 0.15;
    this.receiverAlphaGlow.scale.setScalar(this.receiverAlphaHit ? 3.4 : 1.8);

    // Target Sensor Beta check (TIR Reflection Target)
    this.receiverBetaHit =
      (this.tir || this.reflectanceR > 0.4) &&
      Math.abs(reflectedEnd.x - this.receiverBeta.position.x) < 0.85 &&
      Math.abs(reflectedEnd.y - this.receiverBeta.position.y) < 0.85;
    this.receiverBetaGlow.material.opacity = this.receiverBetaHit ? 0.95 : 0.15;
    this.receiverBetaGlow.scale.setScalar(this.receiverBetaHit ? 3.4 : 1.8);

    this.beamGlow.material.opacity = (this.tir ? 0.65 : 0.32) + this.reflectanceR * 0.2;
    this.beamGlow.scale.setScalar(this.tir ? 3.6 : 2.5);
    this.hitGlow.material.opacity = 0.18 + (this.theta1 / 80) * 0.18;

    this.updateArcs(rad, dir);
    this.updateLabels();
    this.angleLabelC.visible = this.n1 > this.n2 && !this.challengeArmed;
  }

  private emitterStart(rad: number, dir: string, tilt: number = 0): THREE.Vector3 {
    const distance = dir === 'into' ? 3.8 : 2.35;
    return new THREE.Vector3(
      this.hit.x - Math.sin(rad - tilt) * distance,
      this.hit.y + (dir === 'into' ? Math.cos(rad - tilt) : -Math.cos(rad - tilt)) * distance,
      0,
    );
  }

  private setBeamPoints(line: THREE.Line, points: THREE.Vector3[]): void {
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }

  private updateArcs(rad: number, dir: string): void {
    this.arcGroup.clear();
    const incidentBack = dir === 'into' ? Math.PI / 2 + rad : -Math.PI / 2 - rad;
    this.arcGroup.add(this.arc(incidentBack, dir === 'into' ? Math.PI / 2 : -Math.PI / 2, 0.88, 0xff9de0, 0.7));
    if (!this.tir) {
      const t2 = THREE.MathUtils.degToRad(this.theta2);
      const startAngle = dir === 'into' ? -Math.PI / 2 : Math.PI / 2;
      const endAngle = dir === 'into' ? -Math.PI / 2 + t2 : Math.PI / 2 - t2;
      this.arcGroup.add(this.arc(startAngle, endAngle, 1.12, 0x8ff4ff, 0.62));
    }
  }

  private arc(a0: number, a1: number, radius: number, color: number, opacity: number): THREE.Line {
    const points: THREE.Vector3[] = [];
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      points.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0.06));
    }
    return makeLine(points, color, opacity);
  }

  private updateLabels(): void {
    const key = `${this.str('medium')}-${this.str('direction')}-${this.theta1.toFixed(1)}-${this.theta2.toFixed(1)}-${this.tir}-${this.num('tilt')}-${this.num('wavelength')}`;
    if (key === this.lastLabelKey) return;
    this.lastLabelKey = key;
    const medium = this.media();
    const labelA = makeTextLabel(
      `θ₁ ${this.theta1.toFixed(1)}°`,
      `${this.str('direction') === 'into' ? 'AIR' : medium.label.toUpperCase()} → ${this.str('direction') === 'into' ? medium.label.toUpperCase() : 'AIR'}`,
      '#ff9de0',
      { width: 700, height: 240 },
    );
    this.angleLabelA.material.map?.dispose();
    this.angleLabelA.material.map = labelA.material.map;
    this.angleLabelA.material.needsUpdate = true;
    labelA.material.dispose();

    const labelB = makeTextLabel(
      this.tir ? 'θ₂ — none' : `θ₂ ${this.theta2.toFixed(1)}°`,
      this.tir ? 'TOTAL INTERNAL REFLECTION (100% R)' : `REFRACTED RAY (T ${(this.transmittanceT * 100).toFixed(0)}%)`,
      this.tir ? '#ff8e9b' : '#8ff4ff',
      { width: 700, height: 240 },
    );
    this.angleLabelB.material.map?.dispose();
    this.angleLabelB.material.map = labelB.material.map;
    this.angleLabelB.material.needsUpdate = true;
    labelB.material.dispose();
    this.angleLabelB.scale.set(2.35, 0.78, 1);

    if (this.n1 > this.n2) {
      this.angleLabelC.visible = true;
      const labelC = makeTextLabel(
        `θ_c ${this.critical.toFixed(1)}°`,
        'CRITICAL ANGLE',
        '#f0b7ff',
        { width: 700, height: 240 },
      );
      this.angleLabelC.material.map?.dispose();
      this.angleLabelC.material.map = labelC.material.map;
      this.angleLabelC.material.needsUpdate = true;
      labelC.material.dispose();
    } else {
      this.angleLabelC.visible = false;
    }
    if (this.challengeArmed) this.angleLabelC.visible = false;
  }

  protected onParamChange(): void {
    this.updateOptics();
  }

  resetSim(): void {
    this.photonPhase = 0;
    this.updateOptics();
    if (!this.challengeArmed) this.angleLabelC.visible = this.n1 > this.n2;
  }

  private beamLengthToEndpoint(dir: string): number {
    if (this.tir) return 3.4;
    const t2 = THREE.MathUtils.degToRad(this.theta2);
    if (dir === 'into') return (this.hit.y - 0.55) / Math.max(0.08, Math.cos(t2));
    return 3.6;
  }

  triggerPrimaryAction(): void {
    this.restartSim();
  }

  getPrimaryActionLabel(): string | null {
    return 'FIRE LASER';
  }

  getPrimaryActionHint(): string {
    return 'Emit photon wave packet through the crystal interface.';
  }

  step(dt: number): void {
    if (!this.incidentLine) return;
    if (this.observationActive) {
      const sweep = 10 + clamp(this.simTime / 8.2, 0, 1) * 37;
      const snapped = Math.round(sweep * 2) / 2;
      if (Math.abs(snapped - this.num('angle')) >= 0.01) {
        this.params.angle = snapped;
        this.theta1 = snapped;
        this.updateOptics();
      }
    }

    // Photon speed in medium scales with 1 / n
    const dir = this.str('direction');
    const inMedium = (dir === 'into' && this.photonPhase >= 0.5) || (dir === 'out' && this.photonPhase < 0.5);
    const currentN = inMedium ? this.effectiveN : 1.0;
    const speed = 0.65 / Math.max(1, currentN);

    this.photonPhase = (this.photonPhase + dt * speed) % 1;
    const start = this.emitter.position;
    let segmentStart: THREE.Vector3;
    let segmentEnd: THREE.Vector3;
    if (this.photonPhase < 0.5) {
      segmentStart = start.clone();
      segmentEnd = this.hit.clone();
    } else {
      segmentStart = this.hit.clone();
      segmentEnd = this.tir ? this.currentReflectedEnd.clone() : this.currentEndpoint.clone();
    }
    const t = (this.photonPhase % 0.5) * 2;
    this.photon.position.copy(segmentStart).lerp(segmentEnd, clamp(t, 0, 1));
    this.photon.position.z += 0.1;
    this.photon.visible = true;

    // Spin receiver rings on hit
    if (this.receiverAlphaHit) {
      this.receiverAlpha.rotation.y += dt * 3.5;
    }
    if (this.receiverBetaHit) {
      this.receiverBeta.rotation.x += dt * 3.5;
    }

    this.beamGlow.material.opacity = (this.tir ? 0.55 : 0.28) + Math.sin(this.simTime * 9) * 0.05;
    (this.surface.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(this.simTime * 2.2) * 0.03;
  }

  isSolved(): boolean {
    if (!this.challengeArmed) return false;
    if (this.str('direction') === 'out') {
      return (
        (this.str('medium') === 'glass' && Math.abs(this.num('angle') - this.critical) < 0.85) ||
        this.receiverBetaHit
      );
    }
    return this.receiverAlphaHit;
  }

  getMetrics(): Readout[] {
    const medium = this.media();
    const rows: Readout[] = [
      { label: 'Medium', value: medium.label, unit: `n = ${this.effectiveN.toFixed(3)}`, tone: 'warm' },
      { label: 'Incident θ₁', value: this.theta1.toFixed(1), unit: '°', tone: 'accent' },
      {
        label: this.tir ? 'Refraction' : 'Refracted θ₂',
        value: this.tir ? 'TIR' : this.theta2.toFixed(1),
        unit: this.tir ? '' : '°',
        tone: this.tir ? 'danger' : 'cool',
      },
      {
        label: 'Reflectance R',
        value: `${(this.reflectanceR * 100).toFixed(1)}%`,
        unit: 'Fresnel',
        tone: this.tir ? 'danger' : 'warm',
      },
      {
        label: 'Transmittance T',
        value: `${(this.transmittanceT * 100).toFixed(1)}%`,
        unit: 'Fresnel',
        tone: this.transmittanceT > 0.05 ? 'accent' : 'muted',
      },
      {
        label: 'Sensors',
        value: this.receiverAlphaHit ? 'ALPHA HIT' : this.receiverBetaHit ? 'BETA HIT' : 'SEARCHING',
        tone: (this.receiverAlphaHit || this.receiverBetaHit) ? 'accent' : 'muted',
      },
    ];
    if (!this.challengeArmed && this.n1 > this.n2) {
      rows.push({ label: 'Critical θ_c', value: this.critical.toFixed(1), unit: '°', tone: 'warm' });
    }
    return rows;
  }

  getTelemetryTargets(): TelemetryTarget[] {
    return [
      this.makeTelemetry('snell-photon', this.photon, 'Photon packet', 0, () => {
        const dir = this.str('direction');
        const inMedium = (dir === 'into' && this.photonPhase >= 0.5) || (dir === 'out' && this.photonPhase < 0.5);
        const currentN = inMedium ? this.effectiveN : 1.0;
        const speed = 299_792_458 / Math.max(1, currentN);
        const velocity = new THREE.Vector3(0, 0, 0);
        if (!inMedium) {
          velocity.set(Math.sin(THREE.MathUtils.degToRad(this.theta1)), -Math.cos(THREE.MathUtils.degToRad(this.theta1)), 0);
        } else if (this.tir) {
          velocity.set(Math.sin(THREE.MathUtils.degToRad(this.theta1)), dir === 'into' ? Math.cos(THREE.MathUtils.degToRad(this.theta1)) : -Math.cos(THREE.MathUtils.degToRad(this.theta1)), 0);
        } else {
          const t2 = THREE.MathUtils.degToRad(this.theta2);
          velocity.set(Math.sin(t2), dir === 'into' ? -Math.cos(t2) : Math.cos(t2), 0);
        }
        return {
          position: this.photon.position.clone(),
          velocity: velocity.multiplyScalar(2.2),
          acceleration: new THREE.Vector3(),
          extra: [
            { label: 'Speed in medium', value: `${(speed / 1e8).toFixed(3)} ×10⁸ m/s` },
            { label: 'Optical path', value: this.tir ? 'internally reflected' : 'refracted' },
            { label: 'Reflectance R', value: `${(this.reflectanceR * 100).toFixed(1)}%` },
            { label: 'Transmittance T', value: `${(this.transmittanceT * 100).toFixed(1)}%` },
          ],
        };
      }),
    ];
  }

  override getVectorProbes(): VectorProbe[] {
    if (!this.photon) return [];
    const target = this.getTelemetryTargets()[0];
    if (!target) return [];
    const state = target.getState();
    return [
      {
        id: 'photon',
        position: state.position.clone(),
        velocity: state.velocity.clone(),
        scale: 0.9,
      },
    ];
  }

  override getGraphSample(): GraphSample {
    const medium = this.media();
    return {
      t: this.simTime,
      position: this.tir ? 90 : this.theta2,
      velocity: (299_792_458 / medium.n) / 1e8,
      ke: this.tir ? 0 : Math.cos(THREE.MathUtils.degToRad(this.theta1 - this.theta2)) ** 2,
      pe: 0,
      primaryLabel: 'Refraction angle',
      secondaryLabel: this.tir ? 'Total internal reflection' : 'Snell interface',
    };
  }
}

// -----------------------------------------------------------------------------
// 4.2 — Doppler Speedway
// -----------------------------------------------------------------------------

const dopplerMeta: ExperimentMeta = {
  id: 'doppler',
  biome: 'optics',
  number: '4.2',
  title: 'Doppler Speedway',
  shortTitle: 'Doppler Speedway',
  subtitle: 'Motion writes itself into pitch.',
  description:
    'Drive a siren down a night track. Wavefronts bunch ahead of it and stretch behind, so the same siren sounds higher to the observer it approaches and lower to the one it leaves.',
  concept:
    'For a stationary observer, a source moving at speed v_s compresses wavefronts ahead and stretches them behind: f′ = f c/(c ∓ v_s). The wave speed is unchanged; the wavelength is not.',
  realWorld:
    'Weather radar, police speed guns, redshift surveys, medical ultrasound, and the changing pitch of a passing ambulance all measure motion through frequency shifts.',
  formula: "f′ = f · c/(c − v_s) ahead     ·     f′ = f · c/(c + v_s) behind",
  formulaNote:
    'The shift is set by the ratio of source speed to wave speed. At v_s = 0.25c, the siren ahead rises by about 33% and the siren behind falls by 20%.',
  badgeName: 'Redshift Rider',
  accent: '#ff9edb',
  accentNumber: 0xff9edb,
  badgeGlyph: '≈',
  controls: [
    { id: 'frequency', label: 'Siren frequency f', kind: 'range', min: 300, max: 800, step: 5, unit: 'Hz' },
    { id: 'speed', label: 'Source speed v', kind: 'range', min: 0, max: 300, step: 1, unit: 'm/s' },
    {
      id: 'observer',
      label: 'Observer channel',
      kind: 'select',
      options: [
        { value: 'ahead', label: 'Ahead of the siren' },
        { value: 'behind', label: 'Behind the siren' },
      ],
    },
  ],
  defaults: { frequency: 500, speed: 120, observer: 'ahead' },
  observeParams: { frequency: 500, speed: 20, observer: 'ahead' },
  observeCues: [
    { at: 0.1, text: 'The siren is nearly still. Wavefronts leave it in even circles at 343 m/s.' },
    { at: 2.2, text: 'As the car accelerates, watch the rings ahead. Each new wave starts closer to the last one.' },
    { at: 4.6, text: 'Compressed wavefronts mean shorter wavelength and higher frequency. The observer ahead hears a higher pitch.' },
    { at: 6.8, text: 'Behind the car, the rings stretch apart. Lower pitch. Same siren, different relative motion.' },
    { at: 8.8, text: 'The Doppler shift is not the sound changing speed — it is the spacing of the waves changing.' },
  ],
  challenge: {
    title: 'The 400 Hertz Pass',
    brief:
      'Set the siren to 500 Hz and tune its speed so the observer behind the car measures exactly 400 Hz.',
    hint: 'Use f′ = f c/(c + v). Solve for v: v = c(f/f′ − 1). With f = 500 Hz and f′ = 400 Hz, v ≈ 85.8 m/s.',
    success: 'The trailing observer hears a clean 400 Hz. The wavefronts behind the siren are perfectly stretched for that note.',
    targetLabel: 'f_siren = 500 Hz · f_behind = 400 Hz',
  },
  chart: {
    title: 'Observed pitch',
    positionLabel: 'Observed frequency (Hz)',
    velocityLabel: 'Source speed (m/s)',
    energyLabel: 'Shift from source (%)',
  },
};

type WaveRing = { mesh: THREE.Mesh; x: number; age: number; alive: boolean };

export class DopplerExperiment extends Experiment {
  private car = new THREE.Group();
  private rings: WaveRing[] = [];
  private sourceX = -9;
  private emissionTimer = 0;
  private cEffective = 7.2;
  private frontBoard!: CanvasBoard;
  private backBoard!: CanvasBoard;
  private frontLamp!: THREE.Mesh;
  private backLamp!: THREE.Mesh;
  private frontGlow!: THREE.Sprite;
  private backGlow!: THREE.Sprite;
  private frontBoardMesh!: THREE.Mesh;
  private backBoardMesh!: THREE.Mesh;
  private speedLines: THREE.Line[] = [];
  private sourceGlow!: THREE.Sprite;
  private wheelSpin = 0;
  private frontFrequency = 0;
  private backFrequency = 0;
  private boardClock = 0;

  constructor() {
    super(dopplerMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 21, height: 10.5, targetHeight: 2.2 };
  }

  buildVisual(): void {
    const group = this.visualRoot;
    group.add(meshBox(28, 0.34, 8.5, 0x1c1228, { position: [0, 0.17, 0] }));
    group.add(meshBox(27.2, 0.1, 7.9, 0x34223f, { position: [0, 0.4, 0] }));

    // Track.
    for (const z of [-1.7, 1.7]) {
      group.add(meshBox(25.5, 0.12, 0.16, 0x9082a3, { position: [0, 0.48, z], metalness: 0.55, roughness: 0.4 }));
    }
    for (let x = -12; x <= 12; x += 0.9) {
      group.add(meshBox(0.5, 0.07, 4.3, 0x4b3358, { position: [x, 0.46, 0] }));
      group.add(meshBox(0.5, 0.015, 4.3, 0x6f4f7e, { position: [x, 0.5, 0], opacity: 0.5 }));
    }
    for (let i = 0; i < 9; i++) {
      const mark = meshBox(0.08, 0.02, 0.6, 0xff9edb, {
        position: [-10.8 + i * 2.7, 0.53, 0],
        glow: true,
        opacity: 0.3,
      });
      group.add(mark);
    }

    // Siren car.
    this.car.position.set(this.sourceX, 0.55, 0);
    this.car.add(meshBox(2.5, 0.72, 1.55, 0x5c3d7b, { position: [0, 0.6, 0], metalness: 0.35, roughness: 0.4 }));
    this.car.add(meshBox(1.45, 0.52, 1.36, 0x30203f, { position: [-0.2, 1.2, 0] }));
    this.car.add(meshBox(0.9, 0.36, 1.2, 0x7f5da2, { position: [-0.42, 1.48, 0], opacity: 0.72 }));
    for (const x of [-0.72, 0.72]) {
      for (const z of [-0.82, 0.82]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.3, 0.18, 12),
          new THREE.MeshStandardMaterial({ color: 0x211a27, metalness: 0.4, roughness: 0.6 }),
        );
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x, 0.27, z);
        this.car.add(wheel);
      }
    }
    // Siren horn and sound-emitting orb.
    const horn = new THREE.Mesh(
      new THREE.ConeGeometry(0.38, 0.9, 12, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xffb8e6,
        emissive: 0xff6ec7,
        emissiveIntensity: 0.9,
        metalness: 0.3,
        roughness: 0.35,
        side: THREE.DoubleSide,
      }),
    );
    horn.rotation.z = -Math.PI / 2;
    horn.position.set(1.55, 1.28, 0);
    this.car.add(horn);
    this.car.add(meshBox(0.36, 0.24, 0.28, 0xffd2ef, { position: [0.9, 1.47, 0], glow: true, opacity: 0.95 }));
    this.sourceGlow = this.addStaticGlow([0, 1.4, 0], '#ff8dd8', 2.4, 0.55);
    this.sourceGlow.position.set(0, 1.4, 0);
    this.car.add(this.sourceGlow);
    group.add(this.car);

    // Observer stations at both ends.
    const buildObserver = (x: number, label: string, accent: string, side: number) => {
      group.add(meshBox(0.35, 4.1, 0.35, 0x554067, { position: [x, 2.2, 0] }));
      group.add(meshBox(1.25, 0.32, 1.25, 0x3a2a49, { position: [x, 0.6, 0] }));
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({
          color: accent,
          emissive: new THREE.Color(accent),
          emissiveIntensity: 0.35,
          metalness: 0.5,
          roughness: 0.3,
          side: THREE.DoubleSide,
        }),
      );
      dish.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      dish.position.set(x + side * 0.5, 3.55, 0);
      dish.scale.set(0.7, 0.7, 0.7);
      group.add(dish);
      const board = new CanvasBoard(3.6, 1.15, 512, 164);
      board.mesh.position.set(x, 5.25, 0);
      board.mesh.rotation.y = 0;
      group.add(board.mesh);
      addStationSign(group, label, side > 0 ? 'WAVES ARRIVING COMPRESSED' : 'WAVES ARRIVING STRETCHED', accent, [x, 6.3, 0], 3.6);
      const glow = this.addStaticGlow([x + side * 0.6, 3.55, 0], accent, 2.6, 0.2);
      const lamp = meshBox(0.22, 0.22, 0.22, accent, {
        position: [x, 4.5, 0.25],
        glow: true,
        opacity: 0.6,
      });
      group.add(lamp);
      return { board, glow, lamp };
    };

    const front = buildObserver(13, 'AHEAD OBSERVER', '#ff9edb', -1);
    const back = buildObserver(-13, 'BEHIND OBSERVER', '#83d6ff', 1);
    this.frontBoard = front.board;
    this.backBoard = back.board;
    this.frontBoardMesh = front.board.mesh;
    this.backBoardMesh = back.board.mesh;
    this.frontGlow = front.glow;
    this.backGlow = back.glow;
    this.frontLamp = front.lamp;
    this.backLamp = back.lamp;

    // Absorption/pitch tower in the middle.
    addStationSign(group, 'DOPPLER SPEEDWAY', "f′ = f · c / (c ∓ v)", '#ff9edb', [0, 8.6, -3.4], 5.6);
    group.add(meshBox(0.2, 6.2, 0.2, 0x6f4e82, { position: [-7.4, 3.2, -3.0] }));
    group.add(meshBox(0.2, 6.2, 0.2, 0x6f4e82, { position: [7.4, 3.2, -3.0] }));
    group.add(meshBox(15, 0.2, 0.2, 0x6f4e82, { position: [0, 6.3, -3.0] }));

    this.addLight('#ff82d4', 1.4, 15, [7, 4.6, 2]);
    this.addLight('#79c8ff', 1.2, 15, [-7, 4.6, 2]);
    this.addLight('#bd6dff', 0.9, 14, [0, 2, 2]);

    // Wave ring pool.
    const ringGeometry = new THREE.RingGeometry(0.95, 1, 64);
    for (let i = 0; i < 34; i++) {
      const mesh = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xff9edb,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      group.add(mesh);
      this.rings.push({ mesh, x: 0, age: 0, alive: false });
    }

    // Motion streak lines.
    for (let i = 0; i < 3; i++) {
      const line = makeLine(
        [new THREE.Vector3(-0.8, 0.8 + i * 0.24, -0.8), new THREE.Vector3(-1.8 - i * 0.4, 0.8 + i * 0.24, -0.8)],
        0xffb2df,
        0.25,
      );
      this.speedLines.push(line);
      this.car.add(line);
    }
  }

  private resetRings(): void {
    for (const ring of this.rings) {
      ring.alive = false;
      ring.mesh.visible = false;
      ring.age = 0;
    }
    this.emissionTimer = 0;
  }

  resetSim(): void {
    this.sourceX = -9;
    if (this.car) this.car.position.x = this.sourceX;
    this.resetRings();
    this.boardClock = 0;
    this.updateObserved();
  }

  protected onObservationStart(): void {
    this.resetRings();
    this.params.speed = 20;
    this.updateObserved();
  }

  private updateObserved(): void {
    const f = this.num('frequency');
    const v = this.num('speed');
    this.frontFrequency = f * (SOUND / Math.max(1, SOUND - v));
    this.backFrequency = f * (SOUND / (SOUND + v));
  }

  private emitRing(): void {
    const slot = this.rings.find((ring) => !ring.alive);
    if (!slot) return;
    slot.alive = true;
    slot.age = 0;
    slot.x = this.car.position.x;
    slot.mesh.position.set(slot.x, 0.56, 0);
    slot.mesh.scale.setScalar(0.01);
    slot.mesh.visible = true;
    (slot.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55;
  }

  protected onParamChange(id: string): void {
    if (id === 'speed' || id === 'frequency' || id === 'observer') this.updateObserved();
    if (id === 'speed' && this.challengeArmed) this.resetSim();
  }

  triggerPrimaryAction(): void {
    this.restartSim();
  }

  getPrimaryActionLabel(): string | null {
    return 'RESTART RUN';
  }

  step(dt: number): void {
    if (!this.frontBoard || !this.car) return;
    if (this.observationActive) {
      const targetSpeed = 20 + clamp(this.simTime / 8, 0, 1) * 250;
      const snapped = Math.round(targetSpeed / 5) * 5;
      if (snapped !== this.num('speed')) {
        this.params.speed = snapped;
        this.updateObserved();
      }
    }
    const beta = clamp(this.num('speed') / SOUND, 0, 0.95);
    const vScene = beta * this.cEffective;
    this.sourceX += vScene * dt;
    if (this.sourceX > 10.2) {
      this.sourceX = -10.2;
      this.resetRings();
    }
    this.car.position.x = this.sourceX;
    this.wheelSpin += vScene * dt * 5;
    this.car.rotation.z = Math.sin(this.wheelSpin) * 0.012;

    this.sourceGlow.material.opacity = 0.4 + Math.sin(this.simTime * 18) * 0.15;
    const heading = Math.sin(this.simTime * 1.3) * 0.02;
    this.car.rotation.y = heading;

    this.emissionTimer += dt;
    const interval = 0.29;
    while (this.emissionTimer >= interval) {
      this.emissionTimer -= interval;
      this.emitRing();
    }

    for (const ring of this.rings) {
      if (!ring.alive) continue;
      ring.age += dt;
      const radius = ring.age * this.cEffective;
      ring.mesh.scale.setScalar(Math.max(0.001, radius));
      const fade = clamp(1 - radius / 27, 0, 1);
      (ring.mesh.material as THREE.MeshBasicMaterial).opacity = fade * 0.42;
      if (radius > 27) {
        ring.alive = false;
        ring.mesh.visible = false;
      }
    }

    for (let i = 0; i < this.speedLines.length; i++) {
      const line = this.speedLines[i];
      line.position.x = ((this.simTime * (2 + beta * 10) + i * 0.7) % 3) * -0.6;
      line.visible = beta > 0.08;
      (line.material as THREE.LineBasicMaterial).opacity = 0.12 + beta * 0.5;
    }

    this.frontGlow.material.opacity = 0.14 + beta * 0.5;
    this.backGlow.material.opacity = 0.12 + beta * 0.35;
    (this.frontLamp.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(this.simTime * 9) * 0.12 * beta;
    (this.backLamp.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(this.simTime * 7 + 1.2) * 0.1 * beta;

    this.boardClock += dt;
    if (this.boardClock > 0.16) {
      this.boardClock = 0;
      this.drawBoards();
    }
  }

  private drawBoards(): void {
    const f = this.num('frequency');
    const v = this.num('speed');
    const selected = this.str('observer');
    const front = this.frontFrequency;
    const back = this.backFrequency;
    const draw = (ctx: CanvasRenderingContext2D, w: number, h: number, freq: number, accent: string, label: string, selectedNow: boolean) => {
      this.frontBoard.frame(ctx, accent, label);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f4f8ff';
      ctx.font = '700 58px "Space Grotesk", sans-serif';
      ctx.fillText(`${freq.toFixed(1)} Hz`, 34, 94, w - 70);
      ctx.fillStyle = accent;
      ctx.font = '500 24px "JetBrains Mono", monospace';
      ctx.fillText(selectedNow ? 'LISTENING · SELECTED' : 'STANDBY CHANNEL', 36, 138, w - 70);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(34, 158);
      ctx.lineTo(w - 34, 158);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    this.frontBoard.draw((ctx, w, h) => {
      draw(ctx, w, h, front, '#ff9edb', 'AHEAD OBSERVER', selected === 'ahead');
      const bars = Math.round(clamp((front - f) / 240, 0, 1) * 14);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = i < bars ? '#ff9edb' : 'rgba(255,158,219,0.13)';
        ctx.fillRect(36 + i * 31, 172, 20, 10 + i * 2);
      }
    });
    this.backBoard.draw((ctx, w, h) => {
      draw(ctx, w, h, back, '#83d6ff', 'BEHIND OBSERVER', selected === 'behind');
      const bars = Math.round(clamp((f - back) / 240, 0, 1) * 14);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = i < bars ? '#83d6ff' : 'rgba(131,214,255,0.13)';
        ctx.fillRect(36 + i * 31, 172, 20, 10 + i * 2);
      }
    });
    const shiftAhead = ((front - f) / f) * 100;
    const shiftBehind = ((back - f) / f) * 100;
    this.frontBoardMesh.rotation.y = -0.12;
    this.backBoardMesh.rotation.y = 0.12;
    this.labelCue(`v = ${v.toFixed(0)} m/s · ahead ${front.toFixed(0)} Hz (${shiftAhead > 0 ? '+' : ''}${shiftAhead.toFixed(1)}%) · behind ${back.toFixed(0)} Hz (${shiftBehind.toFixed(1)}%)`);
  }

  isSolved(): boolean {
    const f = this.num('frequency');
    const v = this.num('speed');
    const back = f * (SOUND / (SOUND + v));
    return (
      this.challengeArmed &&
      Math.abs(f - 500) < 5.1 &&
      this.str('observer') === 'behind' &&
      Math.abs(back - 400) < 1.5
    );
  }

  getMetrics(): Readout[] {
    const f = this.num('frequency');
    const v = this.num('speed');
    const ahead = this.frontFrequency;
    const behind = this.backFrequency;
    return [
      { label: 'Siren', value: f.toFixed(0), unit: 'Hz', tone: 'warm' },
      { label: 'Source speed', value: v.toFixed(0), unit: 'm/s' },
      { label: 'Mach fraction', value: (v / SOUND).toFixed(2), unit: 'v/c', tone: v / SOUND > 0.7 ? 'danger' : 'muted' },
      { label: 'Ahead', value: ahead.toFixed(1), unit: 'Hz', tone: this.str('observer') === 'ahead' ? 'accent' : 'cool' },
      { label: 'Behind', value: behind.toFixed(1), unit: 'Hz', tone: this.str('observer') === 'behind' ? 'accent' : 'cool' },
      { label: 'Wavelength ahead', value: ((SOUND - v) / f).toFixed(3), unit: 'm' },
    ];
  }

  getTelemetryTargets(): TelemetryTarget[] {
    const speed = this.num('speed');
    return [
      this.makeTelemetry('doppler-car', this.car, 'Siren car', 1200, () => ({
        position: this.car.position.clone().add(new THREE.Vector3(0, 1.4, 0)),
        velocity: new THREE.Vector3((speed / SOUND) * this.cEffective, 0, 0),
        acceleration: new THREE.Vector3(),
        extra: [
          { label: 'Siren', value: `${this.num('frequency').toFixed(0)} Hz` },
          { label: 'Ahead', value: `${this.frontFrequency.toFixed(1)} Hz` },
          { label: 'Behind', value: `${this.backFrequency.toFixed(1)} Hz` },
        ],
      })),
    ];
  }

  override getVectorProbes(): VectorProbe[] {
    if (!this.car) return [];
    const speed = this.num('speed');
    const beta = speed / SOUND;
    return [
      {
        id: 'doppler-source',
        position: this.car.position.clone().add(new THREE.Vector3(0, 1.4, 0)),
        velocity: new THREE.Vector3(beta * this.cEffective, 0, 0),
        acceleration: new THREE.Vector3(),
        gravity: new THREE.Vector3(0, 0, 0),
        scale: 0.8,
      },
    ];
  }

  override getGraphSample(): GraphSample {
    const f = this.num('frequency');
    const selected = this.str('observer') === 'ahead' ? this.frontFrequency : this.backFrequency;
    return {
      t: this.simTime,
      position: selected,
      velocity: this.num('speed'),
      ke: Math.abs(((selected - f) / f) * 100),
      pe: 0,
      primaryLabel: 'Observed frequency',
      secondaryLabel: this.str('observer') === 'ahead' ? 'Ahead observer' : 'Behind observer',
    };
  }
}

// -----------------------------------------------------------------------------
// 4.3 — Standing-Wave Bridge
// -----------------------------------------------------------------------------

const waveMeta: ExperimentMeta = {
  id: 'standing-wave',
  biome: 'optics',
  number: '4.3',
  title: 'Standing-Wave Bridge',
  shortTitle: 'Resonance Bridge',
  subtitle: 'A bridge that sings at certain frequencies.',
  description:
    'Drive a string stretched across a canyon bridge. Only when the driver matches a harmonic does the whole span bloom into a standing wave with fixed nodes and swinging antinodes.',
  concept:
    'A string fixed at both ends supports standing waves when an integer number of half-wavelengths fits the span: L = nλ/2. The resonant frequencies are f_n = (n/2L)√(T/μ).',
  realWorld:
    'Guitar strings, suspension-bridge oscillations, laser cavities, organ pipes, and microwave resonators all select discrete standing-wave modes.',
  formula: 'v = √(T/μ)     ·     f_n = (n/2L)√(T/μ)',
  formulaNote:
    'T is tension, μ is linear mass density, L is the span, and n = 1, 2, 3… counts the half-wavelengths. Higher harmonics have more nodes and higher pitch.',
  badgeName: 'Resonance Weaver',
  accent: '#f0b7ff',
  accentNumber: 0xf0b7ff,
  badgeGlyph: '〰',
  controls: [
    {
      id: 'string',
      label: 'String material',
      kind: 'select',
      options: [
        { value: 'steel', label: 'Steel · μ = 0.006 kg/m' },
        { value: 'bronze', label: 'Bronze · μ = 0.012 kg/m' },
        { value: 'gut', label: 'Gut · μ = 0.020 kg/m' },
      ],
    },
    { id: 'frequency', label: 'Driver frequency', kind: 'range', min: 20, max: 170, step: 1, unit: 'Hz' },
    { id: 'tension', label: 'String tension T', kind: 'range', min: 200, max: 1200, step: 5, unit: 'N' },
  ],
  defaults: { string: 'steel', frequency: 107, tension: 700 },
  observeParams: { string: 'steel', frequency: 35, tension: 885 },
  observeCues: [
    { at: 0.1, text: 'The driver sweeps upward from 35 Hz. At the fundamental, the entire span bows as one great antinode.' },
    { at: 2.4, text: 'Two fixed ends mean the ends can never move. Those are nodes — places the wave cannot displace.' },
    { at: 4.4, text: 'At twice the fundamental, a node appears in the centre. This is the second harmonic.' },
    { at: 6.4, text: 'At three times the fundamental, two interior nodes divide the span into three vibrating segments.' },
    { at: 8.6, text: 'Resonance is a fit: an integer number of half-wavelengths must span the bridge. Frequency and tension choose which fit is possible.' },
  ],
  challenge: {
    title: 'Third Harmonic at 120 Hz',
    brief:
      'Using the steel string, tune tension and driver frequency so the bridge rings in its third harmonic at exactly 120 Hz.',
    hint:
      'For n = 3, 120 = (3 / 2L)√(T/μ), with L = 4.8 m and μ = 0.006 kg/m. Solve for T — it lands near 885 N.',
    success: 'Three neat segments, two interior nodes, 120 Hz. The bridge and the driver are locked in resonance.',
    targetLabel: 'Steel · n = 3 · f = 120 Hz',
  },
  chart: {
    title: 'Resonance scan',
    positionLabel: 'String amplitude (cm)',
    velocityLabel: 'Wave speed (m/s)',
    energyLabel: 'Standing-wave energy (J)',
  },
};

const STRINGS: Record<string, { label: string; mu: number; color: number }> = {
  steel: { label: 'Steel', mu: 0.006, color: 0xd9f6ff },
  bronze: { label: 'Bronze', mu: 0.012, color: 0xffcf8d },
  gut: { label: 'Gut', mu: 0.02, color: 0xffb6c1 },
};
const PHYSICAL_LENGTH = 4.8;
const SCENE_LENGTH = 10;
const STRING_Y = 2.35;

export class StandingWaveExperiment extends Experiment {
  private stringLine!: THREE.Line;
  private envelopeA!: THREE.Line;
  private envelopeB!: THREE.Line;
  private nodeMarkers: THREE.Mesh[] = [];
  private nodeGlows: THREE.Sprite[] = [];
  private driverPiston!: THREE.Mesh;
  private driverGlow!: THREE.Sprite;
  private detectorLamp!: THREE.Mesh;
  private detectorGlow!: THREE.Sprite;
  private deckPlanks: THREE.Mesh[] = [];
  private deckBase: number[] = [];
  private amplitude = 0.2;
  private phase = 0;
  private harmonic = 1;
  private resonance = 0;
  private pluck = 0;
  private lastBoardDraw = 0;
  private statusBoard!: CanvasBoard;
  private labelSprite!: THREE.Sprite;
  private stringKey = '';

  constructor() {
    super(waveMeta);
  }

  getCameraRig(): { distance?: number; height?: number; targetHeight?: number } {
    return { distance: 14.5, height: 5.6, targetHeight: 2.2 };
  }

  buildVisual(): void {
    const group = this.visualRoot;
    group.add(meshBox(14, 0.36, 6.5, 0x201726, { position: [0, 0.18, 0] }));
    group.add(meshBox(13.4, 0.09, 5.9, 0x382747, { position: [0, 0.41, 0] }));

    // Canyon bridge deck and towers.
    for (const x of [-5.4, 5.4]) {
      group.add(meshBox(1.1, 5.4, 4.4, 0x32233e, { position: [x, 2.7, 0] }));
      group.add(meshBox(1.45, 0.5, 4.9, 0x59426b, { position: [x, 0.7, 0] }));
      for (let i = 0; i < 4; i++) {
        group.add(meshBox(1.2, 0.1, 4.6, 0x6f5481, { position: [x, 1.7 + i * 1.1, 0], opacity: 0.5 }));
      }
      const light = meshBox(0.28, 0.28, 0.28, 0xffcdf7, {
        position: [x, 5.5, 0],
        glow: true,
        opacity: 0.8,
      });
      group.add(light);
      this.addStaticGlow([x, 5.5, 0], '#ffc5f4', 2.2, 0.3);
    }
    for (let i = 0; i < 19; i++) {
      const x = -4.9 + i * 0.545;
      const plank = meshBox(0.48, 0.12, 3.1, i % 2 ? 0x6b4a3a : 0x7b5745, {
        position: [x, 1.02, 0],
        roughness: 0.85,
      });
      group.add(plank);
      this.deckPlanks.push(plank);
      this.deckBase.push(1.02);
    }
    for (const z of [-1.65, 1.65]) {
      group.add(meshBox(10.8, 0.09, 0.09, 0x9c7db0, { position: [0, 1.7, z] }));
      for (let i = 0; i < 10; i++) {
        group.add(meshBox(0.06, 0.72, 0.06, 0x8a6b9e, { position: [-4.9 + i * 1.09, 1.34, z], opacity: 0.65 }));
      }
    }

    // String, envelope, nodes.
    this.stringLine = makeLine(
      Array.from({ length: 101 }, (_, i) => new THREE.Vector3(-SCENE_LENGTH / 2 + (i / 100) * SCENE_LENGTH, STRING_Y, 0)),
      0xffd6fb,
      0.95,
    );
    this.envelopeA = makeLine([], 0xff87e2, 0.26);
    this.envelopeB = makeLine([], 0xff87e2, 0.26);
    group.add(this.envelopeA, this.envelopeB, this.stringLine);
    for (let i = 0; i < 9; i++) {
      const marker = new THREE.Mesh(
        new THREE.TorusGeometry(0.085, 0.022, 5, 14),
        new THREE.MeshBasicMaterial({ color: 0xffa2e8, transparent: true, opacity: 0.8, toneMapped: false }),
      );
      marker.rotation.y = Math.PI / 2;
      group.add(marker);
      this.nodeMarkers.push(marker);
      this.nodeGlows.push(this.addStaticGlow([0, STRING_Y, 0], '#ff9ce1', 0.5, 0.2));
    }

    // Driver at left, fixed anchor at right.
    this.driverPiston = meshBox(1.0, 0.5, 0.5, 0xd8b27b, {
      position: [-5.25, STRING_Y, 0],
      metalness: 0.6,
      roughness: 0.35,
    });
    group.add(this.driverPiston);
    group.add(meshBox(0.7, 2.0, 0.7, 0x4b345a, { position: [-5.95, 2.2, 0] }));
    this.driverGlow = this.addStaticGlow([-5.15, STRING_Y, 0], '#ff9ce1', 1.6, 0.35);
    group.add(meshBox(0.9, 1.05, 0.9, 0x5d416d, { position: [5.55, 2.2, 0] }));
    group.add(meshBox(0.5, 0.5, 0.5, 0xd8b27b, { position: [5.2, STRING_Y, 0], metalness: 0.6, roughness: 0.3 }));
    addStationSign(group, 'DRIVER', 'OSCILLATOR · TENSION SOURCE', '#ff9ce1', [-5.6, 4.4, 1.5], 2.5);

    // Detector at right.
    this.detectorLamp = meshBox(0.3, 0.3, 0.3, 0xffd487, {
      position: [5.3, 4.9, 0],
      glow: true,
      opacity: 0.5,
    });
    group.add(this.detectorLamp);
    this.detectorGlow = this.addStaticGlow([5.3, 4.9, 0], '#ffd487', 1.7, 0.18);

    // Bridge information board.
    this.statusBoard = new CanvasBoard(4.1, 2.35, 600, 344);
    this.statusBoard.mesh.position.set(0, 4.55, 2.15);
    group.add(this.statusBoard.mesh);
    this.labelSprite = makeTextLabel('RESONANCE —', 'MODE 1', '#f0b7ff', { width: 800, height: 260 });
    this.labelSprite.position.set(0, 6.65, 1.5);
    this.labelSprite.scale.set(4.0, 1.3, 1);
    group.add(this.labelSprite);

    addStationSign(group, 'STANDING-WAVE BRIDGE', 'L = n λ / 2', '#f0b7ff', [0, 8.15, -2.6], 5.1);
    this.addLight('#ff8ee0', 1.25, 12, [0, 3, 2.5]);
    this.addLight('#b27bff', 0.8, 12, [-4, 2.5, 1.5]);
    this.addLight('#ffd18b', 0.55, 8, [5, 2.0, 1.5]);

    this.updateWave(0, true);
  }

  private string() {
    return STRINGS[this.str('string')] ?? STRINGS.steel;
  }

  private waveSpeed(): number {
    return Math.sqrt(this.num('tension') / this.string().mu);
  }

  private fundamental(): number {
    return this.waveSpeed() / (2 * PHYSICAL_LENGTH);
  }

  private harmonicFloat(): number {
    return (2 * PHYSICAL_LENGTH * this.num('frequency')) / Math.max(1, this.waveSpeed());
  }

  resetSim(): void {
    this.phase = 0;
    this.pluck = 0;
    this.amplitude = 0.15;
    this.updateWave(0, true);
  }

  protected onParamChange(): void {
    this.phase = 0;
    this.updateWave(0, true);
  }

  triggerPrimaryAction(): void {
    this.pluck = 1;
    this.phase = 0;
    this.labelCue('A sharp pluck sends a broadband pulse down the string. Listen for the modes that survive.');
  }

  getPrimaryActionLabel(): string | null {
    return 'PLUCK THE STRING';
  }

  getPrimaryActionHint(): string {
    return 'Add an impulsive pluck on top of the steady driver.';
  }

  step(dt: number): void {
    if (!this.stringLine) return;
    if (this.observationActive) {
      const target = 35 + clamp(this.simTime / 8.4, 0, 1) * 90;
      const snapped = Math.round(target);
      if (snapped !== this.num('frequency')) {
        this.params.frequency = snapped;
        this.updateWave(0, true);
      }
    }
    this.phase += dt * (4.4 + this.num('frequency') * 0.015);
    this.pluck = Math.max(0, this.pluck - dt * 0.25);
    this.updateWave(dt, false);
  }

  private updateWave(dt: number, force: boolean): void {
    if (!this.stringLine) return;
    const string = this.string();
    const f = this.num('frequency');
    const hFloat = this.harmonicFloat();
    this.harmonic = clamp(Math.round(hFloat), 1, 8);
    const detune = Math.abs(hFloat - this.harmonic);
    this.resonance = 1 / (1 + (detune / 0.045) ** 2);
    const targetAmp = 0.1 + this.resonance * 1.02 + this.pluck * 0.7;
    this.amplitude += (targetAmp - this.amplitude) * (force ? 1 : clamp(dt * 5, 0, 1));

    const key = `${this.str('string')}-${this.harmonic}-${this.num('frequency')}-${this.num('tension')}`;
    if (force || key !== this.stringKey) {
      this.stringKey = key;
      (this.stringLine.material as THREE.LineBasicMaterial).color.setHex(string.color);
      this.drawBoard();
      const label = makeTextLabel(
        `n = ${this.harmonic}   ·   ${f} Hz`,
        this.resonance > 0.72 ? 'STANDING WAVE LOCKED' : `DETUNED · ${(this.resonance * 100).toFixed(0)}% COUPLING`,
        this.resonance > 0.72 ? '#ffd487' : '#f0b7ff',
        { width: 800, height: 260 },
      );
      this.labelSprite.material.map?.dispose();
      this.labelSprite.material.map = label.material.map;
      this.labelSprite.material.needsUpdate = true;
      label.material.dispose();
    }

    const points: THREE.Vector3[] = [];
    const envA: THREE.Vector3[] = [];
    const envB: THREE.Vector3[] = [];
    const samples = 110;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = -SCENE_LENGTH / 2 + t * SCENE_LENGTH;
      const shape = Math.sin(this.harmonic * Math.PI * t);
      const y = STRING_Y + this.amplitude * shape * Math.cos(this.phase);
      points.push(new THREE.Vector3(x, y, 0));
      envA.push(new THREE.Vector3(x, STRING_Y + this.amplitude * shape, 0));
      envB.push(new THREE.Vector3(x, STRING_Y - this.amplitude * shape, 0));
    }
    this.stringLine.geometry.dispose();
    this.stringLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
    this.envelopeA.geometry.dispose();
    this.envelopeA.geometry = new THREE.BufferGeometry().setFromPoints(envA);
    this.envelopeB.geometry.dispose();
    this.envelopeB.geometry = new THREE.BufferGeometry().setFromPoints(envB);

    for (let i = 0; i < this.nodeMarkers.length; i++) {
      const visible = i <= this.harmonic;
      const marker = this.nodeMarkers[i];
      const glow = this.nodeGlows[i];
      marker.visible = visible;
      glow.visible = visible && this.resonance > 0.6;
      if (!visible) continue;
      const t = i / this.harmonic;
      const x = -SCENE_LENGTH / 2 + t * SCENE_LENGTH;
      marker.position.set(x, STRING_Y, 0);
      glow.position.set(x, STRING_Y, 0);
      const s = 0.75 + this.resonance * 0.5;
      marker.scale.setScalar(s);
      (marker.material as THREE.MeshBasicMaterial).opacity = 0.45 + this.resonance * 0.5;
      glow.material.opacity = 0.1 + this.resonance * 0.32;
    }

    for (let i = 0; i < this.deckPlanks.length; i++) {
      const t = i / (this.deckPlanks.length - 1);
      const shape = Math.sin(this.harmonic * Math.PI * t);
      this.deckPlanks[i].position.y = this.deckBase[i] + this.amplitude * 0.08 * shape * Math.cos(this.phase);
    }

    if (this.driverPiston) {
      this.driverPiston.position.x = -5.25 + Math.sin(this.phase) * 0.1 * (0.4 + this.resonance);
      (this.driverPiston.material as THREE.MeshStandardMaterial).emissive.setHex(0xff5abf);
      (this.driverPiston.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.1 + this.resonance * 0.7;
    }
    this.driverGlow.material.opacity = 0.15 + this.resonance * 0.45;
    this.driverGlow.scale.setScalar(1.2 + this.resonance * 1.3);
    (this.detectorLamp.material as THREE.MeshBasicMaterial).opacity = 0.35 + this.resonance * 0.65;
    this.detectorLamp.scale.setScalar(1 + this.resonance * 0.7);
    this.detectorGlow.material.opacity = 0.08 + this.resonance * 0.5;
    this.detectorGlow.scale.setScalar(1.3 + this.resonance * 2.0);
    (this.stringLine.material as THREE.LineBasicMaterial).opacity = 0.6 + this.resonance * 0.4;

    this.lastBoardDraw += dt;
    if (this.lastBoardDraw > 0.15) {
      this.lastBoardDraw = 0;
      this.drawBoard();
    }
  }

  private drawBoard(): void {
    if (!this.statusBoard) return;
    const string = this.string();
    const v = this.waveSpeed();
    const f1 = this.fundamental();
    const f = this.num('frequency');
    const ampCm = this.amplitude * 14;
    this.statusBoard.draw((ctx, w, h) => {
      this.statusBoard.frame(ctx, '#f0b7ff', 'BRIDGE RESONANCE ANALYSER');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f4f8ff';
      ctx.font = '600 28px "JetBrains Mono", monospace';
      ctx.fillText(`MODE n = ${this.harmonic}`, 36, 72);
      ctx.fillStyle = '#ffd487';
      ctx.font = '700 44px "Space Grotesk", sans-serif';
      ctx.fillText(`${f} Hz`, 36, 126);
      ctx.fillStyle = '#cbb6dd';
      ctx.font = '500 22px "JetBrains Mono", monospace';
      ctx.fillText(`amp ${ampCm.toFixed(1)} cm`, 36, 168);
      ctx.fillText(`v ${v.toFixed(1)} m/s`, 250, 168);
      ctx.fillText(`f₁ ${f1.toFixed(1)} Hz`, 250, 72);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(36, 200, w - 72, 18);
      ctx.fillStyle = this.resonance > 0.72 ? '#ffd487' : '#f0b7ff';
      ctx.fillRect(36, 200, (w - 72) * this.resonance, 18);
      ctx.fillStyle = '#e6d9f1';
      ctx.font = '500 20px "JetBrains Mono", monospace';
      ctx.fillText(`${string.label.toUpperCase()} · μ ${string.mu.toFixed(3)} kg/m · T ${this.num('tension').toFixed(0)} N`, 36, 252);
      ctx.fillStyle = this.resonance > 0.72 ? '#ffd487' : '#9d8bac';
      ctx.fillText(this.resonance > 0.72 ? 'STANDING WAVE LOCKED' : `COUPLING ${(this.resonance * 100).toFixed(0)}%`, 36, 288);
    });
  }

  isSolved(): boolean {
    if (this.str('string') !== 'steel') return false;
    const f = this.num('frequency');
    const f3 = 3 * this.fundamental();
    const hFloat = this.harmonicFloat();
    return (
      Math.abs(f - 120) < 0.8 &&
      Math.abs(f3 - 120) < 0.85 &&
      Math.abs(hFloat - 3) < 0.06 &&
      this.resonance > 0.6
    );
  }

  getMetrics(): Readout[] {
    const string = this.string();
    const f = this.num('frequency');
    const hFloat = this.harmonicFloat();
    const f1 = this.fundamental();
    const f3 = 3 * f1;
    return [
      { label: 'String', value: string.label, unit: `μ ${string.mu.toFixed(3)}`, tone: 'warm' },
      { label: 'Tension', value: this.num('tension').toFixed(0), unit: 'N' },
      { label: 'Wave speed', value: this.waveSpeed().toFixed(1), unit: 'm/s', tone: 'cool' },
      { label: 'Fundamental', value: f1.toFixed(1), unit: 'Hz' },
      { label: 'Nearest mode', value: `n = ${this.harmonic}`, unit: `${(this.resonance * 100).toFixed(0)}% coupling`, tone: this.resonance > 0.6 ? 'accent' : 'muted' },
      { label: 'Third harmonic', value: f3.toFixed(1), unit: 'Hz', tone: Math.abs(f3 - 120) < 0.9 ? 'accent' : 'muted' },
      { label: 'Amplitude', value: (this.amplitude * 14).toFixed(1), unit: 'cm', tone: 'warm' },
    ];
  }

  getTelemetryTargets(): TelemetryTarget[] {
    return [
      this.makeTelemetry('wave-antinode', this.driverPiston, 'Antinode probe', 0.03, () => {
        const x = this.nodeMarkers[1]?.position.x ?? 0;
        return {
          position: new THREE.Vector3(x, STRING_Y + this.amplitude * Math.cos(this.phase), 0),
          velocity: new THREE.Vector3(0, -this.amplitude * Math.sin(this.phase) * 2, 0),
          acceleration: new THREE.Vector3(0, -this.amplitude * Math.cos(this.phase) * 4, 0),
          potentialReference: STRING_Y,
          extra: [
            { label: 'Mode', value: `n = ${this.harmonic}` },
            { label: 'Coupling', value: `${(this.resonance * 100).toFixed(0)}%` },
          ],
        };
      }),
    ];
  }

  override getGraphSample(): GraphSample {
    const f = this.num('frequency');
    const v = this.waveSpeed();
    const mass = this.string().mu * PHYSICAL_LENGTH;
    return {
      t: this.simTime,
      position: this.amplitude * 100,
      velocity: v,
      ke: 0.5 * mass * v * v,
      pe: 0.5 * this.num('tension') * (this.amplitude * 0.22) ** 2,
      primaryLabel: `n = ${this.harmonic} amplitude`,
      secondaryLabel: `${f} Hz driver`,
    };
  }
}
