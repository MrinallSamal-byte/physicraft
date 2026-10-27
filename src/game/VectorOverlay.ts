import * as THREE from 'three';
import type { EnvironmentState } from '../config';
import type { Experiment } from '../stations/BaseExperiment';
import type { VectorProbe } from '../stations/types';

export const VECTOR_COLORS = {
  velocity: '#22c55e',      // Green for Velocity (v)
  acceleration: '#3b82f6',  // Blue for Acceleration (a)
  normal: '#eab308',        // Yellow for Normal Force (N)
  friction: '#ef4444',      // Red for Friction/Drag (f)
  gravity: '#a855f7',       // Purple for Gravity (Fg)
} as const;

interface ArrowSpec {
  vector: THREE.Vector3 | undefined;
  color: string;
  scale: number;
  label: string;
}

/**
 * Renders velocity, acceleration, gravity, normal and friction arrows in the
 * local frame of the nearest apparatus. Living under the experiment root means
 * all three vector components stay correctly registered as the world rotates.
 */
export class VectorOverlay {
  readonly group = new THREE.Group();
  enabled = false;
  private attachedTo: THREE.Object3D | null = null;
  private timer = 0;
  private probeCount = 0;

  constructor() {
    this.group.name = 'vector-vision-overlay';
    this.group.renderOrder = 5;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.group.visible = enabled;
    if (!enabled) this.clear();
    this.timer = 0;
  }

  setStationRoot(root: THREE.Object3D | null): void {
    if (root === this.attachedTo) return;
    this.clear();
    this.attachedTo = root;
    if (root) root.add(this.group);
  }

  get activeCount(): number {
    return this.probeCount;
  }

  update(dt: number, experiment: Experiment | null, env: EnvironmentState): void {
    if (!this.enabled || !experiment) {
      this.clear();
      return;
    }
    this.timer += dt;
    if (this.timer < 0.07) return;
    this.timer = 0;
    const probes = experiment.getVectorProbes(env);
    this.rebuild(probes);
  }

  private rebuild(probes: VectorProbe[]): void {
    this.clear(true);
    this.probeCount = probes.length;
    for (const probe of probes) {
      const scale = probe.scale ?? 1;
      const specs: ArrowSpec[] = [
        { vector: probe.velocity, color: VECTOR_COLORS.velocity, scale: 0.26 * scale, label: 'v' },
        { vector: probe.acceleration, color: VECTOR_COLORS.acceleration, scale: 0.22 * scale, label: 'a' },
        { vector: probe.gravity, color: VECTOR_COLORS.gravity, scale: 0.17 * scale, label: 'g' },
        { vector: probe.normal, color: VECTOR_COLORS.normal, scale: 0.24 * scale, label: 'N' },
        { vector: probe.friction, color: VECTOR_COLORS.friction, scale: 0.26 * scale, label: 'f' },
      ];
      for (const spec of specs) {
        if (!spec.vector) continue;
        const magnitude = spec.vector.length();
        if (!Number.isFinite(magnitude) || magnitude < 0.03) continue;
        const length = THREE.MathUtils.clamp(magnitude * spec.scale, 0.34, 3.8);
        const direction = spec.vector.clone().normalize();
        const arrow = new THREE.ArrowHelper(
          direction,
          probe.position.clone(),
          length,
          new THREE.Color(spec.color),
          Math.min(0.34, length * 0.27),
          Math.min(0.18, length * 0.14),
        );
        const lineMaterial = arrow.line.material as THREE.LineBasicMaterial;
        lineMaterial.transparent = true;
        lineMaterial.opacity = 0.92;
        lineMaterial.depthWrite = false;
        lineMaterial.toneMapped = false;
        const coneMaterial = arrow.cone.material as THREE.MeshBasicMaterial;
        coneMaterial.transparent = true;
        coneMaterial.opacity = 0.95;
        coneMaterial.depthWrite = false;
        coneMaterial.toneMapped = false;
        arrow.renderOrder = 6;
        this.group.add(arrow);
      }
      const origin = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 8, 6),
        new THREE.MeshBasicMaterial({
          color: '#f2fbff',
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      origin.position.copy(probe.position);
      this.group.add(origin);
    }
    this.group.visible = this.enabled;
  }

  private clear(dispose = true): void {
    for (const child of [...this.group.children]) {
      child.removeFromParent();
      if (!dispose) continue;
      child.traverse((node) => {
        if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
          node.geometry?.dispose();
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          for (const material of materials) material?.dispose();
        }
      });
    }
    this.probeCount = 0;
  }
}
