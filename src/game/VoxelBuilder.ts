/**
 * Voxel Building & Mining System
 * Handles crosshair raycasting, 3D wireframe voxel selection, block placement,
 * block destruction with burst debris particles, dynamic colliders,
 * and TNT physics detonation.
 */

import * as THREE from 'three';
import {
  type VoxelBlockType,
  VOXEL_BLOCKS,
  textureRegistry,
} from '../world/textures';
import { sound } from '../audio/SoundEngine';

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
  private reachDistance = 6.2;
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
   * Updates raycast targeting from crosshair
   */
  updateTargeting(worldMeshes: THREE.Object3D[]): void {
    if (!this.enabled) {
      this.selectionBox.visible = false;
      this.targetCoords = null;
      this.placeCoords = null;
      return;
    }

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = this.reachDistance;

    const targets: THREE.Object3D[] = [...this.group.children, ...worldMeshes];
    const hits = this.raycaster.intersectObjects(targets, true);

    const hit = hits.find(
      (h) => h.object.visible && h.object !== this.selectionBox && !h.object.name.includes('particle'),
    );

    if (hit && hit.face && hit.point) {
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      
      // Calculate targeted voxel integer coordinates
      const hitCenter = hit.point.clone().sub(normal.clone().multiplyScalar(0.02));
      const bx = Math.floor(hitCenter.x + 0.5);
      const by = Math.floor(hitCenter.y + 0.5);
      const bz = Math.floor(hitCenter.z + 0.5);

      this.targetCoords = new THREE.Vector3(bx, by, bz);
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
      this.placeCoords = new THREE.Vector3(bx + nx, by + ny, bz + nz);

      // Position the selection wireframe box
      this.selectionBox.position.set(bx, by, bz);
      this.selectionBox.visible = true;
    } else {
      this.clearTargeting();
    }
  }

  clearTargeting(): void {
    this.selectionBox.visible = false;
    this.targetCoords = null;
    this.placeCoords = null;
    this.targetFaceNormal = null;
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
    if (playerPosition) {
      const playerBox = new THREE.Box3(
        new THREE.Vector3(playerPosition.x - 0.35, playerPosition.y, playerPosition.z - 0.35),
        new THREE.Vector3(playerPosition.x + 0.35, playerPosition.y + 1.8, playerPosition.z + 0.35),
      );
      const blockBox = new THREE.Box3(
        new THREE.Vector3(x - 0.5, y - 0.5, z - 0.5),
        new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5),
      );
      if (playerBox.intersectsBox(blockBox)) return false;
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

    sound.playBlockPlace();
    this.onBlockChanged?.();

    return true;
  }

  /**
   * Places a block at explicit integer voxel coordinates (for building structures & scripts)
   */
  placeAt(x: number, y: number, z: number, type: VoxelBlockType = this.activeBlockType): boolean {
    const key = `${x},${y},${z}`;
    if (this.placedBlocks.has(key)) return false;

    const meta = VOXEL_BLOCKS[type];
    const material = textureRegistry.getMaterial(type);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = !meta.transparent;
    mesh.receiveShadow = !meta.transparent;
    mesh.userData.voxelKey = key;
    mesh.userData.voxelType = type;

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

    sound.playBlockPlace();
    this.onBlockChanged?.();
    return true;
  }

  /**
   * Breaks block at explicit integer voxel coordinates
   */
  breakAt(x: number, y: number, z: number, onExplodePlayer?: (origin: THREE.Vector3, force: number) => void): boolean {
    const key = `${x},${y},${z}`;
    const record = this.placedBlocks.get(key);
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

    this.placedBlocks.delete(key);
    sound.playBlockBreak();
    this.onBlockChanged?.();
    return true;
  }

  /**
   * Breaks block at targetCoords, spawning debris and audio
   */
  breakBlock(onExplodePlayer?: (origin: THREE.Vector3, force: number) => void): boolean {
    if (!this.enabled || !this.targetCoords) return false;

    const x = this.targetCoords.x;
    const y = this.targetCoords.y;
    const z = this.targetCoords.z;
    const key = `${x},${y},${z}`;

    const record = this.placedBlocks.get(key);
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

    this.placedBlocks.delete(key);
    sound.playBlockBreak();
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
    const x = Math.floor(pos.x + 0.5);
    const y = Math.floor(pos.y - 0.05);
    const z = Math.floor(pos.z + 0.5);
    const key = `${x},${y},${z}`;
    const block = this.placedBlocks.get(key);
    return block?.type === 'slime';
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
