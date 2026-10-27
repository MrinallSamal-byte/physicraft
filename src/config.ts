import * as THREE from 'three';

export const WORLD = {
  radius: 116,
  floorY: 0,
  hubRadius: 25,
  biomeRingRadius: 82,
  eyeHeight: 1.68,
  gravity: 9.81,
  tick: 1 / 60,
  maxStationDistance: 7.5,
} as const;

export type BiomeId =
  | 'classical'
  | 'thermo'
  | 'electro'
  | 'optics'
  | 'relativity'
  | 'quantum';

export interface BiomeDefinition {
  id: BiomeId;
  index: number;
  name: string;
  shortName: string;
  discipline: string;
  mentors: string;
  color: number;
  accent: string;
  soft: string;
  dark: string;
  description: string;
  question: string;
  center: THREE.Vector2;
  gateAngle: number;
  glyph: string;
}

const biomeAngles: Record<BiomeId, number> = {
  classical: -Math.PI / 2,
  thermo: -Math.PI / 6,
  electro: Math.PI / 6,
  optics: Math.PI / 2,
  relativity: (5 * Math.PI) / 6,
  quantum: (7 * Math.PI) / 6,
};

function ringPosition(angle: number, radius = WORLD.biomeRingRadius): THREE.Vector2 {
  return new THREE.Vector2(Math.cos(angle), Math.sin(angle)).multiplyScalar(radius);
}

export const BIOMES: BiomeDefinition[] = [
  {
    id: 'classical',
    index: 1,
    name: 'Classical Mechanics Canyon',
    shortName: 'Mechanics Canyon',
    discipline: 'Motion, force & conservation',
    mentors: 'Galileo · Newton',
    color: 0xd99745,
    accent: '#ffc26b',
    soft: '#f6dcae',
    dark: '#2b1b12',
    description: 'Layered sandstone terraces where falling bodies, arcs, collisions, and pendulums reveal the machinery of motion.',
    question: 'How does motion unfold when the rules are counted?',
    center: ringPosition(biomeAngles.classical),
    gateAngle: biomeAngles.classical,
    glyph: '↗',
  },
  {
    id: 'thermo',
    index: 2,
    name: 'Thermodynamics & Fluid Caldera',
    shortName: 'Fluid Caldera',
    discipline: 'Heat, pressure & flow',
    mentors: 'Archimedes · Carnot',
    color: 0x40c9b0,
    accent: '#72ffe5',
    soft: '#c7fff7',
    dark: '#0c2a2a',
    description: 'Steaming basins and sealed glass engines where buoyancy, gas pressure, and flowing air become visible.',
    question: 'What is heat doing when nothing seems to move?',
    center: ringPosition(biomeAngles.thermo),
    gateAngle: biomeAngles.thermo,
    glyph: '≈',
  },
  {
    id: 'electro',
    index: 3,
    name: 'Electromagnetism & Logic Foundry',
    shortName: 'Logic Foundry',
    discipline: 'Charge, fields & induction',
    mentors: 'Faraday · Maxwell',
    color: 0x6d8cff,
    accent: '#a5b9ff',
    soft: '#dce4ff',
    dark: '#101a35',
    description: 'A humming foundry of rivers of charge, copper coils, and magnetic fields you can reach out and bend.',
    question: 'How do unseen fields push and pull the world?',
    center: ringPosition(biomeAngles.electro),
    gateAngle: biomeAngles.electro,
    glyph: 'ϟ',
  },
  {
    id: 'optics',
    index: 4,
    name: 'Optics, Waves & Acoustics Cavern',
    shortName: 'Waves Cavern',
    discipline: 'Light, sound & resonance',
    mentors: 'Huygens · Snell',
    color: 0xd878ff,
    accent: '#f0b7ff',
    soft: '#f9e3ff',
    dark: '#25102e',
    description: 'A dark crystal cavern stitched with laser light, expanding sound rings, and a bridge that sings at certain frequencies.',
    question: 'What does a wave know about the space it travels through?',
    center: ringPosition(biomeAngles.optics),
    gateAngle: biomeAngles.optics,
    glyph: '◇',
  },
  {
    id: 'relativity',
    index: 5,
    name: 'Relativity & Gravity Observatory',
    shortName: 'Gravity Observatory',
    discipline: 'Spacetime & orbits',
    mentors: 'Einstein · Kepler',
    color: 0xff9870,
    accent: '#ffc2a5',
    soft: '#ffe8da',
    dark: '#251712',
    description: 'A quiet observatory above a warped gravity well, where clocks disagree and planets trace the shape of spacetime.',
    question: 'Whose clock is right when everyone is moving?',
    center: ringPosition(biomeAngles.relativity),
    gateAngle: biomeAngles.relativity,
    glyph: '◉',
  },
  {
    id: 'quantum',
    index: 6,
    name: 'Quantum & Modern Physics Sanctum',
    shortName: 'Quantum Sanctum',
    discipline: 'Probability & quanta',
    mentors: 'Planck · Bohr · Young',
    color: 0x53e8a0,
    accent: '#a4ffd1',
    soft: '#d9ffeb',
    dark: '#0b2a1e',
    description: 'A luminous sanctuary where particles interfere with themselves, and light becomes a stream of discrete energy packets.',
    question: 'What happens when possibility becomes measurement?',
    center: ringPosition(biomeAngles.quantum),
    gateAngle: biomeAngles.quantum,
    glyph: '∴',
  },
];

