import * as THREE from 'three';

/**
 * The Blender master scene was authored with its Z axis pointing the opposite
 * way to the gameplay world. Flipping Z aligns every court, gate, path and
 * apparatus anchor with the procedural layout.
 */
export const BLENDER_WORLD_MIRROR_Z = -1;

/**
 * Nodes that must not appear in Blender mode:
 * - atmosphere / sky-ring meshes that render as opaque black or swallow the island
 * - the Wolf3D avatar and its floating props, which sit on the spawn point
 * - Station_* markers and duplicate apparatus copies; the live game stations
 *   already provide those exhibits (and their colliders)
 */
const HIDDEN_PREFIXES = [
  'Atmosphere_',
  'Celestial_Sky_Ring',
  'Armature',
  'Wolf3D_',
  'Character_',
  'Char_',
  'EyeLeft',
  'EyeRight',
  'Station_',
  'Galileo_',
  'Artillery_',
  'Trajectory_Dot_',
  'Target_',
  'Collision_',
  'Cart_A_',
  'Cart_B_',
  'Pendulum_',
  'Archimedes_',
  'Eureka_',
  'Gas_',
  'Bernoulli_',
  'Aerodynamic_Streamline_',
  'Ohm_',
  'Faraday_',
  'Lorentz_',
  'Electron_Beam_Point_',
  'Snell_',
  'Spectral_',
  'Doppler_',
  'Standing_Wave_',
  'Spacetime_Grid_Well',
  'Twin_Paradox_',
  'Relativistic_Pod',
  'Double_Slit_',
  'Slit_A',
  'Slit_B',
  'Fringe_Band_',
  'Photoelectric_',
  'Photocell_',
  'Potassium_Cathode',
  'Anode_Collector',
  'Retarding_Rheostat',
  'Vacuum_Tube_',
];

/** The avatar's floating field desk is exported as separate root objects. */
const HIDDEN_EXACT = new Set(['Field_Calipers', 'Field_Desk', 'Field_Journal', 'Desk_Quantum_Gyro']);

export function shouldHideBlenderNode(name: string): boolean {
  if (!name) return false;
  if (HIDDEN_EXACT.has(name)) return true;
  return HIDDEN_PREFIXES.some((prefix) => name === prefix || name.startsWith(prefix));
}

/**
 * Effects, floor plates and overhead decorations must not become invisible
 * walls. The floor test in particular keeps the huge brass inlays from
 * ejecting the player at spawn.
 */
const IGNORE_COLLIDER_REGEX =
  /Streamline|Water|Ocean|Atmosphere|Volume|Trigger|Glow|Particle|Ray|Beam|Sky|Fog|Cloud|Wire|Floor|Ground|Base_Disc|Ring|Inlay|Walkway|Path|Court|Globe|Arc|Spark|Flame|Smoke|Steam|Spore|Plume|Laser|Force_|Vector|Vec_|Ellipse|Flora/i;

export function isBlenderColliderCandidate(name: string, box: THREE.Box3): boolean {
  if (box.isEmpty()) return false;
  if (name && IGNORE_COLLIDER_REGEX.test(name)) return false;

  const sizeX = box.max.x - box.min.x;
  const sizeY = box.max.y - box.min.y;
  const sizeZ = box.max.z - box.min.z;

  // Nothing that floats overhead or lies at ankle height can block a walker.
  if (box.min.y > 2.4 || box.max.y <= 0.45) return false;
  if (sizeX > 35 || sizeZ > 35) return false;
  if (sizeX < 0.25 && sizeZ < 0.25) return false;
  if (sizeY < 0.22) return false;

  return true;
}

export interface BlenderCameraVantage {
  id: string;
  name: string;
  position: THREE.Vector3;
  target: THREE.Vector3;
  focalLength: number;
}

/**
 * Handcrafted architectural camera vantages authored directly in the Blender master scene.
 * Coordinates are mapped to gameplay coordinate system (Z mirrored).
 */
export const BLENDER_CAMERAS: BlenderCameraVantage[] = [
  {
    id: 'hero_overview',
    name: 'High Island Vista',
    position: new THREE.Vector3(165.0, 145.0, 185.0),
    target: new THREE.Vector3(0, 5, 0),
    focalLength: 28,
  },
  {
    id: 'hall_constants',
    name: 'The Hall of Constants Rotunda',
    position: new THREE.Vector3(0, 4.2, 18.0),
    target: new THREE.Vector3(0, 4.5, 0),
    focalLength: 35,
  },
  {
    id: 'classical_mechanics',
    name: 'Classical Mechanics Canyon',
    position: new THREE.Vector3(-22.0, 18.0, 110.0),
    target: new THREE.Vector3(0, 5, 82),
    focalLength: 32,
  },
  {
    id: 'quantum_sanctum',
    name: 'Quantum Domain Sanctum',
    position: new THREE.Vector3(-52.0, 16.0, 22.0),
    target: new THREE.Vector3(-41, 4, 71),
    focalLength: 28,
  },
  {
    id: 'electro_foundry',
    name: 'Electromagnetism Foundry',
    position: new THREE.Vector3(52.0, 8.5, -24.0),
    target: new THREE.Vector3(71, 4, 41),
    focalLength: 32,
  },
  {
    id: 'optics_cavern',
    name: 'Wave Optics Cavern',
    position: new THREE.Vector3(24.0, 14.0, -60.0),
    target: new THREE.Vector3(0, 4, -82),
    focalLength: 30,
  },
  {
    id: 'relativity_observatory',
    name: 'Relativity Observatory',
    position: new THREE.Vector3(-54.0, 16.0, -24.0),
    target: new THREE.Vector3(-71, 4, -41),
    focalLength: 32,
  },
  {
    id: 'armillary_vista',
    name: 'Armillary Sphere Vista',
    position: new THREE.Vector3(0, 3.2, 16.0),
    target: new THREE.Vector3(0, 3.5, 0),
    focalLength: 32,
  },
  {
    id: 'tesla_coil',
    name: 'Tesla High-Voltage Pylon',
    position: new THREE.Vector3(-40.8, 2.4, -29.5),
    target: new THREE.Vector3(-41, 8, -30),
    focalLength: 24,
  },
];
