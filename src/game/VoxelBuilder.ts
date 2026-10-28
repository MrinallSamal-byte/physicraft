/**
 * Voxel Building & Mining System
 * Handles crosshair raycasting, 3D wireframe voxel selection, block placement,
 * block destruction with burst debris particles, dynamic colliders,
 * and TNT physics detonation.
 */

import * as THREE from 'three';
import { WORLD } from '../config';
import {
  type VoxelBlockType,
  VOXEL_BLOCKS,
  textureRegistry,
} from '../world/textures';
import { sound } from '../audio/SoundEngine';
import { isVisibleInHierarchy } from '../core/utils';

interface PlacedBlock {
  key: string;
  type: VoxelBlockType;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  collider: THREE.Box3;
  light?: THREE.PointLight;
}

interface VoxelParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotationSpeed: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface PrimedTnt {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  timer: number;
  maxTimer: number;
  originalScale: THREE.Vector3;
}

export class VoxelBuilder {
  readonly group = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private selectionBox: THREE.LineSegments;
  private targetCoords: THREE.Vector3 | null = null;
  private placeCoords: THREE.Vector3 | null = null;
  private targetFaceNormal: THREE.Vector3 | null = null;
  private placedBlocks = new Map<string, PlacedBlock>();
  private activeBlockType: VoxelBlockType = 'grass';
  private particles: VoxelParticle[] = [];
  private primedTntList: PrimedTnt[] = [];
  private reachDistance = 12.0;
  private enabled = true;
  private playerCollidersRef: THREE.Box3[] | null = null;
  private onBlockChanged: (() => void) | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    this.group.name = 'VoxelBuilder';
    scene.add(this.group);

