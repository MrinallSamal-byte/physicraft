/**
 * Procedural 16x16 Pixel-Art Voxel Texture Generator
 * Generates crisp, pixel-perfect voxel block textures in-memory
 * using HTML5 Canvas and THREE.CanvasTexture with NearestFilter.
 */

import * as THREE from 'three';

export type VoxelBlockType =
  | 'grass'
  | 'dirt'
  | 'stone'
  | 'cobblestone'
  | 'planks'
  | 'brick'
  | 'glass'
  | 'glowstone'
  | 'redstone'
  | 'slime'
  | 'iron'
  | 'gold'
  | 'diamond'
  | 'obsidian'
  | 'tnt';

export interface VoxelBlockMeta {
  id: VoxelBlockType;
  name: string;
  category: 'natural' | 'mineral' | 'special';
  lightLevel?: number;
  transparent?: boolean;
  opacity?: number;
  bouncy?: boolean;
  explosive?: boolean;
  color: number;
  hardness: number;
  blastResistance: number;
  density: number; // kg/m^3
  description: string;
  physicsFeatures: string[];
}

export const VOXEL_BLOCKS: Record<VoxelBlockType, VoxelBlockMeta> = {
  grass: {
    id: 'grass',
    name: 'Grass Block',
    category: 'natural',
    color: 0x5ba437,
    hardness: 0.6,
    blastResistance: 0.6,
    density: 1300,
    description: 'Lush organic surface layer with soft soil foundation.',
    physicsFeatures: ['High surface friction (μ = 0.65)', 'Standard terrestrial terrain'],
  },
  dirt: {
    id: 'dirt',
    name: 'Dirt',
    category: 'natural',
    color: 0x866043,
    hardness: 0.5,
    blastResistance: 0.5,
    density: 1400,
    description: 'Compacted arable subsoil with high moisture retention.',
    physicsFeatures: ['Damp acoustic absorption', 'Soft particle yield'],
  },
  stone: {
    id: 'stone',
    name: 'Stone',
    category: 'natural',
    color: 0x7c7c7c,
    hardness: 1.5,
    blastResistance: 6.0,
    density: 2650,
    description: 'Dense metamorphic bedrock with uniform granite grain.',
    physicsFeatures: ['High compressive strength', 'Low elasticity (e = 0.05)'],
  },
  cobblestone: {
    id: 'cobblestone',
    name: 'Cobblestone',
    category: 'natural',
    color: 0x626262,
    hardness: 2.0,
    blastResistance: 6.0,
    density: 2400,
    description: 'Fractured stone masonry with rough, interlocking mortar seams.',
    physicsFeatures: ['High abrasive friction', 'Blast mitigation'],
  },
  planks: {
    id: 'planks',
    name: 'Oak Planks',
    category: 'natural',
    color: 0xb58b53,
    hardness: 2.0,
    blastResistance: 3.0,
    density: 650,
    description: 'Planed timber lumber with cellular cellulose grain.',
    physicsFeatures: ['Floats on water (ρ < 1000 kg/m³)', 'Warm acoustic resonance'],
  },
  brick: {
    id: 'brick',
    name: 'Bricks',
    category: 'mineral',
    color: 0x9a4632,
    hardness: 2.0,
    blastResistance: 6.0,
    density: 1900,
    description: 'Kiln-fired ceramic clay blocks with structural mortar joints.',
    physicsFeatures: ['High heat capacitance', 'Rigid thermal barrier'],
  },
  glass: {
    id: 'glass',
    name: 'Glass',
    category: 'special',
    transparent: true,
    opacity: 0.35,
    color: 0xceeaff,
    hardness: 0.3,
    blastResistance: 0.3,
    density: 2500,
    description: 'Amorphous silica silicate with high optical clarity.',
    physicsFeatures: ['Refracts light (n = 1.50)', 'Low shear resilience'],
  },
  glowstone: {
    id: 'glowstone',
    name: 'Glowstone',
    category: 'special',
    lightLevel: 15,
    color: 0xffd568,
    hardness: 0.3,
    blastResistance: 0.3,
    density: 1800,
    description: 'Phosphorescent nether crystal emitting radiant warm luminescence.',
    physicsFeatures: ['Active point light source (Level 15)', 'Illuminates night biomes'],
  },
  redstone: {
    id: 'redstone',
    name: 'Redstone Block',
    category: 'mineral',
    lightLevel: 7,
    color: 0xd61e1e,
    hardness: 5.0,
    blastResistance: 6.0,
    density: 3200,
    description: 'Permanent redstone power reservoir pulsating with subatomic energy.',
    physicsFeatures: ['Subatomic voltage emitter', 'Conductive signal source'],
  },
  slime: {
    id: 'slime',
    name: 'Slime Block',
    category: 'special',
    bouncy: true,
    transparent: true,
    opacity: 0.8,
    color: 0x73d44c,
    hardness: 0.0,
    blastResistance: 0.0,
    density: 950,
    description: 'Viscoelastic polymer cube with extreme kinetic restitution.',
    physicsFeatures: ['Super-elastic trampoline (e = 0.85)', 'Momentum conservation bounce'],
  },
  iron: {
    id: 'iron',
    name: 'Block of Iron',
    category: 'mineral',
    color: 0xd8d8d8,
    hardness: 5.0,
    blastResistance: 6.0,
    density: 7870,
    description: 'Solid forged metallurgical iron with metallic crystalline bonding.',
    physicsFeatures: ['High mass inertia', 'Conducts magnetic flux (Ferromagnetic)'],
  },
  gold: {
    id: 'gold',
    name: 'Block of Gold',
    category: 'mineral',
    color: 0xf5c538,
    hardness: 3.0,
    blastResistance: 6.0,
    density: 19300,
    description: 'Extremely dense, malleable noble elemental gold block.',
    physicsFeatures: ['Massive gravitational weight', 'High electrical conductivity'],
  },
  diamond: {
    id: 'diamond',
    name: 'Block of Diamond',
    category: 'mineral',
    color: 0x5ce0d8,
    hardness: 5.0,
    blastResistance: 6.0,
    density: 3510,
    description: 'Carbon atoms locked in tetrahedral diamond-lattice crystallization.',
    physicsFeatures: ['Mohs Hardness 10', 'High refractive dispersion (n = 2.42)'],
  },
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian',
    category: 'mineral',
    color: 0x1d142d,
    hardness: 50.0,
    blastResistance: 1200.0,
    density: 2600,
    description: 'Rapidly quenched volcanic glass with near-indestructible blast resilience.',
    physicsFeatures: ['Immune to TNT blast waves', 'Absorbs explosive shockwaves'],
  },
  tnt: {
    id: 'tnt',
    name: 'TNT',
    category: 'special',
    explosive: true,
    color: 0xdb3223,
    hardness: 0.0,
    blastResistance: 0.0,
    density: 1650,
    description: 'Unstable nitrocellulose and trinitrotoluene demolition explosive.',
    physicsFeatures: ['Exothermic shockwave impulse', 'Cascading adjacent chain reaction'],
  },
};

