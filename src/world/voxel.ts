import * as THREE from 'three';

export interface VoxelOptions {
  color: number | string;
  glow?: boolean;
  glass?: boolean;
  opacity?: number;
  emissiveIntensity?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  rotation?: [number, number, number];
}

interface BoxRecord {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  rotation: THREE.Euler;
  color: THREE.Color;
  opacity: number;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const glowMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xa5e7ff,
  transparent: true,
  opacity: 0.2,
  roughness: 0.05,
  metalness: 0.05,
  transmission: 0.45,
  thickness: 0.8,
  depthWrite: false,
  side: THREE.DoubleSide,
});

/**
 * Accumulates voxel boxes and emits a small number of InstancedMeshes.
 * This keeps the handmade world below a few hundred draw calls.
 */
export class VoxelBatch {
  private solid: BoxRecord[] = [];
  private emissive: BoxRecord[] = [];
  private translucent: BoxRecord[] = [];

  box(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    options: VoxelOptions,
  ): this {
    const record: BoxRecord = {
      position: new THREE.Vector3(x, y, z),
      scale: new THREE.Vector3(width, height, depth),
      rotation: new THREE.Euler(...(options.rotation ?? [0, 0, 0])),
      color: new THREE.Color(options.color),
      opacity: options.opacity ?? 1,
    };
    if (options.glow) this.emissive.push(record);
    else if (options.glass) this.translucent.push(record);
    else this.solid.push(record);
    return this;
  }

  // Alias with friendlier argument order for scenery work.
  add(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    color: number | string,
    options: Omit<VoxelOptions, 'color'> = {},
  ): this {
    return this.box(x, y, z, width, height, depth, { ...options, color });
  }

  build(parent: THREE.Object3D, name = 'voxels'): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    if (this.solid.length) {
      group.add(this.createInstances(this.solid, 'solid', false, true, true));
    }
    if (this.emissive.length) {
      group.add(this.createInstances(this.emissive, 'emissive', true, false, false));
    }
    if (this.translucent.length) {
      group.add(this.createInstances(this.translucent, 'translucent', false, false, false));
    }
    parent.add(group);
    return group;
  }

  private createInstances(
    records: BoxRecord[],
    label: string,
    isGlow: boolean,
    castShadow: boolean,
    receiveShadow: boolean,
  ): THREE.InstancedMesh {
    let material: THREE.Material;
    // Colors live in InstancedMesh.instanceColor. Leaving material.vertexColors
    // off is essential here: these shared unit-box geometries have no color
    // attribute, and forcing USE_COLOR would multiply every instance by black.
    if (isGlow) {
      material = glowMaterial.clone();
    } else if (label === 'translucent') {
      material = glassMaterial.clone();
    } else {
      material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.82,
        metalness: 0.02,
        flatShading: true,
      });
    }
    const mesh = new THREE.InstancedMesh(unitBox, material, records.length);
    mesh.name = `voxel-batch-${label}`;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      quaternion.setFromEuler(record.rotation);
      matrix.compose(record.position, quaternion, record.scale);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, record.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

export function meshBox(
  width: number,
  height: number,
  depth: number,
  color: number | string,
  options: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    glow?: boolean;
    opacity?: number;
    roughness?: number;
    metalness?: number;
    wireframe?: boolean;
    transparent?: boolean;
    emissive?: number | string;
    emissiveIntensity?: number;
  } = {},
): THREE.Mesh {
  const material = options.glow
    ? new THREE.MeshBasicMaterial({
        color,
        transparent: options.transparent ?? (options.opacity !== undefined && options.opacity < 1),
        opacity: options.opacity ?? 1,
        toneMapped: false,
      })
    : new THREE.MeshStandardMaterial({
        color,
        roughness: options.roughness ?? 0.72,
        metalness: options.metalness ?? 0.06,
        transparent: options.transparent ?? (options.opacity !== undefined && options.opacity < 1),
        opacity: options.opacity ?? 1,
        emissive: options.emissive ?? 0x000000,
        emissiveIntensity: options.emissiveIntensity ?? 0.3,
        wireframe: options.wireframe ?? false,
      });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  if (options.position) mesh.position.set(...options.position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = !options.glow;
  mesh.receiveShadow = !options.glow;
  return mesh;
}

export function addBox(
  parent: THREE.Object3D,
  width: number,
  height: number,
  depth: number,
  color: number | string,
  position: [number, number, number],
  options: Parameters<typeof meshBox>[4] = {},
): THREE.Mesh {
  const mesh = meshBox(width, height, depth, color, { ...options, position });
  parent.add(mesh);
  return mesh;
}

export function addGlowSprite(
  parent: THREE.Object3D,
  texture: THREE.Texture,
  position: [number, number, number],
  size: number,
  color: number | string,
  opacity = 0.8,
): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(...position);
  sprite.scale.setScalar(size);
  sprite.userData.baseOpacity = opacity;
  parent.add(sprite);
  return sprite;
}

