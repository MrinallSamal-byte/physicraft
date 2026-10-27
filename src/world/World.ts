import * as THREE from 'three';
import {
  BIOMES,
  BIOME_BY_ID,
  WORLD,
  biomePathPoints,
  type BiomeDefinition,
  type BiomeId,
} from '../config';
import {
  addCircleDisc,
  addCrystal,
  addGlowSprite,
  addLantern,
  addPointLight,
  addTree,
  addWireRing,
  VoxelBatch,
} from './voxel';
import { makeRadialGlowTexture, seededRandom, hash2, palette, clamp } from '../core/utils';
import { makeReadoutTexture, makeWorldTitle, type HoloText } from './labels';

interface AmbientSpec {
  sprite: THREE.Sprite;
  origin: THREE.Vector3;
  phase: number;
  speed: number;
  amplitude: number;
}

interface RimLight {
  material: THREE.MeshBasicMaterial;
  phase: number;
}

const islandRng = seededRandom(0x51a7c0de);

export class World {
  group = new THREE.Group();
  colliders: THREE.Box3[] = [];
  biomeDecor: THREE.Group[] = [];
  coreGroup = new THREE.Group();
  private glowTexture = makeRadialGlowTexture();
  private ambient: AmbientSpec[] = [];
  private rimLights: RimLight[] = [];
  private cloudGroup = new THREE.Group();
  private skyMaterial!: THREE.ShaderMaterial;
  private moonSprite!: THREE.Sprite;
  private sunLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private ambientLight!: THREE.AmbientLight;
  private starField!: THREE.Points;
  private dust!: THREE.Points;
  private dustOrigin!: Float32Array;
  private sunSprite!: THREE.Sprite;
  private elapsed = 0;
  private playerLight!: THREE.PointLight;
  private gateLabels: THREE.Sprite[] = [];
  private activeBiome: BiomeId | null = null;
  private timeOfDay = 12.0; // 12:00 PM (High Noon - Default Day Mode)
  private dayCycleActive = false; // Day Mode is default and frozen in full sunlight unless toggled
  private dayCycleDuration = 480; // 8 minutes for 24h cycle

  constructor(private scene: THREE.Scene) {
    this.group.name = 'World';
    scene.add(this.group);
    this.createSky();
    this.createLights();
    this.buildIsland();
    this.buildPaths();
    this.buildHub();
    this.buildBiomeDecor();
    this.createAmbientLife();
    this.createClouds();
    this.group.add(this.coreGroup);
    this.applyShadows();
  }

  private createSky(): void {
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color('#1860a8') },
        midColor: { value: new THREE.Color('#509be0') },
        horizonColor: { value: new THREE.Color('#bce2f5') },
        sunColor: { value: new THREE.Color('#fffbf0') },
        sunDirection: { value: new THREE.Vector3(0.0, 1.0, 0.1).normalize() },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPosition;
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 horizonColor;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        void main() {
          vec3 dir = normalize(vWorldPosition);
          float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 color = mix(horizonColor, midColor, smoothstep(0.42, 0.68, h));
          color = mix(color, topColor, smoothstep(0.65, 1.0, h));
          float sunAmount = max(dot(dir, sunDirection), 0.0);
          color += sunColor * pow(sunAmount, 42.0) * 0.7;
          color += sunColor * pow(sunAmount, 5.0) * 0.08;
          float horizonGlow = exp(-pow((h - 0.49) * 14.0, 2.0));
          color += horizonColor * horizonGlow * 0.25;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(430, 48, 24), this.skyMaterial);
    sky.name = 'SkyDome';
    sky.frustumCulled = false;
    this.scene.add(sky);

    const sun = addGlowSprite(this.scene, this.glowTexture, [0, 190, 17], 62, '#fffbf0', 0.88);
    this.sunSprite = sun;

