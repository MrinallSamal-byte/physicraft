import * as THREE from 'three';
import {
  BIOMES,
  BIOME_BY_ID,
  STATION_LAYOUT,
  WORLD,
  type BiomeDefinition,
  type BiomeId,
  type EnvironmentState,
} from '../config';
import { makeRadialGlowTexture } from '../core/utils';
import { addCircleDisc, addGlowSprite, addWireRing } from '../world/voxel';
import { makeTextLabel } from '../world/labels';
import type { Experiment } from './BaseExperiment';
import { CollisionExperiment, PendulumExperiment, ProjectileExperiment, VacuumDropExperiment } from './experiments/classical';
import { BernoulliExperiment, BuoyancyExperiment, GasPistonExperiment } from './experiments/thermo';
import { FaradayExperiment, LorentzExperiment, OhmExperiment } from './experiments/electro';
import { DopplerExperiment, SnellExperiment, StandingWaveExperiment } from './experiments/optics';
import { SpacetimeExperiment, TwinParadoxExperiment } from './experiments/relativity';
import { DoubleSlitExperiment, PhotoelectricExperiment } from './experiments/quantum';

interface StationBlueprint {
  id: string;
  biome: BiomeId;
  create: () => Experiment;
}

const BLUEPRINTS: StationBlueprint[] = [
  { id: 'vacuum-drop', biome: 'classical', create: () => new VacuumDropExperiment() },
  { id: 'projectile', biome: 'classical', create: () => new ProjectileExperiment() },
  { id: 'collision', biome: 'classical', create: () => new CollisionExperiment() },
  { id: 'pendulum', biome: 'classical', create: () => new PendulumExperiment() },
  { id: 'buoyancy', biome: 'thermo', create: () => new BuoyancyExperiment() },
  { id: 'gas-piston', biome: 'thermo', create: () => new GasPistonExperiment() },
  { id: 'bernoulli', biome: 'thermo', create: () => new BernoulliExperiment() },
  { id: 'ohm', biome: 'electro', create: () => new OhmExperiment() },
  { id: 'faraday', biome: 'electro', create: () => new FaradayExperiment() },
  { id: 'lorentz', biome: 'electro', create: () => new LorentzExperiment() },
  { id: 'snell', biome: 'optics', create: () => new SnellExperiment() },
  { id: 'doppler', biome: 'optics', create: () => new DopplerExperiment() },
  { id: 'standing-wave', biome: 'optics', create: () => new StandingWaveExperiment() },
  { id: 'spacetime', biome: 'relativity', create: () => new SpacetimeExperiment() },
  { id: 'twin-paradox', biome: 'relativity', create: () => new TwinParadoxExperiment() },
  { id: 'double-slit', biome: 'quantum', create: () => new DoubleSlitExperiment() },
  { id: 'photoelectric', biome: 'quantum', create: () => new PhotoelectricExperiment() },
];

export interface Station {
  id: string;
  experiment: Experiment;
  biome: BiomeDefinition;
  worldPosition: THREE.Vector3;
  yaw: number;
  marker: THREE.Sprite;
  markerGlow: THREE.Sprite;
  markerBaseY: number;
  accent: string;
  lights: THREE.PointLight[];
  solved: boolean;
}

export interface StationSaveState {
  badges: Record<string, number>;
}

const MARKER_Y = 12.2;

function makeStationLabel(station: Pick<Station, 'experiment' | 'solved'>): THREE.Sprite {
  const { experiment } = station;
  const status = station.solved ? '◆ DISCOVERY BADGE CLAIMED' : 'PRESS E · INSPECT APPARATUS';
  const sprite = makeTextLabel(
    `${experiment.meta.number} · ${experiment.meta.shortTitle}`,
    status,
    station.solved ? '#ffe4a3' : experiment.meta.accent,
    { width: 1100, height: 300 },
  );
  sprite.scale.set(5.1, 1.39, 1);
  return sprite;
}

/**
 * Instantiates every experiment, anchors it on its biome court and exposes
 * proximity/lighting/save-state helpers. Each apparatus is authored in local
 * coordinates with its "front" toward +Z, then rotated to face the Hall of
 * Constants so the player always approaches the readable side.
 */
