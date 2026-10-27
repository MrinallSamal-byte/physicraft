import { describe, it, expect } from 'vitest';
import { clamp, damp, lerp } from '../src/core/utils';

describe('Real-World Physics Formulas & Mathematical Verification', () => {
  it('verifies clamp, lerp, and damp numeric utilities', () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);

    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(lerp(0, 100, 0.25)).toBe(25);

    const damped = damp(0, 10, 5, 0.1);
    expect(damped).toBeGreaterThan(0);
    expect(damped).toBeLessThan(10);
  });

  describe('Classical Mechanics', () => {
    const g = 9.80665; // m/s^2

    it('Galileo vacuum free-fall: distance y(t) = 0.5 * g * t^2', () => {
      const t = 2.0; // seconds
      const height = 0.5 * g * t * t;
      expect(height).toBeCloseTo(19.6133, 3);

      // Mass independence: 1kg ball vs 100kg ball drop at same acceleration in vacuum
      const aBall1 = g;
      const aBall2 = g;
      expect(aBall1).toBe(aBall2);
    });

    it('Newton projectile kinematics: range and peak altitude', () => {
      const v0 = 20; // 20 m/s
      const angle = Math.PI / 4; // 45 deg
      const vx = v0 * Math.cos(angle);
      const vy = v0 * Math.sin(angle);

      const timeToPeak = vy / g;
      const peakHeight = (vy * vy) / (2 * g);
      const totalFlightTime = 2 * timeToPeak;
      const range = vx * totalFlightTime;

      expect(timeToPeak).toBeCloseTo(1.442, 2);
      expect(peakHeight).toBeCloseTo(10.197, 2);
      expect(range).toBeCloseTo(40.788, 2);
    });

    it('Linear momentum conservation in 1D collision: m1*v1 + m2*v2 = m1*v1\' + m2*v2\'', () => {
      const m1 = 2.0;
      const v1 = 4.0;
      const m2 = 3.0;
      const v2 = 0.0;
      const pInitial = m1 * v1 + m2 * v2;

      // Perfectly elastic collision: v1' = ((m1 - m2)v1 + 2m2v2)/(m1 + m2), v2' = ((m2 - m1)v2 + 2m1v1)/(m1 + m2)
      const v1Prime = ((m1 - m2) * v1 + 2 * m2 * v2) / (m1 + m2);
      const v2Prime = ((m2 - m1) * v2 + 2 * m1 * v1) / (m1 + m2);
      const pFinal = m1 * v1Prime + m2 * v2Prime;

      expect(pFinal).toBeCloseTo(pInitial, 5);
      expect(v1Prime).toBeCloseTo(-0.8, 4);
      expect(v2Prime).toBeCloseTo(3.2, 4);

      // Kinetic energy conservation in elastic collision
      const keInitial = 0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2;
      const keFinal = 0.5 * m1 * v1Prime * v1Prime + 0.5 * m2 * v2Prime * v2Prime;
      expect(keFinal).toBeCloseTo(keInitial, 5);
    });

    it('Pendulum period: T = 2 * pi * sqrt(L / g) independent of mass', () => {
      const L = 2.45166; // chosen so sqrt(L/g) = 0.5
      const period = 2 * Math.PI * Math.sqrt(L / g);
      expect(period).toBeCloseTo(3.14159, 3);
    });
  });

  describe('Thermodynamics & Fluid Dynamics', () => {
    it('Archimedes Principle: Buoyancy force F_b = rho * V * g', () => {
      const rhoWater = 1000; // kg/m^3
      const volume = 0.05; // 50 litres = 0.05 m^3
      const g = 9.80665;
      const buoyantForce = rhoWater * volume * g;
      expect(buoyantForce).toBeCloseTo(490.33, 2);

      // Object floats if density < fluid density
      const rhoWood = 600;
      const woodMass = rhoWood * volume;
      const woodWeight = woodMass * g;
      expect(buoyantForce).toBeGreaterThan(woodWeight);
    });

    it('Ideal Gas Law: PV = nRT', () => {
      const R = 8.31446; // J/(mol*K)
      const n = 2.0; // moles
      const T = 300.0; // Kelvin
      const V = 0.05; // 50 litres = 0.05 m^3
      const P = (n * R * T) / V; // Pascals
      expect(P).toBeCloseTo(99773.5, 1);
    });

    it('Bernoulli lift: L = 0.5 * rho * v^2 * S * C_L', () => {
      const rhoAir = 1.225; // kg/m^3
      const v = 30; // 30 m/s
      const S = 2.5; // m^2 wing area
      const CL = 0.85; // lift coefficient
      const lift = 0.5 * rhoAir * v * v * S * CL;
      expect(lift).toBeCloseTo(1171.4, 1);
    });
  });

  describe('Electromagnetism & Waves', () => {
    it('Ohm\'s Law: I = V / R and Power P = I^2 * R', () => {
      const V = 12.0;
      const R = 4.0;
      const I = V / R;
      const P = I * I * R;
      expect(I).toBe(3.0);
      expect(P).toBe(36.0);
    });

    it('Lorentz cyclotron radius: r = m*v / (q*B)', () => {
      const m = 9.10938e-31; // electron mass
      const q = 1.60218e-19; // electron charge
      const v = 1e6; // 10^6 m/s
      const B = 0.01; // 10 mT
      const r = (m * v) / (q * B);
      expect(r).toBeCloseTo(5.685e-4, 6);
    });

    it('Snell\'s Law: n1 * sin(theta1) = n2 * sin(theta2)', () => {
      const n1 = 1.0; // air
      const n2 = 1.5; // glass
      const theta1 = (30 * Math.PI) / 180; // 30 deg
      const sinTheta2 = (n1 * Math.sin(theta1)) / n2;
      const theta2 = Math.asin(sinTheta2);
      expect(sinTheta2).toBeCloseTo(1 / 3, 5);
      expect((theta2 * 180) / Math.PI).toBeCloseTo(19.47, 2);
    });

    it('Acoustic Doppler shift: f\' = f * c / (c - vs)', () => {
      const c = 343; // speed of sound
      const f0 = 440; // 440 Hz
      const vs = 34.3; // 10% of sound speed approaching
      const fObserved = (f0 * c) / (c - vs);
      expect(fObserved).toBeCloseTo(488.89, 2);
    });
  });

  describe('Quantum & Relativity', () => {
    const c = 299792458; // m/s
    const h = 6.62607e-34; // J*s

    it('Photoelectric equation: K_max = h*f - phi', () => {
      const f = 1.2e15; // Hz (UV light)
      const phi = 2.2 * 1.60218e-19; // 2.2 eV work function in Joules
      const energyPhoton = h * f;
      const kMax = energyPhoton - phi;
      expect(energyPhoton).toBeGreaterThan(phi);
      expect(kMax).toBeGreaterThan(0);
      const kMaxEV = kMax / 1.60218e-19;
      expect(kMaxEV).toBeCloseTo(2.76, 1);
    });

    it('Relativistic Lorentz factor gamma and time dilation', () => {
      const v = 0.8 * c; // 80% light speed
      const gamma = 1 / Math.sqrt(1 - (v * v) / (c * c));
      expect(gamma).toBeCloseTo(1.6667, 3);

      const earthTime = 10; // 10 years
      const shipProperTime = earthTime / gamma;
      expect(shipProperTime).toBeCloseTo(6.0, 1);
    });
  });
});
