/**
 * Deep Intuition & Mental Models for all 17 Physics Experiments
 * Provides the "Why It Works", everyday real-world analogies, decoded mathematical
 * formulas, hands-on interactive sandbox challenges, and common misconceptions.
 */

export interface IntuitionGuide {
  id: string;
  stationNumber: string;
  title: string;
  bigQuestion: string;
  analogyTitle: string;
  analogyStory: string;
  physicalMechanism: string;
  equationBreakdown: Array<{ symbol: string; meaning: string; intuition: string }>;
  interactiveThingsToTry: Array<{ action: string; whatHappens: string; why: string }>;
  misconceptions: Array<{ myth: string; reality: string }>;
}

export const INTUITION_BY_ID: Record<string, IntuitionGuide> = {
  'vacuum-drop': {
    id: 'vacuum-drop',
    stationNumber: '1.1',
    title: "Galileo's Vacuum Tower",
    bigQuestion: "Why do a 50 kg anvil and a 0.005 kg feather hit the ground at the exact same millisecond in a vacuum?",
    analogyTitle: "The Heavy Freight Truck vs The Light Scooter",
    analogyStory:
      "Imagine two vehicles: a massive 40-ton semi-truck and a lightweight 50 kg scooter. Gravity acts like a superpower engine: it pulls on the heavy truck with 40,000 Newtons of force, but pulls on the light scooter with only 500 Newtons. However, the truck has 80 times more mass (inertia) to get moving, so it takes 80 times more force to accelerate it! Because force and inertia scale in perfect lockstep, both vehicles accelerate at the exact same rate: 9.81 m/s².",
    physicalMechanism:
      "Newton's Second Law states F = ma, or a = F/m. The gravitational force on any object of mass m near Earth's surface is F_gravity = mg. Substituting this in gives a = (mg) / m = g. The mass m cancels out completely! In an atmosphere, air resistance F_drag = 0.5 * ρ * v² * C_d * A acts upward. Because a feather has enormous surface area relative to its minuscule mass, drag quickly equals its weight, stopping its acceleration at low terminal velocity.",
    equationBreakdown: [
      { symbol: "g", meaning: "Gravitational acceleration (9.81 m/s²)", intuition: "The constant rate at which speed increases every single second of free fall." },
      { symbol: "F_drag", meaning: "Air resistance drag force", intuition: "Collisions with air molecules pushing upward against the falling object." },
      { symbol: "m", meaning: "Inertial and gravitational mass", intuition: "Appears in both weight and inertia—canceling out entirely in free fall." },
      { symbol: "ρ (rho)", meaning: "Air density (1.225 kg/m³)", intuition: "Zero in a vacuum chamber, eliminating all drag forces." },
    ],
    interactiveThingsToTry: [
      { action: "Pull the Vacuum Pump lever to pump out air (ρ = 0)", whatHappens: "The feather stops fluttering and slams into the pressure plate at the exact same instant as the anvil.", why: "Without air molecules, aerodynamic drag is zero; only pure gravitational acceleration g acts on both." },
      { action: "Switch Gravity Preset in the Environment Book to Moon (1.62 m/s²)", whatHappens: "Both objects float downward much slower, hitting together at a lower speed.", why: "Lunar gravity is 1/6th of Earth's, giving a lower acceleration for both masses." },
      { action: "Set Air to Atmosphere and drop from maximum height", whatHappens: "The anvil hits first while the feather drifts gracefully behind.", why: "The feather reaches terminal velocity almost immediately, where upward drag equals its tiny weight." },
    ],
    misconceptions: [
      { myth: "Heavy things fall faster because Earth pulls on them with more gravitational force.", reality: "Earth does pull on heavy things with more force, but heavy things have proportionately more inertia (resistance to acceleration), so both effects cancel out exactly." },
      { myth: "There is no gravity inside a vacuum chamber.", reality: "Gravity is 100% active in a vacuum! Only air molecules have been removed." },
    ],
  },

  'projectile': {
    id: 'projectile',
    stationNumber: '1.2',
    title: 'Projectile Artillery Range',
    bigQuestion: 'Why does firing a bullet horizontally not change the time it takes to hit the floor compared to dropping a bullet from your hand?',
    analogyTitle: 'The Two Elevator Passengers',
    analogyStory:
      'Imagine two coins: one is dropped from your hand at waist height; the other is tossed sideways across a room with immense speed. Both coins begin falling with zero initial vertical velocity. Because gravity only pulls straight downward, it has zero jurisdiction over horizontal speed. Both coins experience identical vertical downward acceleration (g = 9.81 m/s²), covering the vertical distance in the exact same fraction of a second!',
    physicalMechanism:
      'Motion in orthogonal dimensions (X and Y) is completely independent in Newtonian mechanics. The horizontal motion is uniform velocity: x(t) = v₀ cos(θ) t. The vertical motion is constant acceleration: y(t) = y₀ + v₀ sin(θ) t - 0.5 g t². The path traced out is a parabola: y(x) = x tan(θ) - [g / (2 v₀² cos²(θ))] x². Maximum horizontal range occurs at θ = 45° in vacuum.',
    equationBreakdown: [
      { symbol: "v₀", meaning: "Muzzle velocity", intuition: "Initial speed imparted to the cannonball at the moment of firing." },
      { symbol: "θ (theta)", meaning: "Launch pitch angle", intuition: "Splits velocity into horizontal forward push (cos θ) and vertical loft (sin θ)." },
      { symbol: "R = (v₀² sin 2θ) / g", meaning: "Horizontal range formula", intuition: "Shows why 45° maximizes range (sin 90° = 1), and why lunar gravity extends range 6-fold." },
    ],
    interactiveThingsToTry: [
      { action: "Fire at 30° and then at 60° with the same velocity", whatHappens: "Both cannonballs land at the exact same horizontal distance!", why: "Because sin(2 * 30°) = sin(60°) = sin(120°) = sin(2 * 60°). Complementary angles share identical range in vacuum." },
      { action: "Change launch pitch to 45°", whatHappens: "The cannonball reaches the furthest possible point on the artillery range.", why: "45° strikes the optimal mathematical compromise between air time and forward speed." },
      { action: "Set local gravity to Moon (1.62 m/s²)", whatHappens: "The cannonball arcs high into the sky and travels 6 times further across the biome.", why: "Weaker gravity means the ball stays aloft longer (t_flight = 2v_y / g)." },
    ],
    misconceptions: [
      { myth: "A cannonball fired faster stays in the air longer.", reality: "Only the vertical component of velocity (v_y = v₀ sin θ) determines hang time! A fast bullet fired horizontally hits the ground at the exact same instant as a dropped bullet." },
    ],
  },

  'collision': {
    id: 'collision',
    stationNumber: '1.3',
    title: 'Momentum & Collision Track',
    bigQuestion: 'Why can momentum never be destroyed or created, even when kinetic energy is converted into heat or deformation?',
    analogyTitle: 'Newton’s Unbreakable Balance Sheet',
    analogyStory:
      'Think of momentum like money transferred between two bank accounts. When Cart A hits Cart B, Newton’s Third Law guarantees that Cart A exerts a force on Cart B, and Cart B exerts an equal and opposite force on Cart A for the exact same contact time Δt. Force multiplied by time is impulse (Δp = F Δt). Whatever momentum Cart A loses, Cart B gains with penny-perfect precision.',
    physicalMechanism:
      'Total momentum p_total = m₁ v₁ + m₂ v₂ is universally conserved in any closed system without external net forces. In elastic collisions (e.g. Slime blocks, e = 1.0), kinetic energy is also conserved (0.5 m₁ v₁² + 0.5 m₂ v₂²). In inelastic collisions (e.g. Clay/lead blocks, e = 0), objects stick together, conserving momentum while maximum kinetic energy is dissipated into internal thermal energy.',
    equationBreakdown: [
      { symbol: "p = m v", meaning: "Linear momentum (kg·m/s)", intuition: "Quantity of motion: how hard it is to stop an object once it is moving." },
      { symbol: "e", meaning: "Coefficient of restitution (0 to 1)", intuition: "Elasticity ratio: 1.0 for bouncy slime, 0 for sticky clay/putty." },
      { symbol: "Δp = F Δt", meaning: "Impulse-momentum theorem", intuition: "Why airbags save lives: lengthening impact time Δt drastically reduces peak force F." },
    ],
    interactiveThingsToTry: [
      { action: "Set Cart A and Cart B to identical mass (2 kg) and Elasticity to 1.0 (Slime)", whatHappens: "Cart A stops dead in its tracks while Cart B shoots away at Cart A’s exact initial speed.", why: "In equal-mass 1D elastic collisions, velocities swap completely (the Newton's Cradle effect)." },
      { action: "Set Cart A to 6 kg and Cart B to 2 kg with Elasticity 0 (Clay)", whatHappens: "They latch together and glide smoothly forward at 3/4ths of Cart A's initial speed.", why: "p_initial = (6)(v) = (6 + 2)(v_final) -> v_final = 6/8 v = 0.75 v." },
      { action: "Enable Surface Friction in the Environment Book", whatHappens: "Total system momentum slowly declines after the collision.", why: "Friction is an external force acting on the track, transferring momentum to the ground." },
    ],
    misconceptions: [
      { myth: "Kinetic energy is always conserved in collisions.", reality: "Only momentum is always conserved! Kinetic energy is frequently converted into heat, sound, and structural deformation." },
    ],
  },

  'pendulum': {
    id: 'pendulum',
    stationNumber: '1.4',
    title: 'Harmonic Pendulum Clocktower',
    bigQuestion: 'Why does hanging a 10 kg iron bob vs a 1 kg wood bob on a pendulum change its period by zero seconds?',
    analogyTitle: 'The Cosmic Swing Set',
    analogyStory:
      'Think of an adult and a toddler swinging on side-by-side playground swings with equal chain lengths. Even though the adult weighs 5 times more, both swings oscillate in lockstep. The heavier adult is pulled harder by gravity, but their greater body mass requires proportionately more force to accelerate. Just like in Galileo’s drop tower, mass cancels out completely!',
    physicalMechanism:
      'The restoring torque for a simple pendulum is τ = -m g L sin(θ). For small angles (sin θ ≈ θ), the equation of motion is d²θ/dt² + (g/L) θ = 0. The angular frequency is ω = √(g/L), yielding the period T = 2π √(L/g). Notice that bob mass m does not appear in this equation! Period depends solely on length L and gravitational field strength g.',
    equationBreakdown: [
      { symbol: "T = 2π √(L/g)", meaning: "Period of a simple pendulum", intuition: "Time to complete one full forward-and-back swing." },
      { symbol: "L", meaning: "Suspension string length", intuition: "Making string 4 times longer exactly doubles the swing period (√4 = 2)." },
      { symbol: "g", meaning: "Gravitational field strength", intuition: "Weaker gravity (Moon) causes slower, lazy swings." },
    ],
    interactiveThingsToTry: [
      { action: "Double the bob mass from 2 kg to 4 kg", whatHappens: "The period readout doesn't budge by even one hundredth of a second.", why: "Restoring gravitational force and inertial mass increase in identical proportions." },
      { action: "Increase string length from 1.0 m to 4.0 m", whatHappens: "The swing slows down noticeably—the period doubles from ~2.0s to ~4.0s.", why: "Period scales with the square root of length: √(4) / √(1) = 2." },
      { action: "Switch Gravity to Jupiter (24.79 m/s²)", whatHappens: "The pendulum ticks at rapid-fire speed.", why: "Stronger gravity creates a much stiffer restoring force toward the equilibrium point." },
    ],
    misconceptions: [
      { myth: "Pulling a pendulum back further makes it take longer to swing.", reality: "For small to moderate angles, a pendulum is isochronous: larger swings mean higher speeds, so the round-trip period remains nearly identical." },
    ],
  },

  'buoyancy': {
    id: 'buoyancy',
    stationNumber: '2.1',
    title: "Archimedes' Displacement Basin",
    bigQuestion: 'Why can a 100,000-ton steel aircraft carrier float while a 5-gram steel marble sinks immediately?',
    analogyTitle: 'The Hydrostatic Crowd Push',
    analogyStory:
      'Water pressure increases with depth because deeper water has to support the weight of all the water above it. When you submerge a block in water, the water pushing UP against the bottom face is deeper and under higher pressure than the water pushing DOWN on the top face. This pressure difference creates a net upward push: the Buoyant Force. If the block displaces a volume of water whose weight exceeds the block’s total weight, it floats!',
    physicalMechanism:
      'Archimedes’ Principle states that buoyant force F_b = ρ_fluid * V_displaced * g. If the average density of an object ρ_obj < ρ_fluid, buoyant force exceeds gravitational weight when fully submerged, causing the object to bob to the surface until V_submerged / V_total = ρ_obj / ρ_fluid.',
    equationBreakdown: [
      { symbol: "F_b = ρ V g", meaning: "Buoyant force", intuition: "Upward support force equal to the weight of the fluid pushed aside." },
      { symbol: "ρ_fluid", meaning: "Fluid density", intuition: "Water is 1000 kg/m³, Mercury is 13,600 kg/m³ (iron floats on mercury!)." },
      { symbol: "V_displaced", meaning: "Submerged volume", intuition: "The exact volume of fluid pushed out of the way by the object." },
    ],
    interactiveThingsToTry: [
      { action: "Drop Wood (density 600 kg/m³) into Water (1000 kg/m³)", whatHappens: "The wood bobs up and floats with 60% of its volume submerged.", why: "60% displacement equals 100% of the wood cube’s total weight." },
      { action: "Switch fluid to Mercury (13,600 kg/m³) and drop Iron (7800 kg/m³)", whatHappens: "The solid iron block floats like a cork on the silvery mercury surface!", why: "Mercury is nearly twice as dense as iron, so iron displaces more than its weight before sinking." },
      { action: "Set local gravity to Zero-G in the Environment Book", whatHappens: "Buoyancy disappears entirely; objects drift freely inside the fluid.", why: "Without gravity (g = 0), fluid pressure is uniform everywhere, so no upward pressure gradient exists." },
    ],
    misconceptions: [
      { myth: "Heavy things sink and light things float.", reality: "Floating depends entirely on average density, not total weight. A heavy hollow steel ship floats because its overall density (steel + air) is much less than water." },
    ],
  },

  'gas-piston': {
    id: 'gas-piston',
    stationNumber: '2.2',
    title: 'Ideal Gas Law Piston Chamber',
    bigQuestion: 'What actually IS air pressure, and why does compressing a gas heat it up?',
    analogyTitle: 'The Room of Microscopic Billiard Balls',
    analogyStory:
      'Imagine a room filled with thousands of bouncy rubber superballs ricocheting off the walls at 500 meters per second. Every time a ball bounces off a wall, it transfers momentum to that wall. Pressure is simply the collective rhythm of trillions of microscopic impacts every second! When you push the piston inward, the moving piston strikes incoming particles like a swinging tennis racket, adding kinetic energy to them—which we register as higher temperature!',
    physicalMechanism:
      'The Ideal Gas Law PV = nRT unites macroscopic thermodynamics with microscopic statistical mechanics. P = (1/3) * (N/V) * m * v_rms². Halving the volume V doubles the number density (N/V), doubling the collision frequency per unit area on the container walls, thus doubling pressure P. Raising temperature T increases average kinetic energy (0.5 m v_rms² = 1.5 k_B T), making particles hit both faster and harder.',
    equationBreakdown: [
      { symbol: "P", meaning: "Pressure (Pascals)", intuition: "Force per unit area from gas particle impacts on the chamber walls." },
      { symbol: "V", meaning: "Volume (m³)", intuition: "Space available for gas particles to bounce around." },
      { symbol: "T", meaning: "Temperature (Kelvin)", intuition: "Direct measure of the average kinetic energy of the gas particles." },
      { symbol: "n", meaning: "Mole count (particle quantity)", intuition: "Total number of bouncing gas particles in the chamber." },
    ],
    interactiveThingsToTry: [
      { action: "Push the piston down to halve the chamber volume V", whatHappens: "The pressure gauge needle jumps to 2x its previous value.", why: "Boyle's Law: particles hit the smaller wall area twice as frequently." },
      { action: "Ignite the floor heaters to raise Temperature T", whatHappens: "The particles streak across the chamber with fiery trails and pressure rises.", why: "Gay-Lussac's Law: faster particles hit walls with greater momentum and higher frequency." },
      { action: "Inject more particles (increase n)", whatHappens: "Collision frequency and wall pressure increase linearly.", why: "More particles in the same volume means more wall impacts per second." },
    ],
    misconceptions: [
      { myth: "Gas particles push on each other because they are squished like sponges.", reality: "Gas particles are minuscule points separated by vast empty space; pressure is purely dynamic collisions with surfaces." },
    ],
  },

  'bernoulli': {
    id: 'bernoulli',
    stationNumber: '2.3',
    title: "Bernoulli's Wind Tunnel",
    bigQuestion: 'How does an airplane weighing 500 tons stay suspended in thin air?',
    analogyTitle: 'The Highway Traffic Bottleneck & Squeeze',
    analogyStory:
      'Imagine air molecules flowing smoothly across a wing. Because the upper surface is curved and inclined, air flowing over the top must squeeze through a constricted space and accelerate around the curve. When fluid particles speed up, their internal static pressure drops (they trade random outward push for directed forward speed). The higher atmospheric pressure underneath the wing pushes upward toward the low-pressure suction pocket on top, lifting the aircraft into the sky!',
    physicalMechanism:
      'Bernoulli’s Principle states that along a streamline, P + 0.5 ρ v² + ρ g h = constant. Where fluid speed v increases, static pressure P must decrease to conserve total mechanical energy. An airfoil creates an upward lift force L = 0.5 * ρ * v² * S * C_L. By Newton’s Third Law, the wing simultaneously deflects air downward (downwash), and the reaction force pushes the wing upward.',
    equationBreakdown: [
      { symbol: "P + 0.5 ρ v² = const", meaning: "Bernoulli conservation equation", intuition: "Trade-off between static fluid pressure P and dynamic pressure 0.5 ρ v²." },
      { symbol: "C_L", meaning: "Lift coefficient", intuition: "Set by angle of attack and camber of the airfoil." },
      { symbol: "ρ (rho)", meaning: "Air density", intuition: "Why high-altitude flight requires higher ground speeds to generate equal lift." },
    ],
    interactiveThingsToTry: [
      { action: "Increase wind tunnel airspeed from 10 m/s to 40 m/s", whatHappens: "The airfoil lifts vigorously against gravity on its suspension cables.", why: "Lift scales with the square of velocity (v²): 4x speed gives 16x lift force!" },
      { action: "Tilt angle of attack beyond 16° (Stall angle)", whatHappens: "Airflow separates into chaotic turbulent eddies; lift suddenly collapses and the wing drops.", why: "Aerodynamic stall occurs when the air cannot stay attached to the steep upper surface curvature." },
      { action: "Pump chamber to Vacuum in the Environment Book", whatHappens: "Lift drops to absolute zero, no matter how fast the tunnel fans spin.", why: "Lift requires mass density (ρ > 0); in vacuum there is no air to create pressure differentials." },
    ],
    misconceptions: [
      { myth: "Air travels over the top faster because two particles that split at the front must meet at the back at the same time.", reality: "The 'equal transit time' theory is completely false! Air over the top actually arrives at the trailing edge much FASTER than air underneath." },
    ],
  },

  'ohm': {
    id: 'ohm',
    stationNumber: '3.1',
    title: "Ohm's Law Interactive Circuit",
    bigQuestion: 'Why does a phone charger brick get hot when fast-charging?',
    analogyTitle: 'The Mountain Water Cascade',
    analogyStory:
      'Picture an electric circuit as a water pump system. Voltage (V) is the height of the water tower (how hard water is pushed to fall). Current (I) is the gallons of water pouring through per second. Resistance (R) is a narrow, gravel-filled pipe that resists the flow. As electrons squeeze through the resistor, they collide with atomic lattice ions, converting kinetic energy into heat (P = I²R)—which is why phone chargers and toasters warm up!',
    physicalMechanism:
      'Ohm’s Law V = I * R states that current I is directly proportional to potential difference V and inversely proportional to electrical resistance R. At the microscopic level, current density J = σ E = n q v_drift. Power dissipated as heat is P = V * I = I² * R (Joule heating).',
    equationBreakdown: [
      { symbol: "V (Volts)", meaning: "Electrical potential difference", intuition: "Electric pressure pushing electrons through the conductor." },
      { symbol: "I (Amperes)", meaning: "Current (Coulombs per second)", intuition: "Volume flow rate of electrons passing a cross-section per second." },
      { symbol: "R (Ohms, Ω)", meaning: "Electrical resistance", intuition: "Friction faced by moving electrons bumping into crystal lattice atoms." },
      { symbol: "P = I² R", meaning: "Joule heating power", intuition: "Why high current generates exponential thermal heat." },
    ],
    interactiveThingsToTry: [
      { action: "Double the voltage from 6V to 12V while keeping resistance fixed", whatHappens: "Current orbs race twice as fast through the wire; the light bulb glows 4x brighter.", why: "I = V/R doubles, and electrical power P = V²/R quadruples." },
      { action: "Narrow the resistor gate to increase resistance to 100 Ω", whatHappens: "The electron stream slows to a crawl, and the resistor block begins glowing deep red.", why: "High resistance chokes the current while absorbing dissipated thermal power." },
      { action: "Set resistance to near zero (Short Circuit)", whatHappens: "Current spikes to dangerous maximum and circuit breakers trigger.", why: "Without resistance to limit flow, I = V / 0 approaches infinity." },
    ],
    misconceptions: [
      { myth: "Electrons travel at the speed of light through copper wires.", reality: "Individual electrons drift through wire at a sluggish pace—less than 1 millimeter per second! It is the electric FIELD that propagates near the speed of light." },
    ],
  },

  'faraday': {
    id: 'faraday',
    stationNumber: '3.2',
    title: "Faraday's Induction Generator",
    bigQuestion: 'How does spinning a magnet inside copper wire generate the electricity that powers modern cities?',
    analogyTitle: 'The Disturbed Sea of Electrons',
    analogyStory:
      'Copper wire is full of millions of loose valence electrons sitting calmly in a lattice. When a permanent magnet moves past the wire, its moving magnetic field sweeps through the wire, applying a Lorentz force (F = q v x B) that pushes the electrons in a circle. Moving the magnet creates an electric current out of thin air! Stop moving the magnet, and the current vanishes instantly.',
    physicalMechanism:
      "Faraday's Law of Induction states that electromotive force ε = -N * (dΦ_B / dt), where Φ_B = B * A * cos(θ) is magnetic flux. The faster the magnetic field lines cut across the coil turns (dΦ/dt), the higher the induced voltage. Lenz's Law (the negative sign) states that the induced current always flows in a direction whose own magnetic field opposes the original change in flux, ensuring conservation of energy.",
    equationBreakdown: [
      { symbol: "ε (epsilon)", meaning: "Induced EMF / Voltage (Volts)", intuition: "Voltage created purely by relative motion between magnet and coil." },
      { symbol: "N", meaning: "Number of coil turns", intuition: "More loops of copper wire multiply the generated voltage." },
      { symbol: "dΦ_B / dt", meaning: "Rate of magnetic flux change", intuition: "Faster magnet thrusts yield dramatically higher peak currents." },
      { symbol: "Lenz's Law (− sign)", meaning: "Electromagnetic opposition", intuition: "Why generators resist turning when powering heavy electrical loads." },
    ],
    interactiveThingsToTry: [
      { action: "Thrust the magnet rapidly through the center of the coil", whatHappens: "The generator lamp tower lights up brilliantly with bright green arcs.", why: "Rapid motion creates a huge dΦ/dt, maximizing induced voltage ε." },
      { action: "Hold the magnet perfectly still inside the coil", whatHappens: "Current drops to zero immediately and the lamps extinguish.", why: "Even with intense magnetic field inside the coil, dΦ/dt = 0 when velocity is zero." },
      { action: "Switch coil material to high turn-count (N = 800)", whatHappens: "Voltage output multiplies and powers the highest lightbulb rows.", why: "Every individual loop adds its own induced EMF in series." },
    ],
    misconceptions: [
      { myth: "A strong stationary magnet inside a coil will continuously produce power.", reality: "A stationary magnet produces ZERO electricity! Power requires work: you must physically push against electromagnetic back-torque." },
    ],
  },

  'lorentz': {
    id: 'lorentz',
    stationNumber: '3.3',
    title: 'Lorentz Force Particle Accelerator',
    bigQuestion: 'Why does a magnetic field bend the path of charged particles into circles without ever speeding them up or slowing them down?',
    analogyTitle: 'The Steering Wheel That Has No Gas Pedal',
    analogyStory:
      'Imagine driving a car where someone turns the steering wheel sharply to the right, but never touches the gas pedal or brakes. The car curves in a smooth circle, but its speedometer remains locked at 50 km/h. The magnetic Lorentz force acts exactly like this steering wheel: it always pushes at a strict 90-degree right angle to the particle’s motion (F = q v x B). Because force is perpendicular to velocity, it does zero work (W = F · d = 0), changing direction while keeping kinetic energy constant.',
    physicalMechanism:
      'The total electromagnetic force on a charge q is F = q(E + v x B). In a pure magnetic field (E = 0), magnetic force F_B = q(v x B). The magnitude is F = q v B sin(θ), and its direction is determined by the Right-Hand Rule: thumb along velocity v, index finger along magnetic field B, middle finger points in force F (for positive charge; inverted for negative electrons). Equating this to centripetal force m v² / r yields the cyclotron radius: r = (m v) / (q B).',
    equationBreakdown: [
      { symbol: "F = q(v × B)", meaning: "Lorentz magnetic force vector", intuition: "Perpendicular to both particle velocity and magnetic field." },
      { symbol: "r = m v / (q B)", meaning: "Cyclotron orbital radius", intuition: "Faster or heavier particles make wider turns; stronger B makes tighter turns." },
      { symbol: "W = 0", meaning: "Zero magnetic work", intuition: "Magnetic fields can steer charged particles, but never change their speed." },
    ],
    interactiveThingsToTry: [
      { action: "Flip charge polarity from Positive (+q) to Negative (-q)", whatHappens: "The beam curves in the exact opposite direction.", why: "F = (-q)(v x B) points 180° opposite to positive charge deflection." },
      { action: "Increase magnetic field B from 0.5 T to 2.0 T", whatHappens: "The particle trajectory curls into a much tighter circle.", why: "Cyclotron radius r is inversely proportional to magnetic field strength B." },
      { action: "Use the 3D Right-Hand Rule hologram helper", whatHappens: "Align your index and middle fingers to visually predict the target detector hit.", why: "The vector cross product v x B geometrically establishes the deflection plane." },
    ],
    misconceptions: [
      { myth: "A magnetic field accelerates particles to higher speeds.", reality: "Magnetic fields CANNOT increase speed! Accelerators use electric fields (E) to speed particles up, and magnetic fields (B) strictly to steer them." },
    ],
  },

  'snell': {
    id: 'snell',
    stationNumber: '4.1',
    title: "Snell's Laser Labyrinth",
    bigQuestion: 'Why does a straw in a glass of water look broken in half, and why do diamonds sparkle so brilliantly?',
    analogyTitle: 'The Lawnmower Rolling onto Thick Mud',
    analogyStory:
      'Imagine pushing a four-wheeled lawnmower across smooth concrete at an angle toward a patch of thick muddy grass. As it crosses the boundary, the right front wheel hits the grass first and slows down, while the left wheel is still rolling fast on concrete. This speed mismatch causes the entire lawnmower to pivot toward the normal line! When light enters an optically denser medium (like glass or water), its wave crests slow down, causing the wavefront to bend.',
    physicalMechanism:
      'Snell’s Law n₁ sin(θ₁) = n₂ sin(θ₂) governs refraction at optical interfaces. Refractive index n = c / v_medium. When light travels from a dense medium (high n₁) to a rarer medium (low n₂), the beam bends AWAY from the normal. At the Critical Angle θ_c = arcsin(n₂ / n₁), the refracted angle hits 90° (grazing the interface). Any angle steeper than θ_c experiences Total Internal Reflection (TIR), where Fresnel reflectance R = 1.0 (100% of light is reflected as a perfect mirror).',
    equationBreakdown: [
      { symbol: "n = c / v", meaning: "Refractive index", intuition: "How much a medium slows down light (Air=1.0, Water=1.33, Glass=1.5, Diamond=2.42)." },
      { symbol: "n₁ sin θ₁ = n₂ sin θ₂", meaning: "Snell's Law", intuition: "Enforces continuous wave phase velocity along the interface." },
      { symbol: "θ_c = arcsin(n₂ / n₁)", meaning: "Critical angle for Total Internal Reflection", intuition: "The cutoff where light cannot escape and becomes trapped inside." },
      { symbol: "R + T = 1", meaning: "Fresnel energy conservation", intuition: "Sum of reflected energy R and transmitted energy T always equals 100%." },
    ],
    interactiveThingsToTry: [
      { action: "Switch Direction to 'Medium -> Air' using Crown Glass (n = 1.50)", whatHappens: "Sweep incidence angle θ₁ past 41.8°: the refracted beam vanishes and turns into a 100% reflection beam!", why: "41.8° is the exact critical angle arcsin(1.0 / 1.50) for crown glass." },
      { action: "Swap the block material to Diamond (n = 2.417)", whatHappens: "The critical angle shrinks to just 24.4°, trapping almost all light inside with brilliant reflections.", why: "Diamond's massive refractive index makes light bounce around internally multiple times before escaping." },
      { action: "Sweep wavelength λ from 400 nm (violet) to 700 nm (red)", whatHappens: "Violet light bends slightly steeper than red light (Cauchy chromatic dispersion).", why: "Shorter wavelengths encounter slightly higher refractive index, creating rainbow prism separation." },
    ],
    misconceptions: [
      { myth: "Light bends because photons are pulled down by gravity inside glass.", reality: "Refraction is purely wave kinematics: light bends because wave crests travel slower in optically dense materials." },
    ],
  },

  'doppler': {
    id: 'doppler',
    stationNumber: '4.2',
    title: 'Doppler Effect Sonic Speedway',
    bigQuestion: 'Why does an ambulance siren drop in pitch from a high screech to a low moan the instant it speeds past you?',
    analogyTitle: 'The Breadcrumb Thrower on a Train',
    analogyStory:
      'Imagine standing next to a train track. A passenger on a moving train drops a breadcrumb onto the track every 1 second. Because the train is moving toward you, each new breadcrumb is dropped from a location closer to you than the previous one. To you, the breadcrumbs arrive bunched up, closer together in time (higher frequency). Once the train passes and speeds away, it drops each crumb from further away, stretching the distance between them (lower frequency).',
    physicalMechanism:
      'Sound waves travel through the air medium at constant speed c = 343 m/s, regardless of how fast the source moves. When the source moves at speed v_s, the wavefronts in front of the source are compressed into a shorter wavelength λ′ = (c - v_s) / f, producing a higher observed frequency f′ = f * c / (c - v_s). Behind the source, wavefronts are stretched to λ′ = (c + v_s) / f, lowering the observed pitch to f′ = f * c / (c + v_s).',
    equationBreakdown: [
      { symbol: "f′ = f · c/(c ∓ v_s)", meaning: "Doppler shifted frequency formula", intuition: "Minus in denominator for approaching (pitch up); plus for receding (pitch down)." },
      { symbol: "c", meaning: "Speed of sound in air (343 m/s)", intuition: "Wave propagation speed set solely by the air medium." },
      { symbol: "v_s", meaning: "Source vehicle speed", intuition: "Higher speed amplifies the pitch contrast between front and rear." },
    ],
    interactiveThingsToTry: [
      { action: "Drive the siren car at 120 m/s and toggle between 'Ahead' and 'Behind' observers", whatHappens: "The ahead observer hears a sharp high whine (~770 Hz) while the rear observer hears a low drone (~370 Hz).", why: "Wavefronts are squished ahead of the car and dragged out behind it." },
      { action: "Increase speed to near sound speed (v = 300 m/s)", whatHappens: "The wavefront rings ahead pile up into a dense shockwave cone.", why: "Approaching Mach 1 compresses all sound energy into an acoustic pressure barrier." },
    ],
    misconceptions: [
      { myth: "Sound travels faster when emitted from a speeding car.", reality: "Sound wave speed is determined strictly by the medium (air density and temperature). The source’s motion only changes wavelength, never the wave speed!" },
    ],
  },

  'standing-wave': {
    id: 'standing-wave',
    stationNumber: '4.3',
    title: 'Standing-Wave & Resonance Bridge',
    bigQuestion: 'How can soldiers marching in cadence or a gentle crosswind bring down a massive suspension bridge?',
    analogyTitle: 'Pushing a Friend on a Playground Swing',
    analogyStory:
      'If you push a swing randomly at any odd tempo, you end up hitting your friend’s back and canceling the motion. But if you time your pushes to match the natural rhythm of the swing, every tiny push adds constructively, building up a giant arc! A bridge has natural harmonic frequencies. When a driving vibration matches one of these harmonics, waves bouncing off the boundaries interfere constructively, locking stationary nodes in place and amplifying motion to catastrophic levels.',
    physicalMechanism:
      'Standing waves are produced by the superposition of two identical waves traveling in opposite directions (y = 2A sin(kx) cos(ωt)). Fixed boundary conditions at the bridge abutments require displacement to be zero at x = 0 and x = L (nodes). This restricts allowed wavelengths to integer half-wavelengths: L = n * (λ / 2), giving resonant harmonic frequencies f_n = (n / 2L) * √(T / μ). Points of maximum oscillation are called antinodes.',
    equationBreakdown: [
      { symbol: "v = √(T / μ)", meaning: "Wave speed on string", intuition: "Tighter tension T increases speed; heavier cable μ slows it down." },
      { symbol: "f_n = (n/2L) v", meaning: "Harmonic resonant frequency", intuition: "n=1 is the fundamental hum; n=2, 3, 4 adds more stationary nodes." },
      { symbol: "Nodes", meaning: "Zero displacement points", intuition: "Points where incoming and reflected waves always cancel out completely." },
      { symbol: "Antinodes", meaning: "Maximum displacement peaks", intuition: "Points where waves interfere constructively with double amplitude." },
    ],
    interactiveThingsToTry: [
      { action: "Tune driver frequency to the 1st Harmonic (Fundamental, ~40 Hz)", whatHappens: "The entire bridge bows up and down as one giant single loop with zero interior nodes.", why: "n = 1 mode fits exactly one half-wavelength across the span." },
      { action: "Double the frequency to the 2nd Harmonic (~80 Hz)", whatHappens: "A completely still, motionless point appears at the exact center of the bridge while left and right oscillate opposite.", why: "The center is a stationary node: left wave and right wave cancel to zero here." },
      { action: "Increase cable tension T from 400 N to 1200 N", whatHappens: "Resonant frequencies shift upward.", why: "Higher tension raises wave velocity v, requiring faster oscillations to match the spatial span." },
    ],
    misconceptions: [
      { myth: "Standing waves are stationary vibrations that don't travel anywhere.", reality: "Standing waves are formed by continuous traveling waves reflecting back and forth; their interference creates the stationary appearance." },
    ],
  },

  'spacetime': {
    id: 'spacetime',
    stationNumber: '5.1',
    title: 'Spacetime Curvature Grid',
    bigQuestion: 'Why does Earth orbit the Sun if empty space has no strings, chains, or physical connections between them?',
    analogyTitle: 'The Heavy Bowling Ball on a Trampoline',
    analogyStory:
      'Imagine placing a 16-pound bowling ball in the middle of a taut rubber trampoline. The heavy ball sinks into the fabric, creating a deep depression bowl. Now roll a marble across the trampoline. The marble doesn’t curve because the bowling ball is magically reaching out through thin air; the marble curves simply because the fabric it is rolling on is curved! In Einstein’s General Relativity, mass tells spacetime how to curve, and curved spacetime tells mass how to move.',
    physicalMechanism:
      'Einstein Field Equations G_μν = (8πG / c⁴) T_μν describe gravity not as a Newtonian force, but as the curvature of 4D spacetime geometry. Objects in free-fall follow geodesics—the straightest possible paths through curved spacetime. For a circular Keplerian orbit around mass M, orbital velocity is v = √(G M / r), and escape velocity is v_esc = √(2 G M / r). Even massless photons of light follow geodesics, curving around massive stars (gravitational lensing).',
    equationBreakdown: [
      { symbol: "G_μν = 8πG/c⁴ T_μν", meaning: "Einstein Field Equations", intuition: "Geometry of space (left side) is shaped by mass-energy distribution (right side)." },
      { symbol: "v_orbit = √(GM/r)", meaning: "Keplerian orbital velocity", intuition: "Closer planets must orbit much faster to balance gravitational curvature." },
      { symbol: "r_s = 2GM/c²", meaning: "Schwarzschild radius", intuition: "The event horizon of a black hole where spacetime curvature is infinite." },
    ],
    interactiveThingsToTry: [
      { action: "Place a White Dwarf or Black Hole in the center of the grid", whatHappens: "The voxel grid geometry deeply sags and pulls surrounding light beams into curved arcs.", why: "Extreme mass density creates steep curvature gradients in the spacetime manifold." },
      { action: "Launch a planet marble with just enough tangential speed", whatHappens: "It settles into a stable elliptical Keplerian orbit around the celestial core.", why: "The marble follows a frictionless geodesic path through the warped grid depression." },
      { action: "Launch a test particle with speed exceeding v_esc = √(2GM/r)", whatHappens: "It breaks free of the gravitational well and escapes into the outer biome.", why: "Its kinetic energy exceeds the gravitational binding potential energy of the central mass." },
    ],
    misconceptions: [
      { myth: "Planets orbit because they are constantly pulled straight toward the Sun.", reality: "Planets are traveling in straight lines (geodesics) through 4D curved spacetime! It only looks like an ellipse when projected into 3D space." },
    ],
  },

  'twin-paradox': {
    id: 'twin-paradox',
    stationNumber: '5.2',
    title: 'Twin Paradox Relativistic Rail',
    bigQuestion: 'If motion is relative, why does the astronaut twin age slower than the twin who stayed home on Earth?',
    analogyTitle: 'Two Hikers Taking Different Trails Across a Mountain',
    analogyStory:
      'Imagine two friends starting at the base of a mountain and meeting at the summit. Hiker A takes the straight, direct route. Hiker B takes a jagged, winding detour. When they meet at the peak, their pedometers show Hiker B walked more distance. In Special Relativity, spacetime is inverted: the twin who takes the winding, accelerated path through space records LESS elapsed proper time! The astronaut who turned their rocket around aged only 2 years while 20 years passed back home.',
    physicalMechanism:
      'Time dilation is governed by the Lorentz factor γ = 1 / √(1 - v² / c²). An observer moving at speed v relative to an inertial clock measures time dilated as Δt = γ Δτ, where Δτ is the proper time ticked by the onboard clock. The asymmetry between the twins is resolved because the traveling twin MUST accelerate, decelerate, and turn around. This acceleration breaks inertial symmetry, rotating their planes of simultaneity across Minkowski spacetime.',
    equationBreakdown: [
      { symbol: "γ = 1 / √(1 - v²/c²)", meaning: "Lorentz dilation factor", intuition: "Approaches infinity as speed approaches the cosmic speed limit c." },
      { symbol: "Δt = γ Δτ", meaning: "Time dilation equation", intuition: "Moving clocks tick slower relative to stationary observers." },
      { symbol: "L = L₀ / γ", meaning: "Length contraction", intuition: "Distances along the direction of motion physically contract at high fraction of c." },
    ],
    interactiveThingsToTry: [
      { action: "Slide the relativistic rail speed to 0.95c and complete a rail loop", whatHappens: "When the train returns to the station, the Station Clock reads 10:00 while the Onboard Clock reads only 3:07!", why: "At 0.95c, γ ≈ 3.2, so onboard proper time ticks more than 3 times slower than station time." },
      { action: "Observe the station platform from the high-speed railcar", whatHappens: "The station platform visibly squishes and contracts along the direction of travel.", why: "Length contraction physically shortens distances in moving frames of reference." },
    ],
    misconceptions: [
      { myth: "Time dilation is just an optical illusion or clock malfunction.", reality: "Time dilation is an absolute physical fact verified daily by GPS satellites, particle colliders, and atomic clocks on airplanes!" },
    ],
  },

  'double-slit': {
    id: 'double-slit',
    stationNumber: '6.1',
    title: 'Young’s Double-Slit Arena',
    bigQuestion: 'How can a single particle pass through two separate slits at the exact same time and interfere with itself?',
    analogyTitle: 'The Rippling Lake and the Spy Camera',
    analogyStory:
      'Drop a pebble into a calm pond. Ripples spread out in circles. When the wave hits a barrier with two slits, it splits into two circular wave patterns. Where crest meets crest, you get a giant double crest; where crest meets trough, the water goes flat. Light and electrons do the exact same thing! A single electron travels as a wave of probability amplitudes passing through BOTH slits. But the moment you put a detector at the slits to spy on which slit it takes, the wave function collapses and it behaves like a boring classical bullet!',
    physicalMechanism:
      'In quantum mechanics, a particle’s state is described by a wave function Ψ. The probability of detection on the screen is |Ψ₁ + Ψ₂|² = |Ψ₁|² + |Ψ₂|² + 2 Re(Ψ₁* Ψ₂). The cross-term 2 Re(Ψ₁* Ψ₂) produces the alternating bright and dark interference fringes. The fringe spacing is Δy = λ L / d. When an observer detector measures which slit the particle traversed, the superposition collapses, destroying the phase coherence: P = |Ψ₁|² + |Ψ₂|² (yielding two simple classical bands).',
    equationBreakdown: [
      { symbol: "Δy = λ L / d", meaning: "Interference fringe spacing", intuition: "Fringe gap depends on wavelength λ, screen distance L, and slit gap d." },
      { symbol: "Ψ (psi)", meaning: "Quantum probability wave function", intuition: "Interferes with itself as long as its path remains unmeasured." },
      { symbol: "Collapse", meaning: "Wave function measurement collapse", intuition: "Observing which slit was used instantly turns quantum waves into classical lumps." },
    ],
    interactiveThingsToTry: [
      { action: "Turn the Which-Path Detector OFF and fire single particles", whatHappens: "Individual random clicks on the screen slowly build up into neat alternating zebra-stripe fringes.", why: "Each particle’s probability wave interferes with itself through both slits." },
      { action: "Switch the Which-Path Detector ON", whatHappens: "The interference pattern immediately vanishes, replaced by two separate classical pileups.", why: "Measurement forces the particle into a definite position state, destroying quantum superposition." },
      { action: "Increase slit separation d from 40 µm to 160 µm", whatHappens: "The fringe stripes on the phosphor wall pack much tighter together.", why: "Fringe spacing Δy is inversely proportional to slit distance d." },
    ],
    misconceptions: [
      { myth: "The interference pattern only happens when millions of particles bounce off each other.", reality: "Even if you fire only ONE electron per hour, the exact same interference pattern appears over time! Each individual electron interferes with its own wave function." },
    ],
  },

  'photoelectric': {
    id: 'photoelectric',
    stationNumber: '6.2',
    title: 'Photoelectric Effect Solar Vault',
    bigQuestion: 'Why does blindingly intense red light eject zero electrons, whereas even the dimmest ultraviolet light immediately produces electricity?',
    analogyTitle: 'The 5-Dollar Vending Machine',
    analogyStory:
      'Imagine a vending machine that requires a $5 bill to release a snack. You throw in a massive pile of one thousand $1 bills (intense red light). The machine rejects every single one because it needs $5 in a single bill! Then someone walks up and inserts a single crisp $10 bill (a single UV photon). Instantly, the snack drops, and the customer walks away with $5 in change (kinetic energy of the ejected electron)! Light is not a smooth continuous wave; it comes in discrete packets called photons.',
    physicalMechanism:
      'Einstein’s Photoelectric Equation states K_max = h f - Φ = (h c / λ) - Φ. Here, h is Planck’s constant, f is light frequency, and Φ is the work function of the metal (the minimum energy required to liberate an electron from the metal lattice). If photon energy hf < Φ, NO electrons are ejected, no matter how high the light intensity! If hf > Φ, electrons are emitted instantly, with maximum kinetic energy K_max. Increasing light intensity simply ejects more electrons per second, increasing saturation current I.',
    equationBreakdown: [
      { symbol: "E = h f = h c / λ", meaning: "Photon energy quantum", intuition: "Energy of a single light packet depends solely on frequency/color, not brightness." },
      { symbol: "Φ (phi)", meaning: "Work function of the metal", intuition: "Energy toll required to tear an electron free from the cathode plate." },
      { symbol: "K_max = h f − Φ", meaning: "Maximum electron kinetic energy", intuition: "Excess photon energy converted into speed of the ejected photoelectron." },
      { symbol: "V_s = K_max / e", meaning: "Stopping potential", intuition: "Reverse voltage required to push the fastest photoelectrons back to zero current." },
    ],
    interactiveThingsToTry: [
      { action: "Shine 700 nm Red Light onto Potassium at 100% maximum intensity", whatHappens: "Current meter remains stubbornly at 0.00 mA; zero electrons are ejected.", why: "Red photon energy (1.77 eV) is less than Potassium's work function (2.30 eV). Intensity cannot compensate for low photon energy." },
      { action: "Switch to 350 nm UV light at only 10% dim intensity", whatHappens: "Lamps instantly light up and electrons streak across the vacuum gap!", why: "UV photons carry 3.54 eV of energy—well above 2.30 eV—ejecting photoelectrons immediately." },
      { action: "Apply a reverse stopping voltage V_s", whatHappens: "The electric field opposes the electrons, slowing them down until current drops to zero.", why: "When q V_stop equals K_max, even the most energetic electrons cannot reach the anode." },
    ],
    misconceptions: [
      { myth: "Brighter light always knocks out faster electrons.", reality: "Brighter light knocks out MORE electrons, but their speed is determined solely by the color/frequency of the photons!" },
    ],
  },
};
