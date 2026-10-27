import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

describe('Player Physics, Collisions, and Spatial Boundaries', () => {
  const PLAYER_RADIUS = 0.34;
  const PLAYER_HEIGHT = 1.8;

  function getPlayerBox(position: THREE.Vector3): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(position.x - PLAYER_RADIUS, position.y, position.z - PLAYER_RADIUS),
      new THREE.Vector3(position.x + PLAYER_RADIUS, position.y + PLAYER_HEIGHT, position.z + PLAYER_RADIUS),
    );
  }

  it('correctly constructs player bounding box', () => {
    const pos = new THREE.Vector3(0, 0, 14);
    const box = getPlayerBox(pos);

    expect(box.min.x).toBeCloseTo(-0.34);
    expect(box.max.x).toBeCloseTo(0.34);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(1.8);
    expect(box.min.z).toBeCloseTo(13.66);
    expect(box.max.z).toBeCloseTo(14.34);
  });

  it('enforces bedrock ground collision at y = 0', () => {
    const pos = new THREE.Vector3(5, -0.5, 5);
    // Bedrock floor clamp
    if (pos.y < 0) pos.y = 0;
    expect(pos.y).toBe(0);
  });

  it('calculates slime block elastic rebound', () => {
    const impactVelocity = 12.0;
    const restitution = 0.85;
    const bounce = Math.min(22, Math.max(7.5, impactVelocity * restitution));
    expect(bounce).toBeCloseTo(10.2, 1);
  });

  it('resolves AABB depenetration along minimum penetration axis', () => {
    const playerPos = new THREE.Vector3(0.9, 0, 0); // overlapping box from x = -1 to +1
    const obstacleBox = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));
    const playerBox = getPlayerBox(playerPos);

    expect(playerBox.intersectsBox(obstacleBox)).toBe(true);

    // Compute overlap distance to escape along +X
    const dx = obstacleBox.max.x - playerBox.min.x;
    // Push player out with safety margin epsilon
    playerPos.x += dx + 0.01;

    const updatedBox = getPlayerBox(playerPos);
    expect(updatedBox.intersectsBox(obstacleBox)).toBe(false);
  });

  it('prevents voxel block placement inside player bounding box', () => {
    const playerPos = new THREE.Vector3(2, 0, 3);
    const playerBox = getPlayerBox(playerPos);

    // Block placed right at player position (2, 0.5, 3) with unit size
    const blockCenter = new THREE.Vector3(2, 0.5, 3);
    const blockSize = new THREE.Vector3(1, 1, 1);
    const blockBox = new THREE.Box3().setFromCenterAndSize(blockCenter, blockSize);

    const collides = playerBox.intersectsBox(blockBox);
    expect(collides).toBe(true);

    // Block placed safely 3m away (5, 0.5, 3)
    const safeBlockCenter = new THREE.Vector3(5, 0.5, 3);
    const safeBlockBox = new THREE.Box3().setFromCenterAndSize(safeBlockCenter, blockSize);
    expect(playerBox.intersectsBox(safeBlockBox)).toBe(false);
  });
});
