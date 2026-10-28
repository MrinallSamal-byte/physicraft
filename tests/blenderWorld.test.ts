import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  BLENDER_WORLD_MIRROR_Z,
  BLENDER_CAMERAS,
  isBlenderColliderCandidate,
  shouldHideBlenderNode,
} from '../src/world/blenderWorld';
import { isVisibleInHierarchy } from '../src/core/utils';

function box(minY: number, maxY: number, halfX = 1, halfZ = 1): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(-halfX, minY, -halfZ),
    new THREE.Vector3(halfX, maxY, halfZ),
  );
}

describe('Blender world integration helpers', () => {
  it('mirrors the authored Blender scene on Z to match gameplay coordinates', () => {
    expect(BLENDER_WORLD_MIRROR_Z).toBe(-1);
  });

  it('hides the avatar, atmosphere, station markers and duplicate apparatus copies', () => {
    const hidden = [
      'Atmosphere_Volume_Scatter',
      'Celestial_Sky_Ring_Inner',
      'Armature',
      'Wolf3D_Head',
      'Character_Body',
      'Field_Desk',
      'Field_Journal',
      'Field_Calipers',
      'Desk_Quantum_Gyro',
      'Station_VacuumDrop',
      'Galileo_Apparatus',
      'Artillery_Barrel',
      'Trajectory_Dot_03',
      'Pendulum_Bob',
      'Ohm_Coil',
      'Photoelectric_Cell',
      'Double_Slit_Board',
    ];
    for (const name of hidden) {
      expect(shouldHideBlenderNode(name), name).toBe(true);
    }
  });

  it('keeps the unique pioneer memorials and world dressing visible', () => {
    const visible = [
      'Cavendish_Balance',
      'Coulomb_Torsion',
      'Joule_Paddle',
      'Michelson_Interferometer',
      'Rutherford_Foil',
      'Schrodinger_Wave',
      'Schwarzschild_Well',
      'SternGerlach_Magnet',
      'Tesla_Coil',
      'Young_Slits',
      'Foucault_Pendulum',
      'Banner_Motion',
      'Plaque_Constants',
      'Plinth_01',
      'Term_Gravity',
      'Memorial_Gate_North',
      'Brass_Path',
    ];
    for (const name of visible) {
      expect(shouldHideBlenderNode(name), name).toBe(false);
    }
  });

  it('rejects the huge brass floor inlays that cross the spawn point', () => {
    const inlay = box(0.16, 0.4, 15.6, 15.6);
    expect(isBlenderColliderCandidate('Brass_Inlay_15', inlay)).toBe(false);
    // Even without an identifying name, ankle-height plates never block a walker.
    expect(isBlenderColliderCandidate('Mesh_042', inlay)).toBe(false);
  });

  it('rejects effects, overhead geometry and oversized meshes', () => {
    expect(isBlenderColliderCandidate('Particle_Glow', box(0.5, 3))).toBe(false);
    expect(isBlenderColliderCandidate('Walkway_Rail', box(0.5, 3))).toBe(false);
    expect(isBlenderColliderCandidate('Floating_Ornament', box(4, 7))).toBe(false);
    expect(isBlenderColliderCandidate('Grand_Hall', box(0, 6, 40, 40))).toBe(false);
    expect(isBlenderColliderCandidate('Thin_Line', box(0, 3, 0.1, 0.1))).toBe(false);
    expect(isBlenderColliderCandidate('Flat_Slab', box(0.5, 0.65))).toBe(false);
    expect(isBlenderColliderCandidate('', new THREE.Box3())).toBe(false);
  });

  it('accepts solid apparatus and architecture volumes', () => {
    expect(isBlenderColliderCandidate('Plinth_01', box(0, 1.4))).toBe(true);
    expect(isBlenderColliderCandidate('Memorial_Gate_North', box(0, 6, 2.4, 0.4))).toBe(true);
    expect(isBlenderColliderCandidate('Cavendish_Balance', box(0.2, 2.2, 2.8, 2.8))).toBe(true);
  });

  it('exports architectural vantage cameras authored in the Blender scene', () => {
    expect(BLENDER_CAMERAS.length).toBeGreaterThanOrEqual(9);
    const ids = BLENDER_CAMERAS.map((c) => c.id);
    expect(ids).toContain('hero_overview');
    expect(ids).toContain('hall_constants');
    expect(ids).toContain('classical_mechanics');
    expect(ids).toContain('quantum_sanctum');

    for (const cam of BLENDER_CAMERAS) {
      expect(cam.name).toBeTruthy();
      expect(cam.position).toBeInstanceOf(THREE.Vector3);
      expect(cam.target).toBeInstanceOf(THREE.Vector3);
      expect(cam.focalLength).toBeGreaterThan(0);
    }
  });
});

describe('isVisibleInHierarchy', () => {
  it('treats an object as visible when it and all ancestors are visible', () => {
    const root = new THREE.Group();
    const child = new THREE.Mesh();
    root.add(child);
    expect(isVisibleInHierarchy(child)).toBe(true);
  });

  it('detects hidden ancestors, not just the object flag', () => {
    const root = new THREE.Group();
    const branch = new THREE.Group();
    const leaf = new THREE.Mesh();
    root.add(branch);
    branch.add(leaf);
    branch.visible = false;
    expect(leaf.visible).toBe(true);
    expect(isVisibleInHierarchy(leaf)).toBe(false);
    expect(isVisibleInHierarchy(branch)).toBe(false);
  });

  it('handles null safely', () => {
    expect(isVisibleInHierarchy(null)).toBe(false);
  });
});
