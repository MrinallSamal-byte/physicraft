import { PIONEERS, type Pioneer } from './pioneers';

export interface ExperimentSpotlight {
  pioneerId: string;
  whatIsIt: string;
  whatToWatch: string;
  keyTakeaway: string;
}

export const EXPERIMENT_SPOTLIGHTS: Record<string, ExperimentSpotlight> = {
  'vacuum-drop': {
    pioneerId: 'galileo',
    whatIsIt: 'Drop a heavy bronze sphere and a lightweight bird feather inside an evacuated glass tower.',
    whatToWatch: 'In air, the feather drifts slowly; inside the vacuum, the heavy sphere and feather fall and hit the floor at the exact same instant!',
    keyTakeaway: 'In a vacuum, gravity accelerates all objects at the exact same rate (9.81 m/s²), regardless of their mass or size.',
  },
  'projectile': {
    pioneerId: 'tartaglia',
    whatIsIt: 'Aim and fire a brass cannon at varying launch angles to explore parabolic flight paths.',
    whatToWatch: 'Notice that a 45° launch angle shoots the cannonball the furthest distance across the testing field.',
    keyTakeaway: 'Projectiles follow a parabola because horizontal speed stays constant while gravity continuously accelerates downward.',
  },
  'collision': {
    pioneerId: 'newton',
    whatIsIt: 'Roll high-speed carts of different weights into each other to test elastic and inelastic crashes.',
    whatToWatch: 'When a heavy moving cart strikes a stationary light cart, momentum transfers and the light cart shoots forward at high speed.',
    keyTakeaway: 'Total momentum before a collision always equals total momentum after (Conservation of Momentum).',
  },
  'pendulum': {
    pioneerId: 'huygens',
    whatIsIt: 'Swing a suspended brass bob on a flexible cable to discover the secrets of pendulum timekeeping.',
    whatToWatch: 'Shortening the cable makes the pendulum swing faster, but changing how heavy the bob is does not affect its swing time at all!',
    keyTakeaway: 'A pendulum’s swing period depends only on cable length and gravity — making it the foundation of mechanical clocks.',
  },
  'buoyancy': {
    pioneerId: 'archimedes',
    whatIsIt: 'Submerge solid blocks of wood, ice, or stone into a clear liquid reservoir to measure fluid displacement.',
    whatToWatch: 'When you push a block down, watch the displaced water rise; the upward floating push equals the exact weight of water pushed aside.',
    keyTakeaway: 'Any object submerged in fluid experiences an upward buoyant force equal to the weight of fluid it displaces.',
  },
  'gas-piston': {
    pioneerId: 'carnot',
    whatIsIt: 'Heat, cool, and compress a gas-filled cylinder with a movable piston to turn heat into mechanical work.',
    whatToWatch: 'Adding heat expands the gas and pushes the piston up; compressing the gas by adding weights raises its internal temperature.',
    keyTakeaway: 'Heat engines convert thermal energy into mechanical power, bounded by the temperature difference between hot and cold reservoirs.',
  },
  'bernoulli': {
    pioneerId: 'bernoulli',
    whatIsIt: 'Pump fluid through a transparent pipe that narrows in the center to observe fluid speed and pressure.',
    whatToWatch: 'As the liquid speeds up through the narrow throat, the pressure drops drastically — pulling the liquid level downward!',
    keyTakeaway: 'Where fluid velocity increases, static pressure decreases — the core physical mechanism that generates aerodynamic lift.',
  },
  'ohm': {
    pioneerId: 'ohm',
    whatIsIt: 'Send electrical voltage through copper wires, resistors, and tungsten filaments to measure current flow.',
    whatToWatch: 'Increasing voltage pumps more current through the wire; increasing resistance chokes the current and produces heat.',
    keyTakeaway: 'Electric current is directly proportional to voltage and inversely proportional to resistance (V = I · R).',
  },
  'faraday': {
    pioneerId: 'faraday',
    whatIsIt: 'Plunge a powerful neodymium magnet back and forth through a copper wire coil to generate electricity.',
    whatToWatch: 'Moving the magnet faster generates a brighter electrical voltage spike; stopping the magnet drops voltage to zero immediately.',
    keyTakeaway: 'A moving magnetic field induces an electric current — the foundational discovery behind all power plants and electric generators.',
  },
  'lorentz': {
    pioneerId: 'lorentz',
    whatIsIt: 'Shoot a glowing electron beam between magnetic poles and charged deflection plates.',
    whatToWatch: 'Magnetic forces bend the moving electrons sideways at right angles, curving the beam into circular loops without changing its speed.',
    keyTakeaway: 'Magnetic fields push moving electrical charges perpendicularly to both their direction of motion and the magnetic field.',
  },
  'snell': {
    pioneerId: 'snell',
    whatIsIt: 'Fire colored laser beams through air into dense glass and liquid prism blocks.',
    whatToWatch: 'The laser beam bends sharply as it enters the glass because light travels slower in glass than in air.',
    keyTakeaway: 'Light refracts (bends) when transitioning between media because its wave speed changes.',
  },
  'doppler': {
    pioneerId: 'doppler',
    whatIsIt: 'Drive a high-speed acoustic siren and light emitter in a loop around stationary microphones.',
    whatToWatch: 'As the beacon races toward you, the sound pitch rises and light blueshifts; as it speeds away, pitch drops and light redshifts.',
    keyTakeaway: 'Relative motion compresses waves ahead of the source and stretches waves behind it, shifting observed frequency.',
  },
  'standing-wave': {
    pioneerId: 'chladni',
    whatIsIt: 'Vibrate an elastic string with an oscillating driver to discover harmonic standing waves.',
    whatToWatch: 'At specific resonance frequencies, stationary still points (nodes) and large vibrating loops (antinodes) appear along the string.',
    keyTakeaway: 'Reflecting waves combine through interference to produce stationary standing wave patterns at natural resonant frequencies.',
  },
  'spacetime': {
    pioneerId: 'einstein',
    whatIsIt: 'Roll orbiting probes onto a warped spacetime grid depressed by a massive central star.',
    whatToWatch: 'The probe does not orbit because an invisible rope pulls it; it travels in a straight line through curved space that bends its path into an ellipse!',
    keyTakeaway: 'Matter tells spacetime how to curve, and curved spacetime tells matter how to move.',
  },
  'twin-paradox': {
    pioneerId: 'einstein',
    whatIsIt: 'Send an astronaut twin on a high-speed relativistic rocket rail while the Earth twin stays home.',
    whatToWatch: 'As the ship approaches the speed of light, its on-board clock runs much slower; upon return, the traveler is noticeably younger!',
    keyTakeaway: 'Time is relative: moving clocks tick slower relative to stationary observers (relativistic time dilation).',
  },
  'double-slit': {
    pioneerId: 'young',
    whatIsIt: 'Shoot single photons and electrons one-by-one through two narrow parallel slits onto a sensor screen.',
    whatToWatch: 'Even though particles are fired one at a time, they build up a striped wave interference pattern on the detector screen!',
    keyTakeaway: 'Matter and light behave simultaneously as particles and probability waves (Quantum Wave-Particle Duality).',
  },
  'photoelectric': {
    pioneerId: 'planck',
    whatIsIt: 'Shine red, green, and ultraviolet light onto a metal plate to eject electrons and measure photocurrent.',
    whatToWatch: 'Dim UV light knocks electrons free instantly, but intense bright red light produces zero electrons because light arrives in packets (photons).',
    keyTakeaway: 'Light delivers energy in discrete quantum packets called photons; electron ejection depends on photon frequency, not brightness.',
  },
};

export function getExperimentSpotlight(stationId: string): {
  pioneer?: Pioneer;
  whatIsIt: string;
  whatToWatch: string;
  keyTakeaway: string;
} {
  const spotlight = EXPERIMENT_SPOTLIGHTS[stationId];
  if (!spotlight) {
    const pioneer = PIONEERS.find((p) => p.stationId === stationId);
    return {
      pioneer,
      whatIsIt: 'Observe and test this physical apparatus to understand the governing natural laws.',
      whatToWatch: 'Adjust variables and trigger the experiment to see how the system responds.',
      keyTakeaway: 'Physical laws remain invariant under identical laboratory conditions.',
    };
  }

  const pioneer = PIONEERS.find((p) => p.id === spotlight.pioneerId) || PIONEERS.find((p) => p.stationId === stationId);
  return {
    pioneer,
    whatIsIt: spotlight.whatIsIt,
    whatToWatch: spotlight.whatToWatch,
    keyTakeaway: spotlight.keyTakeaway,
  };
}
