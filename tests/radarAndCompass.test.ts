import { describe, it, expect } from 'vitest';

describe('Radar Minimap & 360° Compass Calculations', () => {
  const RADAR_RADIUS_M = 48;
  const RADAR_CENTER_PX = 110;
  const RADAR_RADIUS_PX = 96;

  function projectToRadar(x: number, z: number): { u: number; v: number } {
    return {
      u: RADAR_CENTER_PX + (x / RADAR_RADIUS_M) * RADAR_RADIUS_PX,
      v: RADAR_CENTER_PX + (z / RADAR_RADIUS_M) * RADAR_RADIUS_PX,
    };
  }

  it('projects world origin (0, 0) directly to radar center (110, 110)', () => {
    const pt = projectToRadar(0, 0);
    expect(pt.u).toBe(110);
    expect(pt.v).toBe(110);
  });

  it('projects perimeter points accurately within radar circular boundary', () => {
    const north = projectToRadar(0, -RADAR_RADIUS_M);
    expect(north.u).toBe(110);
    expect(north.v).toBe(14); // 110 - 96

    const east = projectToRadar(RADAR_RADIUS_M, 0);
    expect(east.u).toBe(206); // 110 + 96
    expect(east.v).toBe(110);
  });

  describe('Compass Heading & Station Pin Offsets', () => {
    function getBearing(px: number, pz: number, tx: number, tz: number): number {
      const dx = tx - px;
      const dz = tz - pz;
      // In Three.js coordinates, North is -Z, East is +X, South is +Z, West is -X
      let rad = Math.atan2(dx, -dz);
      if (rad < 0) rad += 2 * Math.PI;
      return (rad * 180) / Math.PI;
    }

    it('calculates correct cardinal bearings', () => {
      expect(getBearing(0, 0, 0, -10)).toBeCloseTo(0, 1); // North
      expect(getBearing(0, 0, 10, 0)).toBeCloseTo(90, 1); // East
      expect(getBearing(0, 0, 0, 10)).toBeCloseTo(180, 1); // South
      expect(getBearing(0, 0, -10, 0)).toBeCloseTo(270, 1); // West
    });

    it('computes relative bearing on compass ribbon', () => {
      const playerYaw = 0; // facing North
      const targetBearing = 45; // target is Northeast
      let diff = targetBearing - (playerYaw * 180) / Math.PI;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;

      expect(diff).toBe(45); // target is 45 degrees to the right of center reticle
    });
  });
});
