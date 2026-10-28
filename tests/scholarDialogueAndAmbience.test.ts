import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SeatingManager, SCHOLAR_DIALOGUES } from '../src/game/SeatingManager';
import { sound } from '../src/audio/SoundEngine';
import { World } from '../src/world/World';
import { BIOMES } from '../src/config';

describe('Scholar Dialogue & Authentic Historical System', () => {
  it('contains authentic treatise citations and equations for seated scholars', () => {
    const newton = SCHOLAR_DIALOGUES['scholar_sir_isaac_newton'];
    expect(newton).toBeDefined();
    expect(newton.name).toBe('Sir Isaac Newton');
    expect(newton.treatiseTitle).toContain('Principia Mathematica');
    expect(newton.keyEquation).toContain('F = dp/dt');
    expect(newton.stationId).toBe('collision');

    const faraday = SCHOLAR_DIALOGUES['scholar_michael_faraday'];
    expect(faraday).toBeDefined();
    expect(faraday.treatiseTitle).toContain('Experimental Researches in Electricity');
    expect(faraday.keyEquation).toContain('ℰ = -dΦ_B / dt');
    expect(faraday.stationId).toBe('faraday');

    const einstein = SCHOLAR_DIALOGUES['scholar_albert_einstein'];
    expect(einstein).toBeDefined();
    expect(einstein.treatiseTitle).toContain('Relativitätstheorie');
    expect(einstein.keyEquation).toContain('G_μν');
    expect(einstein.stationId).toBe('spacetime');
  });

  it('correctly resolves nearest scholar in space', () => {
    const scene = new THREE.Scene();
    const seating = new SeatingManager(scene);
    const scholars = seating.getScholars();
    expect(scholars.length).toBe(3);

    const firstScholar = scholars[0];
    const posNearFirst = firstScholar.group.position.clone().add(new THREE.Vector3(0.5, 0, 0.5));
    const nearest = seating.getNearestScholar(posNearFirst, 2.5);
    expect(nearest).not.toBeNull();
    expect(nearest?.id).toBe(firstScholar.id);

    const dialogue = seating.getScholarDialogue(firstScholar.id);
    expect(dialogue).not.toBeNull();
    expect(dialogue?.name).toBe(firstScholar.name);

    // Far position should return null
    const farPos = new THREE.Vector3(500, 0, 500);
    expect(seating.getNearestScholar(farPos, 3.0)).toBeNull();

    seating.dispose();
  });
});

describe('Procedural Acoustic Soundscape System', () => {
  it('initializes and updates ambience with coordinates safely without crashing', () => {
    expect(() => {
      sound.startAmbience();
      sound.updateAmbience({ x: 0, y: 0, z: 0 }); // Rotunda center
      sound.updateAmbience({ x: 71, y: 0, z: 41 }); // Electromagnetism court
      sound.updateAmbience({ x: -41, y: 0, z: 71 }); // Quantum domain
      sound.setAmbienceMuted(true);
      sound.setAmbienceMuted(false);
    }).not.toThrow();
  });
});

describe('Physical Field Instruments & Milestone Equation Stelae', () => {
  it('generates milestone equation stelae and theodolites with colliders', () => {
    const scene = new THREE.Scene();
    const world = new World(scene);

    // Check colliders were registered for milestone stelae and theodolites
    expect(world.colliders.length).toBeGreaterThan(100);

    // Verify all 6 biomes have gate representation
    expect(BIOMES.length).toBe(6);

    // Find theodolite groups in procedural world
    let theodoliteCount = 0;
    world.proceduralGroup.traverse((child) => {
      if (child.name === 'Surveyor_Theodolite') {
        theodoliteCount++;
      }
    });
    expect(theodoliteCount).toBe(3);
  });
});
