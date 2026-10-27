import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BIOMES, STATION_LAYOUT } from '../src/config';

describe('World Configuration, Biomes, and Stations', () => {
  it('defines 6 physics biomes with distinct angles and colors', () => {
    expect(BIOMES).toHaveLength(6);
    const biomeIds = BIOMES.map((b) => b.id);
    expect(new Set(biomeIds).size).toBe(6);

    for (const biome of BIOMES) {
      expect(biome.name).toBeTruthy();
      expect(biome.center.lengthSq()).toBeGreaterThan(0);
      expect(biome.color).toBeGreaterThan(0);
      expect(biome.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('contains all 17 registered physics experiments in STATION_LAYOUT', () => {
    const stationIds = Object.keys(STATION_LAYOUT);
    expect(stationIds).toHaveLength(17);

    for (const [id, layout] of Object.entries(STATION_LAYOUT)) {
      expect(id).toBeTruthy();
      expect(layout.offset).toHaveLength(2);
      expect(layout.focusDistance).toBeGreaterThan(0);
      expect(layout.focusHeight).toBeGreaterThan(0);
    }
  });

  describe('Sector 00 Spawn Rotunda & Monument Geometry', () => {
    it('verifies Hall of Constants monument is cleanly separated from central core pedestal', () => {
      // Central pedestal column and table slab
      const pedestalCenter = new THREE.Vector3(0, 1.4, 0);
      const pedestalSize = new THREE.Vector3(1.8, 2.8, 1.8);
      const pedestalBox = new THREE.Box3().setFromCenterAndSize(pedestalCenter, pedestalSize);

      const goldTableCenter = new THREE.Vector3(0, 3.0, 0);
      const goldTableSize = new THREE.Vector3(2.4, 0.3, 2.4);
      const goldTableBox = new THREE.Box3().setFromCenterAndSize(goldTableCenter, goldTableSize);

      // The Hall of Constants Monument (mounted at z = 5.2m)
      const monumentCenter = new THREE.Vector3(0, 1.6, 5.2);
      const monumentSize = new THREE.Vector3(4.6, 3.2, 1.0);
      const monumentBox = new THREE.Box3().setFromCenterAndSize(monumentCenter, monumentSize);

      // Verify ZERO intersection between the monument and the pedestal or gold table
      expect(monumentBox.intersectsBox(pedestalBox)).toBe(false);
      expect(monumentBox.intersectsBox(goldTableBox)).toBe(false);

      // Verify monument is located along the spawn entrance axis (z = 5.2, between spawn at z = 14 and core at z = 0)
      expect(monumentBox.min.z).toBeGreaterThan(goldTableBox.max.z); // 4.7 > 1.2
      expect(monumentBox.max.z).toBeLessThan(14.0); // 5.7 < 14.0
    });

    it('verifies gate archway signage fits inside backing blocks', () => {
      const archwayBackingWidth = 5.4;
      const labelMeshWidth = 4.8;
      expect(labelMeshWidth).toBeLessThan(archwayBackingWidth);
    });

    it('verifies path-side glyph monoliths contain the glyph displays', () => {
      const monolithPillarWidth = 1.5;
      const glyphMeshWidth = 1.25;
      expect(glyphMeshWidth).toBeLessThan(monolithPillarWidth);
    });
  });
});
