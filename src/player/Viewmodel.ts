import * as THREE from 'three';
import { meshBox } from '../world/voxel';
import { type VoxelBlockType, textureRegistry } from '../world/textures';

export type ToolId = 'goggles' | 'time' | 'wand' | 'book' | 'graph' | 'block';

export class Viewmodel {
  readonly root = new THREE.Group();
  private tools: Record<ToolId, THREE.Group>;
  private active: ToolId = 'wand';
  private elapsed = 0;
  private moveBlend = 0;
  private target: THREE.Vector3;
  private current = new THREE.Vector3();
  private basePosition = new THREE.Vector3(0.38, -0.33, -0.66);
  private isVisible = true;
  private swingProgress = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.root.name = 'first-person-viewmodel';
    this.root.position.copy(this.basePosition);
    this.root.rotation.set(-0.05, -0.12, 0.04);
    camera.add(this.root);
    this.current.copy(this.basePosition);
    this.target = this.basePosition.clone();

    const skin = 0x342c2b;
    const sleeve = 0x1c2a34;
    const accent = 0x7ff4ff;

    const goggles = new THREE.Group();
    goggles.add(meshBox(0.2, 0.075, 0.1, 0x1f303c, { position: [0, 0.012, 0], roughness: 0.4, metalness: 0.6 }));
    for (const side of [-1, 1]) {
      const lens = meshBox(0.075, 0.078, 0.025, 0x79efff, {
        position: [side * 0.052, 0.02, -0.065],
        glow: true,
        transparent: true,
        opacity: 0.75,
      });
      goggles.add(lens);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.05, 0.008, 6, 16),
        new THREE.MeshBasicMaterial({ color: 0x97d7e8, toneMapped: false }),
      );
      ring.position.set(side * 0.052, 0.02, -0.071);
      goggles.add(ring);
    }
    goggles.add(meshBox(0.03, 0.14, 0.05, 0x283840, { position: [0.11, -0.05, 0.01], rotation: [0, 0, 0.22] }));
    goggles.add(this.makeHand(skin, sleeve));
    const blockGroup = new THREE.Group();
    const blockMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.18),
      textureRegistry.getMaterial('grass'),
    );
    blockMesh.position.set(0, 0.05, -0.05);
    blockMesh.rotation.set(0.35, 0.55, 0);
    blockGroup.add(blockMesh);
    blockGroup.add(this.makeHand(skin, sleeve, 0.02));
    blockGroup.userData.blockMesh = blockMesh;

    this.tools = {
      goggles,
      time: new THREE.Group(),
      wand: new THREE.Group(),
      book: new THREE.Group(),
      graph: new THREE.Group(),
      block: blockGroup,
    };
    this.tools.goggles = goggles;
    this.tools.block = blockGroup;

    const time = this.tools.time;
    time.add(meshBox(0.19, 0.19, 0.05, 0xc49a55, { position: [0, 0.03, 0], roughness: 0.3, metalness: 0.8 }));
    const clockFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.073, 24),
      new THREE.MeshBasicMaterial({ color: 0x071b20, toneMapped: false }),
    );
    clockFace.position.set(0, 0.03, -0.027);
    clockFace.rotation.y = Math.PI;
    clockFace.scale.y = 1;
    time.add(clockFace);
    const hand = meshBox(0.008, 0.055, 0.008, 0x7eefff, { position: [0, 0.052, -0.034], glow: true });
    hand.geometry.translate(0, 0.022, 0);
    time.add(hand);
    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.006, 5, 42),
      new THREE.MeshBasicMaterial({ color: 0x88e8f7, transparent: true, opacity: 0.65, toneMapped: false }),
    );
    orbit.position.y = 0.03;
    orbit.rotation.x = Math.PI / 2;
    time.add(orbit);
    time.add(this.makeHand(skin, sleeve));
    time.userData.hand = hand;

    const wand = this.tools.wand;
    wand.add(meshBox(0.038, 0.36, 0.038, 0x37505c, { position: [0, -0.02, 0], rotation: [0, 0, -0.12] }));
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.033, 0.007, 5, 14),
        new THREE.MeshStandardMaterial({ color: 0xa77947, metalness: 0.7, roughness: 0.35 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(i * -0.0107, 0.07 - i * 0.052, 0);
      wand.add(ring);
    }
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.065, 0),
      new THREE.MeshStandardMaterial({
        color: 0x82f4ff,
        emissive: 0x34d5ef,
        emissiveIntensity: 1.9,
        metalness: 0.1,
        roughness: 0.2,
        flatShading: true,
      }),
    );
    crystal.position.set(-0.05, 0.22, 0);
    wand.add(crystal);
    wand.userData.tip = crystal;
    const wandHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.1, 0.006, 4, 28),
      new THREE.MeshBasicMaterial({ color: 0x83f1ff, transparent: true, opacity: 0.5, toneMapped: false }),
    );
    wandHalo.position.copy(crystal.position);
    wandHalo.rotation.x = Math.PI / 2;
    wand.add(wandHalo);
    wand.userData.halo = wandHalo;
    wand.add(this.makeHand(skin, sleeve));

    const book = this.tools.book;
    book.add(meshBox(0.24, 0.3, 0.07, 0x1b4d4d, { position: [0, 0.02, 0], rotation: [0.12, -0.15, -0.15], roughness: 0.55 }));
    book.add(meshBox(0.21, 0.25, 0.02, 0xd9fff2, { position: [0.008, 0.02, -0.047], rotation: [0.12, -0.15, -0.15], glow: true }));
    book.add(meshBox(0.04, 0.32, 0.082, 0xc79958, { position: [-0.125, 0.02, -0.001], rotation: [0.12, -0.15, -0.15], metalness: 0.55, roughness: 0.35 }));
    const bookGlow = new THREE.PointLight(0x75ffd7, 0.35, 0.8, 2);
    bookGlow.position.set(0, 0.1, -0.1);
    book.add(bookGlow);
    book.add(this.makeHand(skin, sleeve));

    const graph = this.tools.graph;
    graph.add(meshBox(0.29, 0.2, 0.035, 0x14252c, { position: [0, 0.03, 0], roughness: 0.3, metalness: 0.25 }));
    const screen = meshBox(0.235, 0.14, 0.01, 0x0c2025, { position: [0, 0.03, -0.024], glow: true });
    graph.add(screen);
    const graphLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.09, -0.035, -0.03),
        new THREE.Vector3(-0.035, 0.01, -0.03),
        new THREE.Vector3(0.015, -0.025, -0.03),
        new THREE.Vector3(0.09, 0.065, -0.03),
      ]),
      new THREE.LineBasicMaterial({ color: 0x8bffcc, toneMapped: false }),
    );
    graph.add(graphLine);
    for (const [x, y] of [
      [-0.11, 0.1],
      [0.11, 0.1],
      [-0.11, -0.04],
      [0.11, -0.04],
    ] as const) {
      graph.add(meshBox(0.018, 0.018, 0.016, 0xb8874a, { position: [x, y + 0.03, -0.006] }));
    }
    graph.add(this.makeHand(skin, sleeve, 0.04));

    this.root.add(...Object.values(this.tools));
    this.setTool('wand');
  }

  private makeHand(skin: number, sleeve: number, offset = 0): THREE.Group {
    const hand = new THREE.Group();
    hand.position.set(0.03, -0.14 + offset, 0.06);
    hand.rotation.z = -0.28;
    const palm = meshBox(0.105, 0.16, 0.11, skin, { roughness: 0.9 });
    palm.rotation.x = 0.15;
    hand.add(palm);
    for (let i = 0; i < 3; i++) {
      const finger = meshBox(0.026, 0.08, 0.035, skin, {
        position: [-0.032 + i * 0.032, 0.11, -0.02],
        rotation: [0.22, 0, -0.05],
        roughness: 0.9,
      });
      hand.add(finger);
    }
    const cuff = meshBox(0.13, 0.1, 0.13, sleeve, { position: [0, -0.14, 0.003], roughness: 0.82 });
    hand.add(cuff);
    return hand;
  }

  setTool(tool: ToolId): void {
    this.active = tool;
    for (const [id, group] of Object.entries(this.tools)) {
      group.visible = id === tool;
    }
  }

  setHeldBlock(type: VoxelBlockType): void {
    const blockMesh = this.tools.block.userData.blockMesh as THREE.Mesh | undefined;
    if (blockMesh) {
      blockMesh.material = textureRegistry.getMaterial(type);
    }
  }

  triggerSwing(): void {
    this.swingProgress = 1.0;
  }

  setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.root.visible = visible;
  }

  update(dt: number, elapsed: number, moveAmount: number, sprinting: boolean): void {
    this.elapsed = elapsed;
    if (!this.isVisible) return;
    this.moveBlend += (moveAmount - this.moveBlend) * Math.min(1, dt * 8);
    const bob = Math.sin(elapsed * (sprinting ? 9.2 : 6.4));
    const sway = Math.cos(elapsed * (sprinting ? 4.6 : 3.2));
    this.target.set(
      this.basePosition.x + sway * 0.014 * this.moveBlend,
      this.basePosition.y + Math.abs(bob) * 0.022 * this.moveBlend + Math.sin(elapsed * 1.3) * 0.003,
      this.basePosition.z,
    );
    this.current.lerp(this.target, Math.min(1, dt * 12));
    this.swingProgress = Math.max(0, this.swingProgress - dt * 5.5);
    const swingFactor = Math.sin(this.swingProgress * Math.PI);
    const swingPitch = -swingFactor * 0.42;
    const swingYaw = swingFactor * 0.22;
    const swingZ = -swingFactor * 0.12;

    this.root.position.copy(this.current);
    this.root.position.z += swingZ;
    this.root.rotation.z = 0.04 + sway * 0.012 * this.moveBlend;
    this.root.rotation.x = -0.05 + bob * 0.01 * this.moveBlend + swingPitch;
    this.root.rotation.y = -0.12 + swingYaw;

    const group = this.tools[this.active];
    if (this.active === 'time') {
      group.rotation.y = Math.sin(elapsed * 0.8) * 0.05;
      const hand = group.userData.hand as THREE.Object3D | undefined;
      if (hand) hand.rotation.z = elapsed * 0.4;
    }
    if (this.active === 'wand') {
      const tip = group.userData.tip as THREE.Object3D | undefined;
      const halo = group.userData.halo as THREE.Object3D | undefined;
      const pulse = 1 + Math.sin(elapsed * 2.4) * 0.1;
      tip?.scale.setScalar(pulse);
      if (halo) {
        halo.rotation.z += dt * 0.5;
        halo.scale.setScalar(1 + Math.sin(elapsed * 1.8) * 0.15);
      }
    }
    if (this.active === 'goggles') {
      group.rotation.y = Math.sin(elapsed * 0.6) * 0.02;
    }
    if (this.active === 'book') {
      group.rotation.y = -0.08 + Math.sin(elapsed * 0.7) * 0.025;
    }
  }
}