    const starGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    const rng = seededRandom(9221);
    for (let i = 0; i < 1300; i++) {
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(0.15 + rng() * 0.85);
      const radius = 360 + rng() * 30;
      positions.push(
        Math.sin(phi) * Math.cos(theta) * radius,
        Math.cos(phi) * radius,
        Math.sin(phi) * Math.sin(theta) * radius,
      );
      const warmth = rng();
      colors.push(0.66 + warmth * 0.34, 0.76 + warmth * 0.17, 1);
    }
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const starMaterial = new THREE.PointsMaterial({
      size: 1.15,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    this.starField = new THREE.Points(starGeometry, starMaterial);
    this.starField.frustumCulled = false;
    this.scene.add(this.starField);

    this.moonSprite = addGlowSprite(this.scene, this.glowTexture, [0, -190, -17], 44, '#b4d5ff', 0.65);

    this.scene.fog = new THREE.FogExp2('#9eccdf', 0.0016);
  }

  private createLights(): void {
    this.hemiLight = new THREE.HemisphereLight('#bfe0ff', '#627d60', 1.35);
    this.scene.add(this.hemiLight);

    this.ambientLight = new THREE.AmbientLight('#607e9e', 0.55);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight('#fffbf0', 2.8);
    this.sunLight.position.set(0, 190, 17);
    this.sunLight.target.position.set(0, 0, 0);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -165;
    this.sunLight.shadow.camera.right = 165;
    this.sunLight.shadow.camera.top = 165;
    this.sunLight.shadow.camera.bottom = -165;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 480;
    this.sunLight.shadow.bias = -0.00025;
    this.sunLight.shadow.normalBias = 0.03;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.fillLight = new THREE.DirectionalLight('#82c8ea', 0.85);
    this.fillLight.position.set(-80, 40, -50);
    this.scene.add(this.fillLight);

    this.playerLight = new THREE.PointLight('#ffecd0', 0.25, 18, 2);
    this.scene.add(this.playerLight);

    // A soft halo over the hall that can be seen from every path.
    const halo = addGlowSprite(this.scene, this.glowTexture, [0, 17, 0], 38, '#ffd58e', 0.35);
    halo.material.depthTest = false;
    addPointLight(this.group, '#ffd7a1', 4.2, 45, [0, 10, 0]);
  }

  private buildIsland(): void {
    const batch = new VoxelBatch();
    const tile = 4;
    const limit = WORLD.radius;
    const topColors = [0x667a67, 0x59735f, 0x72846d, 0x4f6b5d, 0x7b8c73];

    for (let x = -limit; x <= limit; x += tile) {
      for (let z = -limit; z <= limit; z += tile) {
        const distance = Math.hypot(x + tile / 2, z + tile / 2);
        if (distance > limit) continue;
        const noise = hash2(x * 0.091, z * 0.087);
        const edgeFactor = distance / limit;
        let color = topColors[Math.floor(noise * topColors.length)];
        if (edgeFactor > 0.82) color = 0x54645b;
        if (noise > 0.965 && edgeFactor < 0.78) color = 0x8c9b74;
        batch.add(x + tile / 2, -0.5, z + tile / 2, tile - 0.06, 1, tile - 0.06, color);

        // Strata beneath the surface communicate that this is a floating voxel world.
        batch.add(
          x + tile / 2,
          -2.1,
          z + tile / 2,
          tile,
          2.2,
          tile,
          noise > 0.55 ? 0x33414a : 0x2c3942,
        );
        if (distance > limit - 16) {
          batch.add(x + tile / 2, -5.2, z + tile / 2, tile + 0.1, 4.4, tile + 0.1, noise > 0.5 ? 0x243139 : 0x1e2932);
        }
        if (distance > limit - 4) {
          const depth = 3 + Math.floor(noise * 7);
          batch.add(x + tile / 2, -6.8 - depth * 0.25, z + tile / 2, tile + 0.2, depth, tile + 0.2, 0x18232b);
        }
      }
    }

    // Broken rim cliffs create a natural boundary while keeping every biome visible.
    const rng = seededRandom(44112);
    for (let i = 0; i < 74; i++) {
      const angle = (i / 74) * Math.PI * 2 + rng() * 0.05;
      const radius = WORLD.radius - 5 + plusJitter(rng, 5);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const height = 1.2 + rng() * 5.2;
      const width = 2.5 + rng() * 5;
      batch.add(x, height / 2 - 0.1, z, width, height, width, rng() > 0.6 ? 0x455d56 : 0x3d504b);
      if (height > 4.5) {
        batch.add(x, height + 1.5, z, width * 0.48, 3.2, width * 0.45, 0x3d5b50);
      }
    }

    // Decorative trees and crystal outcrops are kept off the paths.
    for (let i = 0; i < 42; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = 38 + rng() * 63;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (this.nearPath(x, z, 7)) continue;
      let nearBiome = false;
      for (const biome of BIOMES) {
        if (new THREE.Vector2(x, z).distanceTo(biome.center) < 23) nearBiome = true;
      }
      if (nearBiome) continue;
      addTree(batch, x, z, 0.7 + rng() * 0.6, rng() > 0.55 ? 0x517b62 : 0x476d5f);
    }

    batch.build(this.group, 'island');
  }

  private nearPath(x: number, z: number, threshold: number): boolean {
    for (const biome of BIOMES) {
      const points = biomePathPoints(biome, 12);
      for (const p of points) {
        if (Math.hypot(p.x - x, p.z - z) < threshold) return true;
      }
    }
    return false;
  }

  private buildPaths(): void {
    const batch = new VoxelBatch();
    for (const biome of BIOMES) {
      const points = biomePathPoints(biome, 26);
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const distance = a.distanceTo(b);
        const angle = Math.atan2(b.x - a.x, b.z - a.z);
        const midpoint = a.clone().add(b).multiplyScalar(0.5);
        batch.add(midpoint.x, 0.04, midpoint.z, 4.4, 0.08, distance + 0.7, 0x2d3e43, {
          rotation: [0, angle, 0],
        });
        batch.add(midpoint.x, 0.09, midpoint.z, 2.4, 0.06, distance + 0.5, 0x42555a, {
          rotation: [0, angle, 0],
        });
        if (i % 2 === 0) {
          batch.add(midpoint.x, 0.13, midpoint.z, 0.19, 0.06, distance * 0.8, biome.color, {
            glow: true,
            rotation: [0, angle, 0],
          });
        }
      }
      for (let i = 2; i < points.length - 2; i += 5) {
        const point = points[i];
        const normal = new THREE.Vector2(-biome.center.y, biome.center.x).normalize();
        const side = i % 2 === 0 ? 1 : -1;
        addLantern(
          this.group,
          point.x + normal.x * 4.2 * side,
          point.z + normal.y * 4.2 * side,
          biome.color,
          0.72,
        );
      }
    }
    batch.build(this.group, 'paths');
  }

