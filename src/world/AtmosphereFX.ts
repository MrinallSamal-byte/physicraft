/**
 * Atmospheric Particles & Realistic Environmental FX
 * Simulates gentle drifting sunbeam motes, stardust embers, and floating pollen
 * around the player and the central rotunda, bringing the world to life.
 */

import * as THREE from 'three';

export class AtmosphereFX {
  readonly points: THREE.Points;
  readonly steamPoints: THREE.Points;
  readonly sparkPoints: THREE.Points;
  private readonly count = 480;
  private readonly steamCount = 90;
  private readonly sparkCount = 45;

  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly baseColors: Float32Array;
  private readonly colorAttribute: THREE.BufferAttribute;
  private readonly positionAttribute: THREE.BufferAttribute;

  private readonly steamPositions: Float32Array;
  private readonly steamPositionAttr: THREE.BufferAttribute;
  private readonly steamOrigins: Float32Array;

  private readonly sparkPositions: Float32Array;
  private readonly sparkPositionAttr: THREE.BufferAttribute;

  private clock = 0;

  constructor(scene: THREE.Scene) {
    // -------------------------------------------------------------------------
    // 1. Atmospheric Ambient Motes
    // -------------------------------------------------------------------------
    const geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.baseColors = new Float32Array(this.count * 3);

    const radius = 42;
    for (let i = 0; i < this.count; i++) {
      const idx = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.6) * radius;

      this.positions[idx] = Math.cos(angle) * r;
      this.positions[idx + 1] = 0.3 + Math.random() * 8.5; // Float from ground up to 8.5m
      this.positions[idx + 2] = Math.sin(angle) * r;

      this.velocities[idx] = (Math.random() - 0.5) * 0.25;
      this.velocities[idx + 1] = 0.08 + Math.random() * 0.18; // Gentle upward thermal drift
      this.velocities[idx + 2] = (Math.random() - 0.5) * 0.25;

      // Base daylight warm golden sunlight mote
      this.baseColors[idx] = 1.0;
      this.baseColors[idx + 1] = 0.88 + Math.random() * 0.12;
      this.baseColors[idx + 2] = 0.6 + Math.random() * 0.3;
    }

    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3);
    this.colorAttribute = new THREE.BufferAttribute(this.baseColors, 3);
    geometry.setAttribute('position', this.positionAttribute);
    geometry.setAttribute('color', this.colorAttribute);

    // Soft round particle texture
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1.0)');
      grad.addColorStop(0.35, 'rgba(255,240,200,0.75)');
      grad.addColorStop(0.7, 'rgba(255,220,150,0.2)');
      grad.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    }
    const particleTex = new THREE.CanvasTexture(canvas);

    const material = new THREE.PointsMaterial({
      size: 0.28,
      map: particleTex,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      depthWrite: false,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.name = 'AtmosphereFX_Motes';
    scene.add(this.points);

    // -------------------------------------------------------------------------
    // 2. Thermodynamic Geyser Steam & Vapor Plumes (Sector 02)
    // -------------------------------------------------------------------------
    const steamGeo = new THREE.BufferGeometry();
    this.steamPositions = new Float32Array(this.steamCount * 3);
    this.steamOrigins = new Float32Array(this.steamCount * 3);

    const poolCenters = [
      { x: 71, z: -26 },
      { x: 58, z: -48 },
    ];

    for (let i = 0; i < this.steamCount; i++) {
      const idx = i * 3;
      const pool = poolCenters[i % poolCenters.length];
      const r = Math.random() * 5.2;
      const a = Math.random() * Math.PI * 2;
      const ox = pool.x + Math.cos(a) * r;
      const oz = pool.z + Math.sin(a) * r;

      this.steamOrigins[idx] = ox;
      this.steamOrigins[idx + 1] = 0.2;
      this.steamOrigins[idx + 2] = oz;

      this.steamPositions[idx] = ox;
      this.steamPositions[idx + 1] = 0.2 + Math.random() * 6.5;
      this.steamPositions[idx + 2] = oz;
    }

    this.steamPositionAttr = new THREE.BufferAttribute(this.steamPositions, 3);
    steamGeo.setAttribute('position', this.steamPositionAttr);

    const steamMat = new THREE.PointsMaterial({
      size: 0.85,
      map: particleTex,
      color: 0x9effeb,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.steamPoints = new THREE.Points(steamGeo, steamMat);
    this.steamPoints.name = 'AtmosphereFX_Steam';
    scene.add(this.steamPoints);

    // -------------------------------------------------------------------------
    // 3. Electrostatic Ion Micro-Sparks (Sector 03)
    // -------------------------------------------------------------------------
    const sparkGeo = new THREE.BufferGeometry();
    this.sparkPositions = new Float32Array(this.sparkCount * 3);
    const sparkColors = new Float32Array(this.sparkCount * 3);

    for (let i = 0; i < this.sparkCount; i++) {
      const idx = i * 3;
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 18;
      this.sparkPositions[idx] = 71 + Math.cos(a) * r;
      this.sparkPositions[idx + 1] = 0.8 + Math.random() * 5.2;
      this.sparkPositions[idx + 2] = 41 + Math.sin(a) * r;

      sparkColors[idx] = i % 2 === 0 ? 0.3 : 0.85;
      sparkColors[idx + 1] = 0.88;
      sparkColors[idx + 2] = 1.0;
    }

    this.sparkPositionAttr = new THREE.BufferAttribute(this.sparkPositions, 3);
    sparkGeo.setAttribute('position', this.sparkPositionAttr);
    sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkColors, 3));

    const sparkMat = new THREE.PointsMaterial({
      size: 0.22,
      map: particleTex,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      depthWrite: false,
    });

    this.sparkPoints = new THREE.Points(sparkGeo, sparkMat);
    this.sparkPoints.name = 'AtmosphereFX_Sparks';
    scene.add(this.sparkPoints);
  }

  update(dt: number, playerPos: THREE.Vector3, timeOfDay = 12.0): void {
    this.clock += dt;
    const wrapRadius = 45;
    const isNight = timeOfDay < 6.0 || timeOfDay > 18.5;

    const colors = this.colorAttribute.array as Float32Array;
    const pos = this.positionAttribute.array as Float32Array;

    for (let i = 0; i < this.count; i++) {
      const idx = i * 3;

      // Gentle breeze turbulence
      const wave = Math.sin(this.clock * 0.8 + i) * 0.15;
      pos[idx] += (this.velocities[idx] + wave) * dt;
      pos[idx + 1] += this.velocities[idx + 1] * dt;
      pos[idx + 2] += (this.velocities[idx + 2] + Math.cos(this.clock * 0.6 + i) * 0.15) * dt;

      // Wrap around player horizontally
      const dx = pos[idx] - playerPos.x;
      const dz = pos[idx + 2] - playerPos.z;

      if (dx > wrapRadius) pos[idx] -= wrapRadius * 2;
      else if (dx < -wrapRadius) pos[idx] += wrapRadius * 2;

      if (dz > wrapRadius) pos[idx + 2] -= wrapRadius * 2;
      else if (dz < -wrapRadius) pos[idx + 2] -= wrapRadius * 2;

      // Wrap vertically
      if (pos[idx + 1] > 9.5) {
        pos[idx + 1] = 0.2;
      }

      // Dynamic day/night palette shifting
      if (isNight) {
        // Luminous cyan-violet stardust
        colors[idx] = 0.45;
        colors[idx + 1] = 0.8;
        colors[idx + 2] = 1.0;
      } else {
        // Golden sunbeam pollen
        colors[idx] = 1.0;
        colors[idx + 1] = 0.85;
        colors[idx + 2] = 0.55;
      }
    }

    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;

    // -------------------------------------------------------------------------
    // 2. Update Thermodynamic Geyser Steam Plumes
    // -------------------------------------------------------------------------
    for (let i = 0; i < this.steamCount; i++) {
      const idx = i * 3;
      // Thermal buoyancy ascent
      this.steamPositions[idx + 1] += (0.9 + Math.sin(this.clock * 1.5 + i) * 0.18) * dt;
      // Gentle thermal wind swirl
      this.steamPositions[idx] += Math.sin(this.clock * 0.9 + i) * 0.25 * dt;
      this.steamPositions[idx + 2] += Math.cos(this.clock * 0.9 + i) * 0.25 * dt;

      // Reset when ascending past condensation height
      if (this.steamPositions[idx + 1] > 6.8) {
        this.steamPositions[idx] = this.steamOrigins[idx] + (Math.random() - 0.5) * 1.2;
        this.steamPositions[idx + 1] = 0.2;
        this.steamPositions[idx + 2] = this.steamOrigins[idx + 2] + (Math.random() - 0.5) * 1.2;
      }
    }
    this.steamPositionAttr.needsUpdate = true;

    // -------------------------------------------------------------------------
    // 3. Update Electrostatic Spark Discharges
    // -------------------------------------------------------------------------
    if (Math.random() < 0.45) {
      const sparkIdx = Math.floor(Math.random() * this.sparkCount) * 3;
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 16;
      this.sparkPositions[sparkIdx] = 71 + Math.cos(a) * r;
      this.sparkPositions[sparkIdx + 1] = 0.8 + Math.random() * 5.0;
      this.sparkPositions[sparkIdx + 2] = 41 + Math.sin(a) * r;
      this.sparkPositionAttr.needsUpdate = true;
    }
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    if (this.points.material instanceof THREE.Material) {
      this.points.material.dispose();
    }
    this.steamPoints.removeFromParent();
    this.steamPoints.geometry.dispose();
    if (this.steamPoints.material instanceof THREE.Material) {
      this.steamPoints.material.dispose();
    }
    this.sparkPoints.removeFromParent();
    this.sparkPoints.geometry.dispose();
    if (this.sparkPoints.material instanceof THREE.Material) {
      this.sparkPoints.material.dispose();
    }
  }
}