export function addPointLight(
  parent: THREE.Object3D,
  color: number | string,
  intensity: number,
  distance: number,
  position: [number, number, number],
  decay = 2,
): THREE.PointLight {
  const light = new THREE.PointLight(color, intensity, distance, decay);
  light.position.set(...position);
  parent.add(light);
  return light;
}

export function addWireRing(
  parent: THREE.Object3D,
  radius: number,
  color: number,
  position: [number, number, number],
  rotation: [number, number, number] = [-Math.PI / 2, 0, 0],
  opacity = 0.5,
): THREE.LineLoop {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.LineLoop(geometry, material);
  line.position.set(...position);
  line.rotation.set(...rotation);
  parent.add(line);
  return line;
}

export function addCircleDisc(
  parent: THREE.Object3D,
  radius: number,
  color: number,
  position: [number, number, number],
  opacity = 0.18,
): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(radius, 60);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const disc = new THREE.Mesh(geometry, material);
  disc.position.set(...position);
  disc.rotation.x = -Math.PI / 2;
  parent.add(disc);
  return disc;
}

export function addTree(
  batch: VoxelBatch,
  x: number,
  z: number,
  scale: number,
  leafColor: number,
  trunkColor = 0x5d3a26,
): void {
  const trunkHeight = 2.6 * scale;
  batch.add(x, trunkHeight / 2, z, 0.7 * scale, trunkHeight, 0.7 * scale, trunkColor);
  const offsets: Array<[number, number, number, number, number, number]> = [
    [0, trunkHeight + 0.4 * scale, 0, 2.5, 1.3, 2.5],
    [-0.75 * scale, trunkHeight + 1.25 * scale, 0.2, 1.4, 1.1, 1.4],
    [0.65 * scale, trunkHeight + 1.5 * scale, -0.45, 1.2, 1.4, 1.2],
    [0.1, trunkHeight + 2.3 * scale, 0.2, 1.2, 1.1, 1.2],
  ];
  for (const [ox, oy, oz, w, h, d] of offsets) {
    batch.add(x + ox, oy, z + oz, w, h, d, leafColor);
  }
}

export function addCrystal(
  parent: THREE.Object3D,
  x: number,
  z: number,
  height: number,
  color: number,
  glow = true,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const segments = [
    { w: 0.65, h: height, y: height / 2, rz: 0 },
    { w: 0.45, h: height * 0.65, y: height * 0.48, rz: 0.28, x: 0.75 },
    { w: 0.35, h: height * 0.48, y: height * 0.32, rz: -0.35, x: -0.65 },
  ];
  for (const segment of segments) {
    const geometry = new THREE.ConeGeometry(segment.w, segment.h, 5);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: glow ? color : 0x000000,
      emissiveIntensity: glow ? 0.5 : 0.05,
      roughness: 0.12,
      metalness: 0.08,
      transparent: true,
      opacity: 0.86,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(segment.x ?? 0, segment.y, segment.rz ?? 0);
    mesh.rotation.z = segment.rz ?? 0;
    group.add(mesh);
  }
  parent.add(group);
  return group;
}

export function addLantern(
  parent: THREE.Object3D,
  x: number,
  z: number,
  color: number,
  scale = 1,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.add(meshBox(0.16 * scale, 2.0 * scale, 0.16 * scale, 0x1b2130, { position: [0, 1 * scale, 0] }));
  group.add(meshBox(0.6 * scale, 0.16 * scale, 0.6 * scale, 0x2c3546, { position: [0, 0.12 * scale, 0] }));
  const bulb = meshBox(0.42 * scale, 0.52 * scale, 0.42 * scale, color, {
    glow: true,
    position: [0, 2.1 * scale, 0],
  });
  group.add(bulb);
  const halo = new THREE.PointLight(color, 2.3 * scale, 7 * scale, 2);
  halo.position.set(0, 2.1 * scale, 0);
  group.add(halo);
  parent.add(group);
  return group;
}
