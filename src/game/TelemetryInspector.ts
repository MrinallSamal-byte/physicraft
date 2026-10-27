import * as THREE from 'three';
import type { EnvironmentState } from '../config';
import type { Experiment } from '../stations/BaseExperiment';
import type { Station } from '../stations/registry';
import type { TelemetryTarget } from '../stations/types';

export interface WandReading {
  stationId: string;
  label: string;
  mass: number;
  speed: number;
  acceleration: number;
  kinetic: number;
  potential: number;
  momentum: number;
  position: THREE.Vector3;
  extra: Array<{ label: string; value: string }>;
}

/**
 * Raycasts from the crosshair into the nearest apparatus and turns any
 * telemetry-tagged group into a live instrument readout. A box helper gives
 * the object being measured a clear, temporary outline in the world.
 */
export class TelemetryInspector {
  private raycaster = new THREE.Raycaster();
  private box = new THREE.BoxHelper(new THREE.Object3D(), 0x7ef9ff);
  private marker = new THREE.Object3D();
  private targetObject: THREE.Object3D | null = null;
  private timer = 0;
  private active = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    this.box.visible = false;
    this.box.material.depthTest = false;
    this.box.material.transparent = true;
    this.box.material.opacity = 0.85;
    this.scene.add(this.box);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.016, 6, 28),
      new THREE.MeshBasicMaterial({ color: 0x9bf7ff, toneMapped: false, transparent: true, opacity: 0.8 }),
    );
    ring.rotation.x = Math.PI / 2;
    this.marker.add(ring);
    this.marker.visible = false;
    this.scene.add(this.marker);
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.box.visible = false;
      this.marker.visible = false;
      this.targetObject = null;
    }
    this.timer = 0;
  }

  get isActive(): boolean {
    return this.active;
  }

  update(
    dt: number,
    station: Station | null,
    experiment: Experiment | null,
    env: EnvironmentState,
  ): WandReading | null {
    if (!this.active || !station || !experiment) {
      this.box.visible = false;
      this.marker.visible = false;
      return null;
    }
    this.timer += dt;
    if (this.timer < 0.06) return this.buildReading(experiment, env);
    this.timer = 0;

    const targets = experiment.getTelemetryTargets();
    if (targets.length === 0) {
      this.box.visible = false;
      this.marker.visible = false;
      return null;
    }

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 70;
    let picked: TelemetryTarget | null = null;
    const hits = this.raycaster.intersectObject(experiment.root, true);
    for (const hit of hits) {
      if (!hit.object.visible) continue;
      picked = experiment.getTelemetryByObject(hit.object);
      if (picked) break;
    }

    if (!picked) {
      const ray = this.raycaster.ray;
      let bestScore = 0.62;
      const candidate = new THREE.Vector3();
      for (const target of targets) {
        target.object.getWorldPosition(candidate);
        const toTarget = candidate.clone().sub(ray.origin);
        const along = toTarget.dot(ray.direction);
        if (along < 0.5 || along > 35) continue;
        const perpendicular = toTarget.sub(ray.direction.clone().multiplyScalar(along)).length();
        const score = perpendicular / Math.max(1, along);
        if (score < bestScore) {
          bestScore = score;
          picked = target;
        }
      }
    }

    if (!picked) {
      this.box.visible = false;
      this.marker.visible = false;
      this.targetObject = null;
      return null;
    }

    this.targetObject = picked.object;
    this.box.setFromObject(picked.object);
    this.box.visible = true;
    const world = new THREE.Vector3();
    picked.object.getWorldPosition(world);
    this.marker.position.copy(world);
    this.marker.visible = true;
    this.marker.rotation.y += dt * 1.5;

    return this.buildReading(experiment, env, picked);
  }

  private buildReading(experiment: Experiment, env: EnvironmentState, specific?: TelemetryTarget): WandReading | null {
    const target = specific ?? experiment.getTelemetryTargets().find((t) => t.object === this.targetObject);
    if (!target) return null;
    const state = target.getState();
    const mass = state.mass ?? target.mass;
    const speed = state.velocity.length();
    const acceleration = state.acceleration?.length() ?? 0;
    const ref = state.potentialReference ?? 0;
    const height = Math.max(0, state.position.y - ref);
    const kinetic = 0.5 * mass * speed * speed;
    const potential = mass * env.gravity * height;
    return {
      stationId: experiment.meta.id,
      label: target.label,
      mass,
      speed,
      acceleration,
      kinetic,
      potential,
      momentum: mass * speed,
      position: state.position.clone(),
      extra: state.extra ?? [],
    };
  }

  dispose(): void {
    this.box.removeFromParent();
    this.marker.removeFromParent();
  }
}