  private buildHub(): void {
    const batch = new VoxelBatch();
    const hub = WORLD.hubRadius;
    const ringColors = [0xd8b46c, 0x33454d, 0x263941];

    // Paving and concentric brass inlays.
    for (let radius = hub; radius > 4; radius -= 4) {
      const color = radius % 8 === 0 ? 0x4e6064 : 0x374a50;
      const segments = Math.max(20, Math.floor(radius * 2.4));
      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        const mid = (a0 + a1) / 2;
        const x = Math.cos(mid) * (radius - 2);
        const z = Math.sin(mid) * (radius - 2);
        batch.add(x, 0.12, z, 4.2, 0.15, 4.2, color, { rotation: [0, mid, 0] });
      }
    }

    for (const radius of [7.5, 15.5, 23.2]) {
      const segments = Math.ceil(radius * 7);
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const x = Math.cos(a) * radius;
        const z = Math.sin(a) * radius;
        batch.add(x, 0.23, z, 0.42, 0.12, 0.92, i % 3 === 0 ? 0xf3d17a : 0x9e7b42, {
          glow: i % 3 === 0,
          rotation: [0, -a, 0],
        });
      }
    }

    // Six gates to the six disciplines.
    for (const biome of BIOMES) {
      const angle = biome.gateAngle;
      const inward = new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle));
      const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
      const gatePos = new THREE.Vector3(Math.cos(angle) * 26.2, 0, Math.sin(angle) * 26.2);
      for (const side of [-1, 1]) {
        const pos = gatePos.clone().addScaledVector(tangent, side * 4.2);
        for (let level = 0; level < 5; level++) {
          const scale = 1 - level * 0.05;
          batch.add(pos.x, 1.2 + level * 1.35, pos.z, 1.35 * scale, 1.35, 1.35 * scale, level === 4 ? biome.color : 0x2d3f48);
        }
        batch.add(pos.x, 0.2, pos.z, 2.2, 0.4, 2.2, 0x1c2b32);
      }
      const lintelY = 7.95;
      const lintelPos = gatePos.clone().addScaledVector(inward, 0.3);
      batch.add(lintelPos.x, lintelY, lintelPos.z, 10.2, 0.9, 1.05, 0x253740, {
        rotation: [0, -angle, 0],
      });
      batch.add(lintelPos.x, lintelY + 0.68, lintelPos.z, 7.9, 0.18, 0.18, biome.color, {
        glow: true,
        rotation: [0, -angle, 0],
      });
      batch.add(gatePos.x, 10.0, gatePos.z, 3.6, 2.4, 0.35, 0x0a131d, {
        rotation: [0, -angle, 0],
      });

      const label = makeReadoutTexture([`#BIOME 0${biome.index}`, biome.shortName, biome.mentors.toUpperCase()], biome.accent, 900, 320);
      const labelMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(4.8, 1.7),
        new THREE.MeshBasicMaterial({
          map: label,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
          side: THREE.DoubleSide,
        }),
      );
      const signPos = gatePos.clone().addScaledVector(inward, 0.55);
      labelMesh.position.set(signPos.x, 10.02, signPos.z);
      labelMesh.rotation.y = -angle + Math.PI;
      this.group.add(labelMesh);

      // Path-side glyph monoliths.
      const glyphPos = gatePos.clone().addScaledVector(tangent, 5.9);
      batch.add(glyphPos.x, 0.8, glyphPos.z, 0.8, 1.6, 0.8, 0x22333c);
      const glyphTexture = makeReadoutTexture([`#${biome.index === 1 ? 'MOTION' : biome.discipline.split(' ')[0].toUpperCase()}`, biome.glyph], biome.accent, 320, 320);
      const glyph = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 1.4),
        new THREE.MeshBasicMaterial({ map: glyphTexture, transparent: true, toneMapped: false, depthWrite: false }),
      );
      glyph.position.set(glyphPos.x, 2.0, glyphPos.z);
      glyph.rotation.y = -angle + Math.PI;
      this.group.add(glyph);
    }

    // Central plinth, deed-stone and instrument rings.
    for (let i = 0; i < 8; i++) {
      const inset = i * 0.72;
      batch.add(0, 0.2 + inset * 0.06, 0, 7.8 - i * 0.7, 0.16, 7.8 - i * 0.7, ringColors[i % 2], {
        rotation: [0, Math.PI / 4 + i * 0.08, 0],
      });
    }
    batch.add(0, 1.4, 0, 1.8, 2.8, 1.8, 0x20353e);
    batch.add(0, 3.0, 0, 2.4, 0.3, 2.4, 0xc7a35d);
    batch.add(0, 3.3, 0, 1.35, 0.18, 1.35, 0xf8dc98, { glow: true });

    const constTexture = makeReadoutTexture(
      [
        '#THE HALL OF CONSTANTS',
        'c  299,792,458 m/s',
        'g  9.81 m/s²  ·  G  6.674×10⁻¹¹',
        'h  6.626×10⁻³⁴ J·s',
        'Every experiment here is a conversation with these numbers.',
      ],
      '#f5d48f',
      1300,
      700,
    );
    const constBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(4.7, 2.55),
      new THREE.MeshBasicMaterial({ map: constTexture, transparent: true, toneMapped: false, depthWrite: false }),
    );
    constBoard.position.set(0, 3.45, 0.06);
    constBoard.rotation.x = 0.1;
    constBoard.rotation.y = Math.PI;
    this.group.add(constBoard);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.35, 1),
      new THREE.MeshStandardMaterial({
        color: 0xffd27c,
        emissive: 0xffaa47,
        emissiveIntensity: 1.3,
        roughness: 0.22,
        metalness: 0.6,
        flatShading: true,
      }),
    );
    core.position.y = 6.2;
    this.coreGroup.add(core);
    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.68, 1),
      new THREE.MeshBasicMaterial({ color: 0x8eefff, wireframe: true, transparent: true, opacity: 0.4, toneMapped: false }),
    );
    wire.position.copy(core.position);
    this.coreGroup.add(wire);
    for (let i = 0; i < 3; i++) {
      const ring = addWireRing(
        this.coreGroup,
        2.3 + i * 0.7,
        i === 0 ? 0xffce7a : 0x73e4ff,
        [0, 6.2, 0],
        [Math.PI / 2 + i * 0.4, 0.2 * i, 0],
        0.36,
      );
      ring.userData.spin = 0.15 + i * 0.08;
    }
    const halo = addGlowSprite(this.coreGroup, this.glowTexture, [0, 6.2, 0], 7.5, '#ffd486', 0.6);
    halo.material.depthWrite = false;

    const title = makeWorldTitle('The Hall of Constants', 'Spawn Rotunda · Grand Physics Sandbox', '#ffd48b', 3.1);
    title.position.set(0, 12.5, 0);
    this.group.add(title);
    this.gateLabels.push(title);

    // Benches / consoles around the hub.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const x = Math.cos(a) * 20;
      const z = Math.sin(a) * 20;
      batch.add(x, 0.45, z, 2.8, 0.7, 0.85, 0x1d2b33, { rotation: [0, -a, 0] });
      batch.add(x, 0.83, z, 3.1, 0.1, 1.05, 0x8a6537, { rotation: [0, -a, 0] });
    }

    batch.build(this.group, 'hub');
    addPointLight(this.group, '#ffcb87', 2.8, 18, [0, 5, 0]);
  }

  private buildBiomeDecor(): void {
    for (const biome of BIOMES) {
      const group = new THREE.Group();
      group.name = `biome-${biome.id}`;
      this.group.add(group);
      this.biomeDecor.push(group);
      const local = new VoxelBatch();
      const c = biome.center;
      const inward = c.clone().normalize().multiplyScalar(-1);
      const tangent = new THREE.Vector2(-inward.y, inward.x);
      const rng = seededRandom(biome.index * 7001 + 33);

      // Biome floor mosaic.
      for (let x = -29; x <= 29; x += 2) {
        for (let z = -29; z <= 29; z += 2) {
          if (Math.hypot(x, z) > 30) continue;
          if (Math.hypot(x, z) < 12 && hash2(x, z) > 0.32) continue;
          const noise = hash2(x * 0.19 + biome.index, z * 0.17);
          const color = new THREE.Color(biome.dark);
          color.offsetHSL(0, 0, (noise - 0.5) * 0.08);
          local.add(c.x + x, 0.035, c.y + z, 2.05, 0.09, 2.05, color.getHex());
        }
      }

      // Circular station court outline.
      for (let i = 0; i < 80; i++) {
        const a = (i / 80) * Math.PI * 2;
        const radius = 29.4;
        const x = c.x + Math.cos(a) * radius;
        const z = c.y + Math.sin(a) * radius;
        local.add(x, 0.12, z, 0.8, 0.14, 0.8, i % 5 === 0 ? biome.color : 0x293c41, {
          glow: i % 5 === 0,
        });
      }

      // Landscape furniture differs per discipline.
      if (biome.id === 'classical') {
        this.buildMesa(local, c.x - 25, c.y - 18, rng, biome);
        this.buildMesa(local, c.x + 25, c.y - 13, rng, biome);
        this.buildMesa(local, c.x + 18, c.y + 22, rng, biome);
        for (let i = 0; i < 10; i++) {
          const x = c.x + (rng() - 0.5) * 55;
          const z = c.y + (rng() - 0.5) * 55;
          if (Math.hypot(x - c.x, z - c.y) > 20) {
            addCrystal(group, x, z, 1.2 + rng() * 2, 0xe2a64b, false);
          }
        }
      } else if (biome.id === 'thermo') {
        this.buildThermalPool(local, c.x + tangent.x * 23, c.y + tangent.y * 23, biome);
        this.buildThermalPool(local, c.x - tangent.x * 22, c.y - tangent.y * 22, biome);
        for (let i = 0; i < 8; i++) {
          const a = rng() * Math.PI * 2;
          const radius = 18 + rng() * 12;
          const x = c.x + Math.cos(a) * radius;
          const z = c.y + Math.sin(a) * radius;
          local.add(x, 0.6, z, 1.2, 1.2, 1.2, 0x2b4d4d);
          const ventGlow = addGlowSprite(group, this.glowTexture, [x, 1.4, z], 1.6, '#7fffe4', 0.35);
          ventGlow.userData.pulse = rng() * Math.PI * 2;
        }
        addCrystal(group, c.x + inward.x * 28 + 8, c.y + inward.y * 28 + 2, 4, 0x49e6cb, true);
      } else if (biome.id === 'electro') {
        this.buildFoundryArc(local, c, biome, rng);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const x = c.x + Math.cos(a) * 25;
          const z = c.y + Math.sin(a) * 25;
          this.buildPylon(local, group, x, z, biome, i);
        }
      } else if (biome.id === 'optics') {
        for (let i = 0; i < 20; i++) {
          const a = rng() * Math.PI * 2;
          const r = 20 + rng() * 12;
          const x = c.x + Math.cos(a) * r;
          const z = c.y + Math.sin(a) * r;
          if (Math.hypot(x - c.x, z - c.y) < 27) {
            addCrystal(group, x, z, 1.5 + rng() * 4.2, i % 3 === 0 ? 0xffa7f8 : 0x9d79ff, true);
          }
        }
        // Hanging shards around the cavern crown.
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const x = c.x + Math.cos(a) * (20 + rng() * 8);
          const z = c.y + Math.sin(a) * (20 + rng() * 8);
          const shard = addCrystal(group, x, z, 1.2 + rng() * 2.4, 0xef9cff, true);
          shard.position.y = 8 + rng() * 3;
          shard.rotation.z = Math.PI;
        }
        addPointLight(group, '#f08fff', 5, 35, [c.x, 6, c.y]);
      } else if (biome.id === 'relativity') {
        for (let i = 0; i < 6; i++) {
          const radius = 8 + i * 2.7;
          const ring = addWireRing(group, radius, i % 2 ? 0xffb28c : 0x5f7690, [c.x, 0.2 + i * 0.035, c.y], [-Math.PI / 2, 0, 0], 0.23);
          ring.userData.orbit = i;
        }
        // Suspended planet display.
        const planetColors = [0x628dcc, 0xd38d6e, 0x9e7ba7];
        for (let i = 0; i < 3; i++) {
          const geo = new THREE.IcosahedronGeometry(1.6 + i * 0.35, 2);
          const planet = new THREE.Mesh(
            geo,
            new THREE.MeshStandardMaterial({
              color: planetColors[i],
              roughness: 0.65,
              emissive: planetColors[i],
              emissiveIntensity: 0.15,
              flatShading: true,
            }),
          );
          planet.position.set(c.x + (i - 1) * 8, 13 + i * 1.2, c.y - 7);
          planet.userData.planet = i;
          group.add(planet);
        }
        addPointLight(group, '#ffc29f', 3.2, 26, [c.x, 9, c.y]);
      } else if (biome.id === 'quantum') {
        // Organic luminous beds and suspended probability rings.
        for (let i = 0; i < 18; i++) {
          const a = rng() * Math.PI * 2;
          const r = 15 + rng() * 14;
          const x = c.x + Math.cos(a) * r;
          const z = c.y + Math.sin(a) * r;
          local.add(x, 0.28, z, 0.72, 0.55, 0.72, 0x21634b);
          const bulb = addGlowSprite(group, this.glowTexture, [x, 0.8, z], 0.9 + rng() * 0.6, i % 2 ? '#afffd3' : '#79ffd0', 0.4);
          bulb.userData.pulse = rng() * Math.PI * 2;
        }
        for (let i = 0; i < 3; i++) {
          const torus = new THREE.Mesh(
            new THREE.TorusGeometry(8 + i * 2.2, 0.055, 6, 80),
            new THREE.MeshBasicMaterial({ color: i === 1 ? 0x8affd2 : 0x628dff, transparent: true, opacity: 0.4, toneMapped: false }),
          );
          torus.position.set(c.x, 9 + i * 1.5, c.y);
          torus.rotation.x = Math.PI / 2 + i * 0.2;
          group.add(torus);
        }
        addPointLight(group, '#8dffd1', 4.4, 32, [c.x, 5, c.y]);
      }

      local.build(group, `biome-decor-${biome.id}`);
    }
  }

  private buildMesa(batch: VoxelBatch, x: number, z: number, rng: () => number, biome: BiomeDefinition): void {
    const layers = 3 + Math.floor(rng() * 3);
    for (let layer = 0; layer < layers; layer++) {
      const width = 12 - layer * 1.35;
      const depth = 9 - layer * 0.9;
      batch.add(x, 0.9 + layer * 1.8, z, width, 1.9, depth, layer % 2 ? 0x9b6f47 : 0xc28b54);
    }
    batch.add(x, 0.2, z, 14.5, 0.5, 11, biome.dark);
  }

  private buildThermalPool(batch: VoxelBatch, x: number, z: number, biome: BiomeDefinition): void {
    batch.add(x, 0.12, z, 11.5, 0.2, 8, 0x162e34);
    for (let i = 0; i < 6; i++) {
      batch.add(x + (hash2(i, 2) - 0.5) * 8, 0.22 + i * 0.005, z + (hash2(i, 7) - 0.5) * 5.5, 7 - i * 0.5, 0.12, 4.5, biome.color, {
        glow: true,
        opacity: 0.18,
      });
    }
    for (let i = 0; i < 7; i++) {
      const px = x + (hash2(i, x) - 0.5) * 9;
      const pz = z + (hash2(i, z) - 0.5) * 6;
      addGlowSprite(this.group, this.glowTexture, [px, 0.45, pz], 0.8, '#9bffe6', 0.32);
    }
  }

  private buildFoundryArc(batch: VoxelBatch, center: THREE.Vector2, biome: BiomeDefinition, rng: () => number): void {
    const inward = center.clone().normalize().multiplyScalar(-1);
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      const angle = Math.PI * 0.15 + t * Math.PI * 0.7;
      const x = center.x + inward.x * 26 - Math.cos(angle) * 20;
      const z = center.y + inward.y * 26 - Math.sin(angle) * 8;
      batch.add(x, 0.8 + rng() * 2.2, z, 0.45, 1.6 + rng() * 4.4, 0.45, 0x3d5364);
      batch.add(x, 1.8 + rng() * 1.5, z, 0.16, 0.16, 0.16, biome.color, { glow: true });
    }
  }

  private buildPylon(batch: VoxelBatch, group: THREE.Group, x: number, z: number, biome: BiomeDefinition, index: number): void {
    batch.add(x, 0.2, z, 2.4, 0.4, 2.4, 0x1d2b32);
    for (let i = 0; i < 4; i++) {
      batch.add(x, 1.0 + i * 1.3, z, 0.5, 1.3, 0.5, 0x455e6a);
    }
    batch.add(x, 5.9, z, 2.8, 0.35, 0.35, 0x263a44);
    batch.add(x, 5.9, z, 1.3, 0.18, 0.18, biome.color, { glow: true });
    const arc = addGlowSprite(group, this.glowTexture, [x, 6.2, z], 2.4, biome.accent, 0.4);
    arc.userData.pylon = index;
  }

  private createAmbientLife(): void {
    const rng = seededRandom(91873);
    const glow = this.glowTexture;
    for (let i = 0; i < 46; i++) {
      const biome = BIOMES[Math.floor(rng() * BIOMES.length)];
      const angle = rng() * Math.PI * 2;
      const radius = 12 + rng() * 24;
      const x = biome.center.x + Math.cos(angle) * radius;
      const z = biome.center.y + Math.sin(angle) * radius;
      const y = 1.2 + rng() * 5;
      const color = biome.accent;
      const sprite = addGlowSprite(this.group, glow, [x, y, z], 0.32 + rng() * 0.35, color, 0.32 + rng() * 0.3);
      this.ambient.push({
        sprite,
        origin: new THREE.Vector3(x, y, z),
        phase: rng() * Math.PI * 2,
        speed: 0.14 + rng() * 0.24,
        amplitude: 0.6 + rng() * 1.5,
      });
    }

    const dustCount = 500;
    const positions = new Float32Array(dustCount * 3);
    this.dustOrigin = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const x = (rng() - 0.5) * 180;
      const y = 0.5 + rng() * 18;
      const z = (rng() - 0.5) * 180;
      positions[i * 3] = this.dustOrigin[i * 3] = x;
      positions[i * 3 + 1] = this.dustOrigin[i * 3 + 1] = y;
      positions[i * 3 + 2] = this.dustOrigin[i * 3 + 2] = z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: '#dfeaff',
      size: 0.09,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.dust = new THREE.Points(geometry, material);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  private createClouds(): void {
    const rng = seededRandom(55291);
    this.group.add(this.cloudGroup);
    for (let i = 0; i < 70; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = 30 + rng() * 200;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = -18 - rng() * 28;
      const sprite = addGlowSprite(this.cloudGroup, this.glowTexture, [x, y, z], 18 + rng() * 34, '#b7c9df', 0.06 + rng() * 0.06);
      sprite.material.depthWrite = false;
    }
  }

  private applyShadows(): void {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.receiveShadow = true;
      }
    });
  }

  addCollider(center: THREE.Vector3, size: THREE.Vector3): THREE.Box3 {
    const box = new THREE.Box3().setFromCenterAndSize(center, size);
    this.colliders.push(box);
    return box;
  }

  getBiomeAt(position: THREE.Vector3): BiomeDefinition | null {
    let closest: BiomeDefinition | null = null;
    let closestDistance = 34;
    for (const biome of BIOMES) {
      const d = Math.hypot(position.x - biome.center.x, position.z - biome.center.y);
      if (d < closestDistance) {
        closest = biome;
        closestDistance = d;
      }
    }
    return closest;
  }

  getZoneName(position: THREE.Vector3): string {
    if (Math.hypot(position.x, position.z) < WORLD.hubRadius + 2) return 'The Hall of Constants';
    const biome = this.getBiomeAt(position);
    return biome ? biome.name : 'The Constants Wilds';
  }

  update(dt: number, elapsed: number, playerPosition: THREE.Vector3): void {
    this.elapsed = elapsed;
    const playerLight = this.playerLight;
    playerLight.position.set(playerPosition.x, playerPosition.y + 2.2, playerPosition.z);
    playerLight.intensity = 0.42 + Math.sin(elapsed * 1.1) * 0.06;

    this.coreGroup.children.forEach((child) => {
      if (child.userData.spin) child.rotation.y += dt * child.userData.spin * 0.35;
      if (child instanceof THREE.Mesh && child.geometry instanceof THREE.IcosahedronGeometry) {
        child.rotation.y += dt * 0.09;
        child.rotation.x += dt * 0.025;
      }
    });
    this.coreGroup.position.y = Math.sin(elapsed * 0.45) * 0.16;

    for (const spec of this.ambient) {
      const t = elapsed * spec.speed + spec.phase;
      spec.sprite.position.x = spec.origin.x + Math.sin(t * 1.1) * spec.amplitude;
      spec.sprite.position.y = spec.origin.y + Math.sin(t * 1.7) * 0.42;
      spec.sprite.position.z = spec.origin.z + Math.cos(t * 0.9) * spec.amplitude;
      const pulse = 0.25 + (Math.sin(t * 2.2) * 0.5 + 0.5) * 0.25;
      (spec.sprite.material as THREE.SpriteMaterial).opacity = pulse;
    }

    if (this.dust) {
      const positions = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < positions.count; i++) {
        const base = this.dustOrigin;
        positions.setY(i, base[i * 3 + 1] + Math.sin(elapsed * 0.15 + i * 0.8) * 0.35);
        if (i % 7 === 0) {
          positions.setX(i, base[i * 3] + Math.sin(elapsed * 0.08 + i) * 1.6);
          positions.setZ(i, base[i * 3 + 2] + Math.cos(elapsed * 0.07 + i) * 1.6);
        }
      }
      positions.needsUpdate = true;
    }

    for (const group of this.biomeDecor) {
      group.traverse((child) => {
        if (child.userData.planet !== undefined) {
          child.position.y += Math.sin(elapsed * 0.35 + child.userData.planet) * 0.0008;
          child.rotation.y += dt * 0.045;
        }
        if (child.userData.pylon !== undefined) {
          const mat = (child as THREE.Sprite).material as THREE.SpriteMaterial;
          mat.opacity = 0.26 + Math.sin(elapsed * 2.3 + child.userData.pylon) * 0.12;
        }
        if (child.userData.pulse !== undefined) {
          const mat = (child as THREE.Sprite).material as THREE.SpriteMaterial;
          mat.opacity = 0.22 + Math.sin(elapsed * 1.4 + child.userData.pulse) * 0.1;
        }
      });
    }
    for (const label of this.gateLabels) {
      (label.material as THREE.SpriteMaterial).opacity = 0.9 + Math.sin(elapsed * 0.8) * 0.05;
    }

    this.updateSkyAndLighting(dt, elapsed);
    const active = this.getBiomeAt(playerPosition);
    this.activeBiome = active?.id ?? null;
  }

  private updateSkyAndLighting(dt: number, elapsed: number): void {
    if (this.dayCycleActive) {
      this.timeOfDay = (this.timeOfDay + (dt / this.dayCycleDuration) * 24) % 24;
    }

    // Celestial angle: 0 at 06:00 (Dawn), PI/2 at 12:00 (Noon), PI at 18:00 (Dusk), 3PI/2 at 24:00 (Midnight)
    const angle = ((this.timeOfDay - 6) / 24) * Math.PI * 2;
    const radius = 280;
    const sunX = Math.cos(angle) * radius;
    const sunY = Math.sin(angle) * 190;
    const sunZ = Math.sin(angle * 0.4) * 80 - 30;

    const moonX = -sunX;
    const moonY = -sunY;
    const moonZ = -sunZ;

    this.sunSprite.position.set(sunX, sunY, sunZ);
    this.moonSprite.position.set(moonX, moonY, moonZ);

    const sunDir = new THREE.Vector3(sunX, sunY, sunZ).normalize();
    this.skyMaterial.uniforms.sunDirection.value.copy(sunDir);

    // Sun height factor: -1 (midnight) to +1 (zenith noon)
    const h = sunY / 190;

    // Palette targets for dynamic sky interpolation
    const dayTop = new THREE.Color('#1860a8');
    const dayMid = new THREE.Color('#509be0');
    const dayHorizon = new THREE.Color('#bce2f5');
    const daySun = new THREE.Color('#fffbf0');
    const dayFog = new THREE.Color('#9eccdf');

    const sunsetTop = new THREE.Color('#1d1a38');
    const sunsetMid = new THREE.Color('#6d3257');
    const sunsetHorizon = new THREE.Color('#e06a38');
    const sunsetSun = new THREE.Color('#ffa04d');
    const sunsetFog = new THREE.Color('#603847');

    const nightTop = new THREE.Color('#081020');
    const nightMid = new THREE.Color('#121e34');
    const nightHorizon = new THREE.Color('#1d2d48');
    const nightSun = new THREE.Color('#9dc2ff');
    const nightFog = new THREE.Color('#152236');

    const uniforms = this.skyMaterial.uniforms;
    const fog = this.scene.fog as THREE.FogExp2;

    if (h > 0.15) {
      // Full Day Mode: Radiant, crystal-clear sunlight across all 6 biomes
      const t = clamp((h - 0.15) / 0.85, 0, 1);
      (uniforms.topColor.value as THREE.Color).copy(sunsetTop).lerp(dayTop, t);
      (uniforms.midColor.value as THREE.Color).copy(sunsetMid).lerp(dayMid, t);
      (uniforms.horizonColor.value as THREE.Color).copy(sunsetHorizon).lerp(dayHorizon, t);
      (uniforms.sunColor.value as THREE.Color).copy(sunsetSun).lerp(daySun, t);
      fog.color.copy(sunsetFog).lerp(dayFog, t);
      fog.density = 0.0016;

      // Starfield hidden during day
      (this.starField.material as THREE.PointsMaterial).opacity = 0;

      // Daylight physics
      this.sunLight.position.set(sunX, Math.max(35, sunY), sunZ);
      this.sunLight.color.set('#fffbf0');
      this.sunLight.intensity = 2.2 + t * 0.7; // 2.9 at noon

      this.fillLight.color.set('#82c8ea');
      this.fillLight.intensity = 0.85;

      this.hemiLight.color.set('#bfe0ff');
      this.hemiLight.groundColor.set('#627d60');
      this.hemiLight.intensity = 1.35;

      this.ambientLight.color.set('#607e9e');
      this.ambientLight.intensity = 0.55;

      this.playerLight.intensity = 0.2;

      this.sunSprite.material.opacity = 0.88;
      this.moonSprite.material.opacity = 0.0;
    } else if (h >= -0.15) {
      // Golden Hour / Dawn / Sunset
      const t = (h + 0.15) / 0.3; // 0 (night boundary) to 1 (day boundary)
      const starFade = clamp(1 - t, 0, 1);
      (uniforms.topColor.value as THREE.Color).copy(nightTop).lerp(sunsetTop, t);
      (uniforms.midColor.value as THREE.Color).copy(nightMid).lerp(sunsetMid, t);
      (uniforms.horizonColor.value as THREE.Color).copy(nightHorizon).lerp(sunsetHorizon, t);
      (uniforms.sunColor.value as THREE.Color).copy(nightSun).lerp(sunsetSun, t);
      fog.color.copy(nightFog).lerp(sunsetFog, t);
      fog.density = 0.0017;

      (this.starField.material as THREE.PointsMaterial).opacity = starFade * 0.6;

      this.sunLight.position.set(sunX, Math.max(20, Math.abs(sunY)), sunZ);
      this.sunLight.color.set('#ff9e47');
      this.sunLight.intensity = 1.3 + t * 0.9;

      this.fillLight.color.set('#48688c');
      this.fillLight.intensity = 0.55;

      this.hemiLight.color.set('#ba7d88');
      this.hemiLight.groundColor.set('#362a34');
      this.hemiLight.intensity = 1.05;

      this.ambientLight.color.set('#3a4a5e');
      this.ambientLight.intensity = 0.45;

      this.playerLight.intensity = 0.5;

      this.sunSprite.material.opacity = 0.95;
      this.moonSprite.material.opacity = 0.4;
    } else {
      // Night Mode: Brilliant moonlight, clearly illuminated terrain and stations
      (uniforms.topColor.value as THREE.Color).copy(nightTop);
      (uniforms.midColor.value as THREE.Color).copy(nightMid);
      (uniforms.horizonColor.value as THREE.Color).copy(nightHorizon);
      (uniforms.sunColor.value as THREE.Color).copy(nightSun);
      fog.color.copy(nightFog);
      fog.density = 0.0016;

      // Stars twinkle brilliantly at midnight
      const twinkle = Math.sin(elapsed * 2.8) * 0.08;
      (this.starField.material as THREE.PointsMaterial).opacity = clamp(0.9 + twinkle, 0, 1);

      // Moonlight shines from the Moon's celestial position with crisp illumination!
      this.sunLight.position.set(moonX, Math.max(35, moonY), moonZ);
      this.sunLight.color.set('#b4d5ff');
      this.sunLight.intensity = 1.25;

      this.fillLight.color.set('#36547a');
      this.fillLight.intensity = 0.65;

      this.hemiLight.color.set('#456a9c');
      this.hemiLight.groundColor.set('#243644');
      this.hemiLight.intensity = 0.95;

      this.ambientLight.color.set('#324a66');
      this.ambientLight.intensity = 0.6;

      this.playerLight.intensity = 1.1;
      this.playerLight.distance = 22;
      this.playerLight.color.set('#ffe1aa');

      this.sunSprite.material.opacity = 0.0;
      this.moonSprite.material.opacity = 0.85 + Math.sin(elapsed * 0.5) * 0.05;
    }
  }

  setTimeOfDay(hours: number): void {
    this.timeOfDay = ((hours % 24) + 24) % 24;
  }

  getTimeOfDay(): number {
    return this.timeOfDay;
  }

  setDayCycleActive(active: boolean): void {
    this.dayCycleActive = active;
  }

  isDayCycleActive(): boolean {
    return this.dayCycleActive;
  }

  getActiveBiome(): BiomeId | null {
    return this.activeBiome;
  }

  getSpawnPosition(): THREE.Vector3 {
    return new THREE.Vector3(0, 0.1, 14);
  }
}

function plusJitter(rng: () => number, amount: number): number {
  return (rng() - 0.5) * amount;
}