const STATION_COLLIDER_CONFIGS: Record<string, { size: [number, number, number]; offsetY: number }> = {
  'photoelectric': { size: [11.0, 3.8, 5.5], offsetY: 1.8 },
  'double-slit': { size: [7.5, 3.2, 5.0], offsetY: 1.5 },
  'vacuum-drop': { size: [4.2, 9.5, 4.2], offsetY: 4.6 },
  'pendulum': { size: [4.8, 7.5, 4.8], offsetY: 3.5 },
  'collision': { size: [8.5, 2.8, 4.0], offsetY: 1.4 },
  'bernoulli': { size: [8.5, 2.8, 4.0], offsetY: 1.4 },
  'spacetime': { size: [7.0, 3.0, 7.0], offsetY: 1.5 },
  'twin-paradox': { size: [7.0, 3.0, 7.0], offsetY: 1.5 },
  'projectile': { size: [6.0, 3.0, 4.5], offsetY: 1.4 },
  'buoyancy': { size: [5.0, 3.2, 5.0], offsetY: 1.5 },
  'gas-piston': { size: [4.8, 4.5, 4.8], offsetY: 2.0 },
  'ohm': { size: [5.2, 2.8, 4.5], offsetY: 1.4 },
  'faraday': { size: [5.5, 3.0, 5.0], offsetY: 1.4 },
  'lorentz': { size: [6.0, 3.2, 5.0], offsetY: 1.5 },
  'snell': { size: [5.2, 2.8, 4.5], offsetY: 1.4 },
  'doppler': { size: [6.5, 3.0, 4.5], offsetY: 1.4 },
  'standing-wave': { size: [7.5, 3.0, 4.0], offsetY: 1.4 },
};

