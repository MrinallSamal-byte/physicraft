import { describe, it, expect } from 'vitest';
import { PIONEERS } from '../src/data/pioneers';
import { EXPERIMENT_SPOTLIGHTS } from '../src/data/experimentSummaries';
import { STATION_LAYOUT } from '../src/config';

describe('Historical Pioneers & Pedagogical Spotlights', () => {
  it('contains verified historical pioneer records in PIONEERS', () => {
    expect(PIONEERS.length).toBeGreaterThanOrEqual(14);

    const pioneerMap = new Map(PIONEERS.map((p) => [p.id, p]));

    for (const pioneer of PIONEERS) {
      expect(pioneer.id).toBeTruthy();
      expect(pioneer.name).toBeTruthy();
      expect(pioneer.lifespan).toBeTruthy();
      expect(pioneer.biome).toBeTruthy();
      expect(pioneer.discovery).toBeTruthy();
      expect(pioneer.year).toBeTruthy();
      expect(pioneer.formula).toBeTruthy();
      expect(pioneer.portrait).toBeTruthy();
      expect(pioneer.significance).toBeTruthy();
      expect(pioneer.stationId).toBeTruthy();
      expect(pioneer.position).toHaveLength(2);
    }

    // Spot check key pioneers
    expect(pioneerMap.get('galileo')?.name).toBe('Galileo Galilei');
    expect(pioneerMap.get('newton')?.name).toBe('Sir Isaac Newton');
    expect(pioneerMap.get('archimedes')?.name).toBe('Archimedes of Syracuse');
    expect(pioneerMap.get('faraday')?.name).toBe('Michael Faraday');
    expect(pioneerMap.get('einstein')?.name).toBe('Albert Einstein');
  });

  it('provides educational spotlights for all 17 experiments', () => {
    const stationIds = Object.keys(STATION_LAYOUT);
    const pioneerIds = new Set(PIONEERS.map((p) => p.id));

    for (const stationId of stationIds) {
      const spotlight = EXPERIMENT_SPOTLIGHTS[stationId];
      expect(spotlight, `Missing spotlight for station: ${stationId}`).toBeDefined();
      expect(spotlight.whatIsIt).toBeTruthy();
      expect(spotlight.whatToWatch).toBeTruthy();
      expect(spotlight.keyTakeaway).toBeTruthy();
      expect(spotlight.pioneerId).toBeTruthy();

      // Ensure pioneerId maps to a valid pioneer in PIONEERS
      expect(pioneerIds.has(spotlight.pioneerId), `Pioneer ID '${spotlight.pioneerId}' not found in PIONEERS`).toBe(true);
    }
  });
});