export const BLOCK_PALETTE_ORDER: VoxelBlockType[] = [
  'grass',
  'stone',
  'cobblestone',
  'planks',
  'brick',
  'glass',
  'glowstone',
  'redstone',
  'slime',
  'iron',
  'gold',
  'diamond',
  'obsidian',
  'tnt',
];

function createCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
  }
  return [canvas, ctx];
}

function makeTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// -----------------------------------------------------------------------------
// Pixel Art Generators for each Block Face
// -----------------------------------------------------------------------------

function drawGrassTop(ctx: CanvasRenderingContext2D): void {
  const greens = ['#4d8c2f', '#5ca437', '#3f7324', '#6db843', '#49812b'];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(Math.random() * greens.length);
      ctx.fillStyle = greens[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function drawDirt(ctx: CanvasRenderingContext2D): void {
  const browns = ['#866043', '#704d33', '#573d26', '#9c7353', '#7a5538'];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(Math.random() * browns.length);
      ctx.fillStyle = browns[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function drawGrassSide(ctx: CanvasRenderingContext2D): void {
  drawDirt(ctx);
  // Dripping grass overhang on top
  const greens = ['#4d8c2f', '#5ca437', '#3f7324', '#6db843'];
  for (let x = 0; x < 16; x++) {
    const depth = 2 + Math.floor(Math.sin(x * 1.5) * 1.5 + Math.random() * 1.5);
    for (let y = 0; y < Math.min(depth, 5); y++) {
      const idx = Math.floor(Math.random() * greens.length);
      ctx.fillStyle = greens[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function drawStone(ctx: CanvasRenderingContext2D): void {
  const grays = ['#727272', '#636363', '#808080', '#565656', '#8a8a8a'];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(Math.random() * grays.length);
      ctx.fillStyle = grays[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Subtle darker crevices
  ctx.fillStyle = '#444444';
  for (let i = 0; i < 18; i++) {
    ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
  }
}

function drawCobblestone(ctx: CanvasRenderingContext2D): void {
  drawStone(ctx);
  // Cobble fissures
  ctx.fillStyle = '#363636';
  for (let i = 0; i < 35; i++) {
    const rx = Math.floor(Math.random() * 15);
    const ry = Math.floor(Math.random() * 15);
    ctx.fillRect(rx, ry, 2, 1);
  }
  ctx.fillStyle = '#9e9e9e';
  for (let i = 0; i < 20; i++) {
    const rx = Math.floor(Math.random() * 15);
    const ry = Math.floor(Math.random() * 15);
    ctx.fillRect(rx, ry, 1, 1);
  }
}

function drawPlanks(ctx: CanvasRenderingContext2D): void {
  const woods = ['#b88a53', '#a57944', '#c99b64', '#996f3c'];
  for (let y = 0; y < 16; y++) {
    const plankIdx = Math.floor(y / 4);
    for (let x = 0; x < 16; x++) {
      const idx = (plankIdx + Math.floor(Math.random() * woods.length)) % woods.length;
      ctx.fillStyle = woods[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Plank seam lines
  ctx.fillStyle = '#684a25';
  for (let p = 3; p < 16; p += 4) {
    ctx.fillRect(0, p, 16, 1);
  }
  // Staggered vertical seams & nails
  ctx.fillRect(6, 0, 1, 4);
  ctx.fillRect(12, 4, 1, 4);
  ctx.fillRect(4, 8, 1, 4);
  ctx.fillRect(10, 12, 1, 4);
  ctx.fillStyle = '#422f18';
  ctx.fillRect(1, 1, 1, 1);
  ctx.fillRect(14, 1, 1, 1);
}

function drawBricks(ctx: CanvasRenderingContext2D): void {
  // Mortar background
  ctx.fillStyle = '#d5cdc6';
  ctx.fillRect(0, 0, 16, 16);
  // Bricks running bond
  const reds = ['#9a4632', '#aa4e37', '#8a3d2c', '#b85840'];
  const drawBrick = (bx: number, by: number, bw: number, bh: number) => {
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        ctx.fillStyle = reds[Math.floor(Math.random() * reds.length)];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  };
  // Row 0
  drawBrick(0, 0, 7, 3);
  drawBrick(8, 0, 8, 3);
  // Row 1
  drawBrick(0, 4, 3, 3);
  drawBrick(4, 4, 7, 3);
  drawBrick(12, 4, 4, 3);
  // Row 2
  drawBrick(0, 8, 7, 3);
  drawBrick(8, 8, 8, 3);
  // Row 3
  drawBrick(0, 12, 3, 4);
  drawBrick(4, 12, 7, 4);
  drawBrick(12, 12, 4, 4);
}

function drawGlass(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, 16, 16);
  // Subtle tint
  ctx.fillStyle = 'rgba(215, 240, 255, 0.18)';
  ctx.fillRect(0, 0, 16, 16);
  // Frame border
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.strokeRect(0.5, 0.5, 15, 15);
  // Diagonal glint highlights
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fillRect(3, 3, 2, 1);
  ctx.fillRect(4, 4, 2, 1);
  ctx.fillRect(5, 5, 2, 1);
  ctx.fillRect(11, 9, 2, 1);
  ctx.fillRect(12, 10, 2, 1);
}

function drawGlowstone(ctx: CanvasRenderingContext2D): void {
  const golds = ['#e8bc4a', '#ffd768', '#c49830', '#fff0a0', '#9c751c'];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = golds[Math.floor(Math.random() * golds.length)];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Glowing clusters
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 14; i++) {
    ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
  }
}

function drawRedstone(ctx: CanvasRenderingContext2D): void {
  const crimsons = ['#9e1616', '#c41d1d', '#850f0f', '#e63232', '#700c0c'];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = crimsons[Math.floor(Math.random() * crimsons.length)];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Glowing redstone crystal flecks
  ctx.fillStyle = '#ff8282';
  for (let i = 0; i < 16; i++) {
    ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
  }
}

function drawSlime(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, 16, 16);
  // Translucent jelly outer
  ctx.fillStyle = 'rgba(115, 212, 76, 0.75)';
  ctx.fillRect(0, 0, 16, 16);
  // Inner dark nucleus
  ctx.fillStyle = 'rgba(65, 148, 38, 0.9)';
  ctx.fillRect(4, 4, 8, 8);
  // Border highlight
  ctx.strokeStyle = 'rgba(180, 255, 140, 0.8)';
  ctx.strokeRect(0.5, 0.5, 15, 15);
}

function drawMetalBlock(ctx: CanvasRenderingContext2D, base: string, light: string, dark: string): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 16, 16);
  // Bevel border
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, 16, 1);
  ctx.fillRect(0, 0, 1, 16);
  ctx.fillStyle = dark;
  ctx.fillRect(0, 15, 16, 1);
  ctx.fillRect(15, 0, 1, 16);
  // Inner panel
  ctx.strokeRect(2.5, 2.5, 11, 11);
  // Subtle speckle
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? light : dark;
    ctx.fillRect(2 + Math.floor(Math.random() * 12), 2 + Math.floor(Math.random() * 12), 1, 1);
  }
}

function drawObsidian(ctx: CanvasRenderingContext2D): void {
  const purples = ['#1a1027', '#251736', '#120a1c', '#331d4d', '#0d0714'];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = purples[Math.floor(Math.random() * purples.length)];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Deep crystalline glints
  ctx.fillStyle = '#543282';
  for (let i = 0; i < 14; i++) {
    ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
  }
}

function drawTntSide(ctx: CanvasRenderingContext2D): void {
  // Red explosive sticks
  const reds = ['#db3223', '#c22719', '#ed4234'];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = reds[Math.floor(Math.random() * reds.length)];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // White band in the middle
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 6, 16, 5);
  // "TNT" lettering in pixel art
  ctx.fillStyle = '#0a0a0a';
  // T
  ctx.fillRect(2, 7, 3, 1);
  ctx.fillRect(3, 8, 1, 2);
  // N
  ctx.fillRect(6, 7, 1, 3);
  ctx.fillRect(7, 8, 1, 1);
  ctx.fillRect(8, 7, 1, 3);
  // T
  ctx.fillRect(10, 7, 3, 1);
  ctx.fillRect(11, 8, 1, 2);
}

function drawTntTop(ctx: CanvasRenderingContext2D): void {
  const reds = ['#db3223', '#c22719', '#ed4234'];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = reds[Math.floor(Math.random() * reds.length)];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Central fuse cap
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(6, 6, 4, 4);
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(7, 7, 2, 2);
}

// -----------------------------------------------------------------------------
// Material Cache and Material Builder
// -----------------------------------------------------------------------------

class TextureRegistry {
  private materials = new Map<string, THREE.Material | THREE.Material[]>();
  private textures = new Map<string, THREE.CanvasTexture>();

  getTexture(key: string, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    if (this.textures.has(key)) return this.textures.get(key)!;
    const [canvas, ctx] = createCanvas();
    if (ctx) {
      draw(ctx);
    }
    const texture = makeTexture(canvas);
    this.textures.set(key, texture);
    return texture;
  }

  getMaterial(type: VoxelBlockType): THREE.Material | THREE.Material[] {
    if (this.materials.has(type)) return this.materials.get(type)!;

    const meta = VOXEL_BLOCKS[type];
    let mat: THREE.Material | THREE.Material[];

    switch (type) {
      case 'grass': {
        const topTex = this.getTexture('grass_top', drawGrassTop);
        const sideTex = this.getTexture('grass_side', drawGrassSide);
        const dirtTex = this.getTexture('dirt', drawDirt);
        const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.85, metalness: 0.05 });
        const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.85, metalness: 0.05 });
        const dirtMat = new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 0.9, metalness: 0.05 });
        // Order: right (+X), left (-X), top (+Y), bottom (-Y), front (+Z), back (-Z)
        mat = [sideMat, sideMat, topMat, dirtMat, sideMat, sideMat];
        break;
      }
      case 'dirt': {
        const tex = this.getTexture('dirt', drawDirt);
        mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.05 });
        break;
      }
      case 'stone': {
        const tex = this.getTexture('stone', drawStone);
        mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.1 });
        break;
      }
      case 'cobblestone': {
        const tex = this.getTexture('cobble', drawCobblestone);
        mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, metalness: 0.08 });
        break;
      }
      case 'planks': {
        const tex = this.getTexture('planks', drawPlanks);
        mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.05 });
        break;
      }
      case 'brick': {
        const tex = this.getTexture('brick', drawBricks);
        mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 });
        break;
      }
      case 'glass': {
        const tex = this.getTexture('glass', drawGlass);
        mat = new THREE.MeshPhysicalMaterial({
          map: tex,
          transparent: true,
          opacity: 0.38,
          roughness: 0.1,
          metalness: 0.05,
          transmission: 0.5,
          thickness: 0.6,
          depthWrite: false,
        });
        break;
      }
      case 'glowstone': {
        const tex = this.getTexture('glowstone', drawGlowstone);
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          emissive: 0xffd568,
          emissiveMap: tex,
          emissiveIntensity: 0.85,
          roughness: 0.4,
          metalness: 0.1,
        });
        break;
      }
      case 'redstone': {
        const tex = this.getTexture('redstone', drawRedstone);
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          emissive: 0xcc1818,
          emissiveMap: tex,
          emissiveIntensity: 0.7,
          roughness: 0.5,
          metalness: 0.2,
        });
        break;
      }
      case 'slime': {
        const tex = this.getTexture('slime', drawSlime);
        mat = new THREE.MeshPhysicalMaterial({
          map: tex,
          transparent: true,
          opacity: 0.82,
          roughness: 0.1,
          metalness: 0.05,
          transmission: 0.4,
          thickness: 0.8,
        });
        break;
      }
      case 'iron': {
        const tex = this.getTexture('iron', (ctx) => drawMetalBlock(ctx, '#d8d8d8', '#f2f2f2', '#a8a8a8'));
        mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.85 });
        break;
      }
      case 'gold': {
        const tex = this.getTexture('gold', (ctx) => drawMetalBlock(ctx, '#f5c538', '#ffde68', '#b5881c'));
        mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.9 });
        break;
      }
      case 'diamond': {
        const tex = this.getTexture('diamond', (ctx) => drawMetalBlock(ctx, '#5ce0d8', '#98f8f2', '#2ca8a0'));
        mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0.75, emissive: 0x146b66, emissiveIntensity: 0.2 });
        break;
      }
      case 'obsidian': {
        const tex = this.getTexture('obsidian', drawObsidian);
        mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.3 });
        break;
      }
      case 'tnt': {
        const topTex = this.getTexture('tnt_top', drawTntTop);
        const sideTex = this.getTexture('tnt_side', drawTntSide);
        const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.8, metalness: 0.05 });
        const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.8, metalness: 0.05 });
        mat = [sideMat, sideMat, topMat, topMat, sideMat, sideMat];
        break;
      }
      default: {
        mat = new THREE.MeshStandardMaterial({ color: meta?.color ?? 0xaaaaaa, roughness: 0.8 });
      }
    }

    this.materials.set(type, mat);
    return mat;
  }
}

export const textureRegistry = new TextureRegistry();