export const BIOME_BY_ID = Object.fromEntries(BIOMES.map((b) => [b.id, b])) as Record<BiomeId, BiomeDefinition>;

export const BIOME_CENTER = (id: BiomeId) => BIOME_BY_ID[id].center;

export const STATION_LAYOUT: Record<string, { offset: [number, number]; focusDistance: number; focusHeight: number }> = {
  'vacuum-drop': { offset: [-15, -9], focusDistance: 12, focusHeight: 6.2 },
  projectile: { offset: [14, -8], focusDistance: 11, focusHeight: 5.2 },
  collision: { offset: [-14, 8], focusDistance: 9.5, focusHeight: 4.5 },
  pendulum: { offset: [14, 10], focusDistance: 12, focusHeight: 6.5 },
  buoyancy: { offset: [-13, -7], focusDistance: 9, focusHeight: 4.8 },
  'gas-piston': { offset: [14, -7], focusDistance: 9, focusHeight: 4.4 },
  bernoulli: { offset: [0, 15], focusDistance: 10, focusHeight: 4.3 },
  ohm: { offset: [-14, -8], focusDistance: 9, focusHeight: 4.6 },
  faraday: { offset: [14, -8], focusDistance: 9.5, focusHeight: 4.4 },
  lorentz: { offset: [0, 15], focusDistance: 10.5, focusHeight: 4.8 },
  snell: { offset: [-15, 7], focusDistance: 9, focusHeight: 3.8 },
  doppler: { offset: [15, 8], focusDistance: 10.5, focusHeight: 4.2 },
  'standing-wave': { offset: [0, -12], focusDistance: 11, focusHeight: 4.4 },
  spacetime: { offset: [-12, -7], focusDistance: 10.5, focusHeight: 5.4 },
  'twin-paradox': { offset: [12, -7], focusDistance: 10, focusHeight: 4.3 },
  'double-slit': { offset: [-12, -7], focusDistance: 9, focusHeight: 3.6 },
  photoelectric: { offset: [12, -7], focusDistance: 9, focusHeight: 4.4 },
};

export const PHYSICS_CONSTANTS = {
  gEarth: 9.81,
  gMoon: 1.62,
  gJupiter: 24.79,
  gZero: 0,
  c: 299_792_458,
  h: 6.626_070_15e-34,
  e: 1.602_176_634e-19,
  eV: 1.602_176_634e-19,
  R: 8.314,
  N_A: 6.022_140_76e23,
  waterDensity: 1000,
  mercuryDensity: 13546,
  goldDensity: 19300,
  potassiumWorkFunction: 2.3,
} as const;

export const STORAGE_KEY = 'grand-physics-sandbox-v1';

export type SurfacePreset = 'vacuum' | 'atmosphere';
export type FrictionPreset = 'frictionless' | 'rough';
export type GravityPreset = 'zero' | 'moon' | 'earth' | 'jupiter' | 'custom';

export const GRAVITY_PRESETS: Record<GravityPreset, { label: string; value: number; short: string }> = {
  zero: { label: 'Zero-G', value: 0, short: '0G' },
  moon: { label: 'Lunar', value: 1.62, short: 'Moon' },
  earth: { label: 'Terrestrial', value: 9.81, short: 'Earth' },
  jupiter: { label: 'Jovian', value: 24.79, short: 'Jupiter' },
  custom: { label: 'Custom field', value: 9.81, short: 'Custom' },
};

export interface EnvironmentState {
  gravity: number;
  gravityPreset: GravityPreset;
  air: SurfacePreset;
  friction: FrictionPreset;
  airDensity: number;
  frictionCoefficient: number;
}

export const DEFAULT_ENVIRONMENT: EnvironmentState = {
  gravity: 9.81,
  gravityPreset: 'earth',
  air: 'atmosphere',
  friction: 'rough',
  airDensity: 1.225,
  frictionCoefficient: 0.55,
};

export const BIOME_TRAVEL_POINTS: Record<BiomeId, THREE.Vector3> = Object.fromEntries(
  BIOMES.map((biome) => {
    const inward = biome.center.clone().normalize().multiplyScalar(-24);
    const point = biome.center.clone().add(inward);
    return [biome.id, new THREE.Vector3(point.x, 2.25, point.y)];
  }),
) as Record<BiomeId, THREE.Vector3>;

export const HUB_TRAVEL_POINT = new THREE.Vector3(0, 2.25, 9);

export function biomePathPoints(biome: BiomeDefinition, samples = 7): THREE.Vector3[] {
  const inner = new THREE.Vector2(0, 0).lerp(biome.center, 0.24);
  const outer = biome.center.clone().multiplyScalar(0.78);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = inner.clone().lerp(outer, t);
    const curve = Math.sin(t * Math.PI) * 5.5;
    const normal = new THREE.Vector2(-biome.center.y, biome.center.x).normalize();
    p.addScaledVector(normal, curve);
    points.push(new THREE.Vector3(p.x, 0, p.y));
  }
  return points;
}