    // 3D wireframe voxel bounding box cursor
    const boxGeo = new THREE.BoxGeometry(1.005, 1.005, 1.005);
    const edges = new THREE.EdgesGeometry(boxGeo);
    this.selectionBox = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: 0x000000,
        linewidth: 2,
        transparent: true,
        opacity: 0.65,
        depthTest: true,
      }),
    );
    this.selectionBox.visible = false;
    scene.add(this.selectionBox);
  }

  setCollidersRef(colliders: THREE.Box3[]): void {
    this.playerCollidersRef = colliders;
  }

  setOnBlockChanged(callback: () => void): void {
    this.onBlockChanged = callback;
  }

  getSelectedBlockType(): VoxelBlockType {
    return this.activeBlockType;
  }

  setSelectedBlockType(type: VoxelBlockType): void {
    if (this.activeBlockType !== type) {
      this.activeBlockType = type;
      sound.playToolSwitch();
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.selectionBox.visible = false;
    }
  }

  /**
   * Finds placed block near given coordinates
   */
  getBlockAt(pos: THREE.Vector3): PlacedBlock | undefined {
    const key = `${pos.x},${pos.y},${pos.z}`;
    const direct = this.placedBlocks.get(key);
    if (direct) return direct;
    for (const block of this.placedBlocks.values()) {
      if (block.position.distanceTo(pos) < 0.25) return block;
    }
    return undefined;
  }

  /**
   * Updates raycast targeting from crosshair
   */
  updateTargeting(worldMeshes: THREE.Object3D[]): void {
    if (!this.enabled) {
      this.clearTargeting();
      return;
    }

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = this.reachDistance;

    const targets: THREE.Object3D[] = [...this.group.children, ...worldMeshes];
    const hits = this.raycaster.intersectObjects(targets, true);

    const hit = hits.find(
      (h) =>
        h.object !== this.selectionBox &&
        !h.object.name.includes('particle') &&
        isVisibleInHierarchy(h.object),
    );

    if (hit && hit.face && hit.point) {
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      this.targetFaceNormal = normal.clone();

      // Strictly snap to the dominant cardinal face normal
      const absX = Math.abs(normal.x);
      const absY = Math.abs(normal.y);
      const absZ = Math.abs(normal.z);
      let nx = 0, ny = 0, nz = 0;
      if (absX >= absY && absX >= absZ) {
        nx = normal.x >= 0 ? 1 : -1;
      } else if (absY >= absX && absY >= absZ) {
        ny = normal.y >= 0 ? 1 : -1;
      } else {
        nz = normal.z >= 0 ? 1 : -1;
      }

      // Check if we hit an already placed block
      const voxelKey = hit.object.userData?.voxelKey;
      const hitPlaced = voxelKey ? this.placedBlocks.get(voxelKey) : undefined;

      if (hitPlaced) {
        this.targetCoords = hitPlaced.position.clone();
        this.placeCoords = hitPlaced.position.clone().add(new THREE.Vector3(nx, ny, nz));
        this.selectionBox.position.copy(hitPlaced.position);
      } else {
        // Natural world terrain or apparatus surface
        const hitCenter = hit.point.clone().sub(normal.clone().multiplyScalar(0.02));
        const bx = Math.floor(hitCenter.x + 0.5);
        const bz = Math.floor(hitCenter.z + 0.5);
        let by = 0.5;
        if (Math.abs(normal.y) > 0.6) {
          by = normal.y > 0 ? Math.floor(hit.point.y) + 0.5 : Math.floor(hit.point.y) - 0.5;
        } else {
          by = Math.floor(hitCenter.y) + 0.5;
        }

        this.targetCoords = new THREE.Vector3(bx, by, bz);
        this.placeCoords = new THREE.Vector3(bx + nx, by + ny, bz + nz);
        this.selectionBox.position.copy(this.placeCoords);
      }

      // Disallow placement (only) if placement overlaps solid world colliders
      if (this.placeCoords && this.playerCollidersRef) {
        const testBlockBox = new THREE.Box3(
          new THREE.Vector3(this.placeCoords.x - 0.49, this.placeCoords.y - 0.49, this.placeCoords.z - 0.49),
          new THREE.Vector3(this.placeCoords.x + 0.49, this.placeCoords.y + 0.49, this.placeCoords.z + 0.49),
        );
        for (const col of this.playerCollidersRef) {
          if (col.intersectsBox(testBlockBox)) {
            this.placeCoords = null;
            break;
          }
        }
      }

      this.selectionBox.visible = true;
      return;
    }

    // Ground plane fallback (raycasting against floor plane y = 0)
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const groundHit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(groundPlane, groundHit)) {
      const dist = this.camera.position.distanceTo(groundHit);
      const islandDist = Math.hypot(groundHit.x, groundHit.z);
      if (dist <= this.reachDistance && islandDist <= WORLD.radius) {
        const bx = Math.floor(groundHit.x + 0.5);
        const bz = Math.floor(groundHit.z + 0.5);
        const by = 0.5; // flush with bedrock floor y=0

        this.placeCoords = new THREE.Vector3(bx, by, bz);
        this.targetCoords = new THREE.Vector3(bx, -0.5, bz);
        this.targetFaceNormal = new THREE.Vector3(0, 1, 0);

        if (this.playerCollidersRef) {
          const testBlockBox = new THREE.Box3(
            new THREE.Vector3(bx - 0.49, by - 0.49, bz - 0.49),
            new THREE.Vector3(bx + 0.49, by + 0.49, bz + 0.49),
          );
          for (const col of this.playerCollidersRef) {
            if (col.intersectsBox(testBlockBox)) {
              this.placeCoords = null;
              break;
            }
          }
        }

        this.selectionBox.position.set(bx, by, bz);
        this.selectionBox.visible = true;
        return;
      }
    }

    this.clearTargeting();
  }

  clearTargeting(): void {
    this.selectionBox.visible = false;
    this.targetCoords = null;
    this.placeCoords = null;
    this.targetFaceNormal = null;
  }

  getTargetingInfo(): { target: THREE.Vector3 | null; place: THREE.Vector3 | null; faceNormal: THREE.Vector3 | null } {
    return {
      target: this.targetCoords ? this.targetCoords.clone() : null,
      place: this.placeCoords ? this.placeCoords.clone() : null,
      faceNormal: this.targetFaceNormal ? this.targetFaceNormal.clone() : null,
    };
  }

  /**
   * Places a block at the current placeCoords
   */
  placeBlock(playerPosition?: THREE.Vector3): boolean {
    if (!this.enabled || !this.placeCoords) return false;

    const x = this.placeCoords.x;
    const y = this.placeCoords.y;
    const z = this.placeCoords.z;
    const key = `${x},${y},${z}`;

    if (this.placedBlocks.has(key)) return false;

    // Prevent placing directly inside the player
    const blockBox = new THREE.Box3(
      new THREE.Vector3(x - 0.49, y - 0.49, z - 0.49),
      new THREE.Vector3(x + 0.49, y + 0.49, z + 0.49),
    );
    if (playerPosition) {
      const playerBox = new THREE.Box3(
        new THREE.Vector3(playerPosition.x - 0.35, playerPosition.y, playerPosition.z - 0.35),
        new THREE.Vector3(playerPosition.x + 0.35, playerPosition.y + 1.8, playerPosition.z + 0.35),
      );
      if (playerBox.intersectsBox(blockBox)) return false;
    }

    // Prevent placing directly inside world obstacles & station apparatuses
    if (this.playerCollidersRef) {
      for (const col of this.playerCollidersRef) {
        if (col.intersectsBox(blockBox)) return false;
      }
    }

    const type = this.activeBlockType;
    const meta = VOXEL_BLOCKS[type];
    const material = textureRegistry.getMaterial(type);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = !meta.transparent;
    mesh.receiveShadow = !meta.transparent;
    mesh.userData.voxelKey = key;
    mesh.userData.voxelType = type;

    // Pop-in scale bounce animation
    mesh.scale.set(0.85, 0.85, 0.85);

    this.group.add(mesh);

    const collider = new THREE.Box3(
      new THREE.Vector3(x - 0.5, y - 0.5, z - 0.5),
      new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5),
    );

    let light: THREE.PointLight | undefined;
    if (meta.lightLevel && meta.lightLevel > 0) {
      light = new THREE.PointLight(meta.color, 1.8, 12, 1.8);
      light.position.set(x, y + 0.5, z);
      this.group.add(light);
    }

    const record: PlacedBlock = {
      key,
      type,
      position: new THREE.Vector3(x, y, z),
      mesh,
      collider,
      light,
    };

    this.placedBlocks.set(key, record);

    if (this.playerCollidersRef) {
      this.playerCollidersRef.push(collider);
    }

    sound.playBlockPlace(type);
    this.onBlockChanged?.();

    return true;
  }

  /**
   * Places a block at explicit integer voxel coordinates (for building structures & scripts)
   */
  placeAt(x: number, y: number, z: number, type: VoxelBlockType = this.activeBlockType): boolean {
    const actualY = Number.isInteger(y) ? y + 0.5 : y;
    const key = `${x},${actualY},${z}`;
    if (this.placedBlocks.has(key)) return false;

    const meta = VOXEL_BLOCKS[type];
    const material = textureRegistry.getMaterial(type);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, actualY, z);
    mesh.castShadow = !meta.transparent;
    mesh.receiveShadow = !meta.transparent;
    mesh.userData.voxelKey = key;
    mesh.userData.voxelType = type;

    mesh.scale.set(0.85, 0.85, 0.85);
    this.group.add(mesh);

    const collider = new THREE.Box3(
      new THREE.Vector3(x - 0.5, actualY - 0.5, z - 0.5),
      new THREE.Vector3(x + 0.5, actualY + 0.5, z + 0.5),
    );

    let light: THREE.PointLight | undefined;
    if (meta.lightLevel && meta.lightLevel > 0) {
      light = new THREE.PointLight(meta.color, 1.8, 12, 1.8);
      light.position.set(x, actualY + 0.5, z);
      this.group.add(light);
    }

    const record: PlacedBlock = {
      key,
      type,
      position: new THREE.Vector3(x, actualY, z),
      mesh,
      collider,
      light,
    };

    this.placedBlocks.set(key, record);
    if (this.playerCollidersRef) {
      this.playerCollidersRef.push(collider);
    }

    sound.playBlockPlace(type);
    this.onBlockChanged?.();
    return true;
  }

  /**
   * Breaks block at explicit integer voxel coordinates
   */
  breakAt(x: number, y: number, z: number, onExplodePlayer?: (origin: THREE.Vector3, force: number) => void): boolean {
    const queryPos = new THREE.Vector3(x, Number.isInteger(y) ? y + 0.5 : y, z);
    const record = this.getBlockAt(queryPos);
    if (!record) return false;

    if (record.type === 'tnt') {
      this.igniteTnt(record, onExplodePlayer);
      return true;
    }

    const meta = VOXEL_BLOCKS[record.type];
    this.spawnDebris(record.position, meta.color);

    record.mesh.removeFromParent();
    record.mesh.geometry.dispose();
    if (record.light) record.light.removeFromParent();

    if (this.playerCollidersRef) {
      const idx = this.playerCollidersRef.indexOf(record.collider);
      if (idx !== -1) this.playerCollidersRef.splice(idx, 1);
    }

    this.placedBlocks.delete(record.key);
    sound.playBlockBreak(record.type);
    this.onBlockChanged?.();
    return true;
  }

  /**
   * Breaks block at targetCoords, spawning debris and audio
   */
  breakBlock(onExplodePlayer?: (origin: THREE.Vector3, force: number) => void): boolean {
    if (!this.enabled || !this.targetCoords) return false;

    const record = this.getBlockAt(this.targetCoords);
    if (!record) {
      // It's a natural/scenery block or world surface - spawn debris and play sound
      this.spawnDebris(this.targetCoords, 0x6e786b);
      sound.playBlockBreak();
      return true;
    }

    // If TNT, ignite it instead of instantly destroying!
    if (record.type === 'tnt') {
      this.igniteTnt(record, onExplodePlayer);
      return true;
    }

    const meta = VOXEL_BLOCKS[record.type];
    this.spawnDebris(record.position, meta.color);

    // Remove mesh and light
    record.mesh.removeFromParent();
    record.mesh.geometry.dispose();
    if (record.light) record.light.removeFromParent();

    // Remove from colliders list
    if (this.playerCollidersRef) {
      const idx = this.playerCollidersRef.indexOf(record.collider);
      if (idx !== -1) this.playerCollidersRef.splice(idx, 1);
    }

    this.placedBlocks.delete(record.key);
    sound.playBlockBreak(record.type);
    this.onBlockChanged?.();

    return true;
  }

  /**
   * Ignites a TNT block with flashing and delayed explosion
   */
  private igniteTnt(
    record: PlacedBlock,
    onExplodePlayer?: (origin: THREE.Vector3, force: number) => void,
  ): void {
    const key = record.key;
    this.placedBlocks.delete(key);

    if (this.playerCollidersRef) {
      const idx = this.playerCollidersRef.indexOf(record.collider);
      if (idx !== -1) this.playerCollidersRef.splice(idx, 1);
    }

    const primed: PrimedTnt = {
      mesh: record.mesh,
      position: record.position.clone(),
      timer: 2.2,
      maxTimer: 2.2,
      originalScale: new THREE.Vector3(1, 1, 1),
    };

    this.primedTntList.push(primed);
    this.detonateCallback = onExplodePlayer;
  }

  private detonateCallback?: (origin: THREE.Vector3, force: number) => void;

  /**
   * Spawns physical 3D bursting voxel particles
   */
  private spawnDebris(pos: THREE.Vector3, color: number): void {
    const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });

    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.8,
        pos.y + (Math.random() - 0.5) * 0.8,
        pos.z + (Math.random() - 0.5) * 0.8,
      );
      this.group.add(mesh);

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 5.2,
        2.5 + Math.random() * 4.0,
        (Math.random() - 0.5) * 5.2,
      );

      const rotationSpeed = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
      );

      this.particles.push({
        mesh,
        velocity,
        rotationSpeed,
        life: 0,
        maxLife: 0.65 + Math.random() * 0.35,
      });
    }
  }

  /**
   * Checks if position stands on a slime block
   */
  isStandingOnSlime(pos: THREE.Vector3): boolean {
    for (const block of this.placedBlocks.values()) {
      if (block.type !== 'slime') continue;
      const dx = Math.abs(pos.x - block.position.x);
      const dz = Math.abs(pos.z - block.position.z);
      const topY = block.position.y + 0.5;
      const dy = pos.y - topY;
      if (dx <= 0.65 && dz <= 0.65 && dy >= -0.15 && dy <= 0.25) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns the voxel block type immediately beneath or at the given coordinate, if one exists
   */
  getBlockUnder(pos: THREE.Vector3): VoxelBlockType | null {
    for (const block of this.placedBlocks.values()) {
      const dx = Math.abs(pos.x - block.position.x);
      const dz = Math.abs(pos.z - block.position.z);
      const topY = block.position.y + 0.5;
      const dy = pos.y - topY;
      if (dx <= 0.65 && dz <= 0.65 && dy >= -0.25 && dy <= 0.35) {
        return block.type;
      }
    }
    return null;
  }

  /**
   * Updates debris particles, pop-in animations, and primed TNT explosions
   */
  update(dt: number): void {
    // Animate pop-in scale of recently placed blocks
    for (const block of this.placedBlocks.values()) {
      if (block.mesh.scale.x < 1.0) {
        const s = Math.min(1.0, block.mesh.scale.x + dt * 4.0);
        block.mesh.scale.set(s, s, s);
      }
    }

    // Update debris particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.mesh.removeFromParent();
        p.mesh.geometry?.dispose();
        if (p.mesh.material instanceof THREE.Material) {
          p.mesh.material.dispose();
        }
        this.particles.splice(i, 1);
        continue;
      }

      p.velocity.y -= 18.0 * dt; // gravity
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += p.rotationSpeed.x * dt;
      p.mesh.rotation.y += p.rotationSpeed.y * dt;
      p.mesh.rotation.z += p.rotationSpeed.z * dt;

      const fade = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(fade * 0.18 / 0.18);
    }

    // Update primed TNT
    for (let i = this.primedTntList.length - 1; i >= 0; i--) {
      const tnt = this.primedTntList[i];
      tnt.timer -= dt;

      // Pulse swelling scale and flash
      const pulse = 1.0 + Math.sin(tnt.timer * 22) * 0.14;
      tnt.mesh.scale.set(pulse, pulse, pulse);

      if (tnt.timer <= 0) {
        // DETONATE!
        tnt.mesh.removeFromParent();
        this.primedTntList.splice(i, 1);
        this.detonateTnt(tnt.position);
      }
    }
  }

  /**
   * Detonates TNT: destroys blocks in radius and creates blast
   */
  private detonateTnt(center: THREE.Vector3): void {
    sound.playExplosion();

    // Spawn massive burst particles
    for (let i = 0; i < 4; i++) {
      this.spawnDebris(center, 0xdb3223);
      this.spawnDebris(center, 0x555555);
      this.spawnDebris(center, 0xffa030);
    }

    const radius = 3.8;
    const toRemove: string[] = [];

    for (const [key, block] of this.placedBlocks.entries()) {
      if (block.position.distanceTo(center) <= radius) {
        toRemove.push(key);
      }
    }

    for (const key of toRemove) {
      const b = this.placedBlocks.get(key);
      if (!b) continue;

      if (b.type === 'tnt') {
        // Cascading TNT Chain Reaction!
        this.placedBlocks.delete(key);
        if (this.playerCollidersRef) {
          const idx = this.playerCollidersRef.indexOf(b.collider);
          if (idx !== -1) this.playerCollidersRef.splice(idx, 1);
        }
        this.primedTntList.push({
          mesh: b.mesh,
          position: b.position.clone(),
          timer: 0.2 + Math.random() * 0.35,
          maxTimer: 0.55,
          originalScale: new THREE.Vector3(1, 1, 1),
        });
        continue;
      }

      this.spawnDebris(b.position, VOXEL_BLOCKS[b.type].color);
      b.mesh.removeFromParent();
      b.mesh.geometry.dispose();
      if (b.light) b.light.removeFromParent();
      if (this.playerCollidersRef) {
        const idx = this.playerCollidersRef.indexOf(b.collider);
        if (idx !== -1) this.playerCollidersRef.splice(idx, 1);
      }
      this.placedBlocks.delete(key);
    }

    // Player knockback impulse
    this.detonateCallback?.(center, 12.0);
    this.onBlockChanged?.();
  }

  getAllPlacedBlocks(): PlacedBlock[] {
    return Array.from(this.placedBlocks.values());
  }

  clearAll(): void {
    for (const b of this.placedBlocks.values()) {
      b.mesh.removeFromParent();
      b.mesh.geometry.dispose();
      if (b.light) b.light.removeFromParent();
      if (this.playerCollidersRef) {
        const idx = this.playerCollidersRef.indexOf(b.collider);
        if (idx !== -1) this.playerCollidersRef.splice(idx, 1);
      }
    }
    this.placedBlocks.clear();
    this.onBlockChanged?.();
  }
}
