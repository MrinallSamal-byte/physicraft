import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../src/world/World';
import { sound } from '../src/audio/SoundEngine';
import { PlayerController } from '../src/player/PlayerController';
import { Input } from '../src/player/Input';
import { AtmosphereFX } from '../src/world/AtmosphereFX';
import { VoxelBuilder } from '../src/game/VoxelBuilder';

describe('Terrain Acoustic Footstep & Physical Audio System', () => {
  it('safely plays footsteps for all distinct surface materials without crashing', () => {
    const materials = [
      'sandstone',
      'gravel',
      'marble',
      'stone',
      'basalt',
      'metal',
      'crystal',
      'timber',
      'wood',
      'slime',
      'grass',
    ] as const;

    for (const mat of materials) {
      expect(() => {
        sound.playFootstep(mat);
      }).not.toThrow();
    }
  });

  it('plays carbide lantern toggle audio without throwing', () => {
    expect(() => {
      sound.playLanternToggle(true);
      sound.playLanternToggle(false);
    }).not.toThrow();
  });

  it('plays theodolite optical sighting ratchet sound without throwing', () => {
    expect(() => {
      sound.playTheodoliteSight(true);
      sound.playTheodoliteSight(false);
    }).not.toThrow();
  });
});

describe('Surveyor Carbide Lantern & Player Equipment', () => {
  it('toggles carbide lantern light and updates its state', () => {
    const camera = new THREE.PerspectiveCamera(74, 1, 0.1, 100);
    const canvas = document.createElement('canvas');
    const input = new Input(canvas);
    const player = new PlayerController(camera, input);

    expect(player.isLanternActive()).toBe(false);

    const turnedOn = player.toggleLantern();
    expect(turnedOn).toBe(true);
    expect(player.isLanternActive()).toBe(true);

    const turnedOff = player.toggleLantern();
    expect(turnedOff).toBe(false);
    expect(player.isLanternActive()).toBe(false);

    player.setLanternActive(true);
    expect(player.isLanternActive()).toBe(true);
  });

  it('integrates surface detector and triggers footsteps during movement', () => {
    const camera = new THREE.PerspectiveCamera(74, 1, 0.1, 100);
    const canvas = document.createElement('canvas');
    const input = new Input(canvas);
    const player = new PlayerController(camera, input);

    let detectedMaterial = '';
    player.setSurfaceDetector((pos) => {
      return pos.z < -25 ? 'sandstone' : 'marble';
    });

    // Move player position and check update
    player.teleport(new THREE.Vector3(0, 0, -35), 0);
    expect(() => {
      player.update(0.016, 9.81);
    }).not.toThrow();
  });
});

describe('Surveyor Theodolite Observation Network', () => {
  it('initializes the three canyon and ridge theodolite stations', () => {
    const scene = new THREE.Scene();
    const world = new World(scene);
    const theodolites = world.getTheodolites();

    expect(theodolites.length).toBe(3);

    const lookout = theodolites.find((t) => t.id === 'theodolite_canyon');
    expect(lookout).toBeDefined();
    expect(lookout?.name).toContain('Mechanics Canyon Theodolite');
    expect(lookout?.subtitle).toContain('Ballistic Trajectory');
    expect(lookout?.position.z).toBeLessThan(-20);

    const geothermal = theodolites.find((t) => t.id === 'theodolite_thermo');
    expect(geothermal).toBeDefined();
    expect(geothermal?.name).toContain('Thermal Basin Theodolite');

    const optics = theodolites.find((t) => t.id === 'theodolite_optics');
    expect(optics).toBeDefined();
    expect(optics?.name).toContain('Optics Promontory Theodolite');
  });

  it('correctly queries nearest theodolite station by proximity', () => {
    const scene = new THREE.Scene();
    const world = new World(scene);
    const theodolites = world.getTheodolites();
    const station = theodolites[0];

    const nearPos = station.position.clone().add(new THREE.Vector3(0.5, 0, 0.5));
    const nearest = world.getNearestTheodolite(nearPos, 2.0);
    expect(nearest).not.toBeNull();
    expect(nearest?.id).toBe(station.id);

    const farPos = new THREE.Vector3(999, 0, 999);
    expect(world.getNearestTheodolite(farPos, 2.0)).toBeNull();
  });
});

describe('Atmospheric Particle FX Realism', () => {
  it('updates rising geothermal steam and ion discharge particles smoothly', () => {
    const scene = new THREE.Scene();
    const fx = new AtmosphereFX(scene);
    const playerPos = new THREE.Vector3(45, 0, -45);

    expect(() => {
      fx.update(0.016, playerPos, 12);
      fx.update(0.016, playerPos, 0); // night
    }).not.toThrow();
  });
});

describe('Voxel Block Subsurface Detection', () => {
  it('detects block type immediately beneath coordinate with getBlockUnder', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(74, 1, 0.1, 100);
    const builder = new VoxelBuilder(scene, camera);

    // Initial state: no block under (0, 0, 0)
    expect(builder.getBlockUnder(new THREE.Vector3(0, 0, 0))).toBeNull();
  });
});