export class StationRegistry {
  readonly group = new THREE.Group();
  readonly stations: Station[] = [];
  private readonly byId = new Map<string, Station>();
  private readonly glowTexture = makeRadialGlowTexture();
  private labelRefreshTimer = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly env: EnvironmentState,
  ) {
    this.group.name = 'StationRegistry';
    scene.add(this.group);

    for (const blueprint of BLUEPRINTS) {
      const experiment = blueprint.create();
      const biome = BIOME_BY_ID[blueprint.biome];
      const layout = STATION_LAYOUT[blueprint.id] ?? { offset: [0, 0], focusDistance: 12, focusHeight: 5 };
      const worldPosition = new THREE.Vector3(
        biome.center.x + layout.offset[0],
        0.06,
        biome.center.y + layout.offset[1],
      );
      const inward = new THREE.Vector3(-biome.center.x, 0, -biome.center.y).normalize();
      const yaw = Math.atan2(inward.x, inward.z);

      experiment.root.position.copy(worldPosition);
      experiment.root.rotation.y = yaw;
      experiment.initialize(this.env);

      const marker = makeStationLabel({ experiment, solved: false });
      marker.position.set(0, MARKER_Y, 0);
      marker.renderOrder = 3;
      marker.userData.baseY = MARKER_Y;
      experiment.root.add(marker);

      const markerGlow = addGlowSprite(
        experiment.root,
        this.glowTexture,
        [0, MARKER_Y, -0.2],
        4.4,
        experiment.meta.accent,
        0.16,
      );
      markerGlow.material.depthWrite = false;

      // A low, thin court ring makes every station legible from a distance
      // without boxing the apparatus in.
      const ring = addWireRing(experiment.visualRoot, 6.1, experiment.meta.accentNumber, [0, 0.19, 0], [-Math.PI / 2, 0, 0], 0.26);
      ring.name = `station-ring-${blueprint.id}`;
      const disc = addCircleDisc(experiment.visualRoot, 6.0, experiment.meta.accentNumber, [0, 0.175, 0], 0.035);
      disc.name = `station-disc-${blueprint.id}`;

      const lights: THREE.PointLight[] = [];
      experiment.root.traverse((object) => {
        if (object instanceof THREE.PointLight) lights.push(object);
        if (object instanceof THREE.Mesh) {
          object.receiveShadow = true;
          object.castShadow = true;
        }
      });

      this.group.add(experiment.root);

      const station: Station = {
        id: blueprint.id,
        experiment,
        biome,
        worldPosition,
        yaw,
        marker,
        markerGlow,
        markerBaseY: MARKER_Y,
        accent: experiment.meta.accent,
        lights,
        solved: false,
      };
      this.stations.push(station);
      this.byId.set(station.id, station);
    }
  }

  addCollidersToWorld(world: { addCollider(center: THREE.Vector3, size: THREE.Vector3): THREE.Box3 }): void {
    for (const station of this.stations) {
      const cfg = STATION_COLLIDER_CONFIGS[station.id] ?? { size: [4.6, 3.2, 4.6], offsetY: 1.5 };
      world.addCollider(
        new THREE.Vector3(station.worldPosition.x, cfg.offsetY, station.worldPosition.z),
        new THREE.Vector3(cfg.size[0], cfg.size[1], cfg.size[2]),
      );
    }
  }

  loadBadges(badges: Record<string, number>): void {
    for (const station of this.stations) {
      if (!badges[station.id]) continue;
      station.solved = true;
      station.experiment.solved = true;
      this.refreshMarker(station);
    }
  }

  markSolved(id: string): void {
    const station = this.byId.get(id);
    if (!station || station.solved) return;
    station.solved = true;
    station.experiment.solved = true;
    station.experiment.challengeArmed = false;
    this.refreshMarker(station);
  }

  private refreshMarker(station: Station): void {
    const previous = station.marker;
    const next = makeStationLabel(station);
    next.position.copy(previous.position);
    next.renderOrder = 3;
    next.userData.baseY = MARKER_Y;
    previous.removeFromParent();
    station.experiment.root.add(next);
    const oldMaterial = previous.material as THREE.SpriteMaterial;
    oldMaterial.map?.dispose();
    oldMaterial.dispose();
    station.marker = next;
    if (station.solved) {
      station.markerGlow.material.color.set('#ffe0a0');
      station.markerGlow.material.opacity = 0.33;
    }
  }

  getById(id: string): Station | undefined {
    return this.byId.get(id);
  }

  getNearest(position: THREE.Vector3, maxDistance = Infinity): { station: Station; distance: number } | null {
    let nearest: Station | null = null;
    let best = maxDistance;
    for (const station of this.stations) {
      const distance = Math.hypot(position.x - station.worldPosition.x, position.z - station.worldPosition.z);
      if (distance < best) {
        best = distance;
        nearest = station;
      }
    }
    return nearest ? { station: nearest, distance: best } : null;
  }

  getStationForObject(object: THREE.Object3D): Station | null {
    let node: THREE.Object3D | null = object;
    while (node) {
      if (node.parent === this.group && node.name.startsWith('experiment-')) {
        return this.byId.get(node.name.replace('experiment-', '')) ?? null;
      }
      node = node.parent;
    }
    return null;
  }

  getTravelPose(station: Station): { position: THREE.Vector3; yaw: number } {
    const local = new THREE.Vector3(0, 0, 10.5);
    const position = station.experiment.root.localToWorld(local);
    const radial = Math.hypot(position.x, position.z);
    const limit = WORLD.radius - 9;
    if (radial > limit) {
      position.multiplyScalar(limit / radial);
    }
    position.y = 0;
    return { position, yaw: station.yaw };
  }

  getProgress(): { solved: number; total: number } {
    return { solved: this.stations.filter((s) => s.solved).length, total: this.stations.length };
  }

  getBiomeProgress(biome: BiomeDefinition): { solved: number; total: number } {
    const all = this.stations.filter((s) => s.biome.id === biome.id);
    return { solved: all.filter((s) => s.solved).length, total: all.length };
  }

  update(dt: number, elapsed: number, playerPosition: THREE.Vector3, focusedId: string | null, lightTimer: number): void {
    this.labelRefreshTimer += dt;
    for (const station of this.stations) {
      const distance = Math.hypot(
        playerPosition.x - station.worldPosition.x,
        playerPosition.z - station.worldPosition.z,
      );
      const focused = station.id === focusedId;
      station.marker.visible = !focused && distance < 54;
      station.markerGlow.visible = station.marker.visible;
      if (focused) continue;
      station.marker.position.y = station.markerBaseY + Math.sin(elapsed * 0.8 + station.worldPosition.x * 0.05) * 0.09;
      const material = station.marker.material as THREE.SpriteMaterial;
      material.opacity = distance < 26 ? 0.55 : 0.88;
      station.markerGlow.material.opacity = station.solved ? 0.3 : 0.14;
    }
    if (lightTimer <= 0) return;
    for (const station of this.stations) {
      const distance = Math.hypot(
        playerPosition.x - station.worldPosition.x,
        playerPosition.z - station.worldPosition.z,
      );
      const enabled = station.id === focusedId || distance < 34;
      for (const light of station.lights) light.visible = enabled;
    }
    this.labelRefreshTimer = 0;
  }
}
