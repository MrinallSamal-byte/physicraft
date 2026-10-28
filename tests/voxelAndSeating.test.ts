import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { VoxelBuilder } from '../src/game/VoxelBuilder';
import { SeatingManager } from '../src/game/SeatingManager';
import { PlayerController } from '../src/player/PlayerController';
import { Input } from '../src/player/Input';

describe('VoxelBuilder System', () => {
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let builder: VoxelBuilder;

  beforeEach(() => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
    camera.position.set(0, 1.68, 5);
    camera.lookAt(0, 0, 0);
    builder = new VoxelBuilder(scene, camera);
  });

  it('correctly places blocks with flush ground Y-alignment', () => {
    // Integer y=0 should place centered at y=0.5 (flush with bedrock floor y=0)
    builder.placeAt(0, 0, 0, 'grass');
    const blocks = builder.getAllPlacedBlocks();
    expect(blocks.length).toBe(1);
    expect(blocks[0].position.y).toBe(0.5);
    expect(blocks[0].collider.min.y).toBe(0.0);
    expect(blocks[0].collider.max.y).toBe(1.0);

    // Stacking a block on top: integer y=1 should place centered at y=1.5
    builder.placeAt(0, 1, 0, 'stone');
    const updated = builder.getAllPlacedBlocks();
    expect(updated.length).toBe(2);
    const topBlock = updated.find((b) => b.type === 'stone');
    expect(topBlock).toBeDefined();
    expect(topBlock!.position.y).toBe(1.5);
    expect(topBlock!.collider.min.y).toBe(1.0);
    expect(topBlock!.collider.max.y).toBe(2.0);
  });

  it('correctly detects slime block contact spatially', () => {
    builder.placeAt(3, 0, 3, 'slime');
    const placed = builder.getAllPlacedBlocks()[0];
    expect(placed.type).toBe('slime');

    // Player standing directly on top of the slime block (feet at y=1.0)
    const onSlime = builder.isStandingOnSlime(new THREE.Vector3(3.1, 1.0, 3.0));
    expect(onSlime).toBe(true);

    // Player standing far away
    const notOnSlime = builder.isStandingOnSlime(new THREE.Vector3(0, 0, 0));
    expect(notOnSlime).toBe(false);
  });

  it('mines blocks cleanly and updates collection count', () => {
    builder.placeAt(1, 0, 1, 'planks');
    expect(builder.getAllPlacedBlocks().length).toBe(1);

    const broke = builder.breakAt(1, 0, 1);
    expect(broke).toBe(true);
    expect(builder.getAllPlacedBlocks().length).toBe(0);
  });

  it('targets ground plane via fallback when pointing at empty terrain', () => {
    // Camera at standing height pointing down at ground plane
    camera.position.set(0, 1.68, 4);
    camera.lookAt(0, 0, 0);
    builder.updateTargeting([]);

    const info = builder.getTargetingInfo();
    expect(info.place).not.toBeNull();
    expect(info.place!.y).toBe(0.5); // Flush with ground surface
  });
});

describe('SeatingManager & Scholar Theorist System', () => {
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let canvas: HTMLCanvasElement;
  let input: Input;
  let player: PlayerController;
  let seating: SeatingManager;

  beforeEach(() => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(74, 1, 0.1, 100);
    canvas = document.createElement('canvas');
    input = new Input(canvas);
    player = new PlayerController(camera, input);
    seating = new SeatingManager(scene);
    seating.setPlayerRef(player);
  });

  it('initializes 6 Hall of Constants desks and overlook benches', () => {
    const seats = seating.getAllSeats();
    expect(seats.length).toBeGreaterThanOrEqual(9);

    const hallDesks = seats.filter((s) => s.id.startsWith('hall_desk_'));
    expect(hallDesks.length).toBe(6);

    const overcomes = seats.filter((s) => s.id.startsWith('overlook_'));
    expect(overcomes.length).toBe(3);
  });

  it('places animated theorist scholars at desks 1, 3, and 5', () => {
    const scholars = seating.getScholars();
    expect(scholars.length).toBe(3);

    const names = scholars.map((s) => s.name);
    expect(names).toContain('Sir Isaac Newton');
    expect(names).toContain('Michael Faraday');
    expect(names).toContain('Albert Einstein');

    // Desks 1, 3, 5 are occupied by scholars
    const seats = seating.getAllSeats();
    const desk1 = seats.find((s) => s.id === 'hall_desk_1');
    const desk3 = seats.find((s) => s.id === 'hall_desk_3');
    const desk5 = seats.find((s) => s.id === 'hall_desk_5');
    expect(desk1?.occupied).toBe(true);
    expect(desk3?.occupied).toBe(true);
    expect(desk5?.occupied).toBe(true);

    // Desks 0, 2, 4 are open for the player
    const desk0 = seats.find((s) => s.id === 'hall_desk_0');
    expect(desk0?.occupied).toBe(false);
  });

  it('allows the player to sit and stand interactively', () => {
    const seats = seating.getAllSeats();
    const openDesk = seats.find((s) => !s.occupied)!;

    // Sit down
    const sat = seating.sit(openDesk);
    expect(sat).toBe(true);
    expect(seating.isPlayerSeated()).toBe(true);
    expect(seating.getCurrentSeat()?.id).toBe(openDesk.id);
    expect(player.isSeated).toBe(true);

    // Stand up
    seating.stand();
    expect(seating.isPlayerSeated()).toBe(false);
    expect(player.isSeated).toBe(false);
  });

  it('updates scholar breathing, glancing, and gyroscope animations', () => {
    const scholar = seating.getScholars()[2]; // Albert Einstein
    const initialBreath = scholar.breathePhase;

    seating.update(0.1, 12.0);

    expect(scholar.breathePhase).toBeGreaterThan(initialBreath);
    if (scholar.gyroscopeRings && scholar.gyroscopeRings.length >= 3) {
      expect(scholar.gyroscopeRings[0].rotation.y).not.toBe(0);
    }
  });
});
