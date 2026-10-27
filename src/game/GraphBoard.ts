import * as THREE from 'three';
import type { EnvironmentState } from '../config';
import { makeRadialGlowTexture } from '../core/utils';
import { makeCanvasTexture, roundRect } from '../world/labels';
import { addGlowSprite, meshBox } from '../world/voxel';
import type { Experiment } from '../stations/BaseExperiment';
import type { Station } from '../stations/registry';
import type { GraphSample } from '../stations/types';

const WIDTH = 3.84;
const HEIGHT = 2.16;
const CANVAS_W = 1120;
const CANVAS_H = 630;

/**
 * A physical, floating oscilloscope board. The player spawns it with the Graph
 * Spawner Block; it samples the focused experiment's telemetry into a rolling
 * three-channel record (position, velocity, total energy).
 */
export class GraphBoard {
  readonly group = new THREE.Group();
  visible = false;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private screen: THREE.Mesh;
  private samples: GraphSample[] = [];
  private sampleTimer = 0;
  private drawTimer = 0;
  private stationId: string | null = null;
  private accent = '#7ef9ff';
  private previousT = -1;
  private spawnBlend = 0;
  private collidersRef: THREE.Box3[] = [];
  private stationsRef: Station[] = [];
  private targetPosition = new THREE.Vector3();
  private isFocusedView = false;

  constructor(private readonly scene: THREE.Scene) {
    this.group.name = 'spawned-graph-board';
    this.group.visible = false;

    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    const back = meshBox(WIDTH + 0.24, HEIGHT + 0.24, 0.13, 0x0a141d, {
      metalness: 0.45,
      roughness: 0.4,
    });
    back.position.z = -0.08;
    this.group.add(back);
    const rim = meshBox(WIDTH + 0.34, HEIGHT + 0.34, 0.05, 0x243944, {
      metalness: 0.65,
      roughness: 0.32,
    });
    rim.position.z = -0.15;
    this.group.add(rim);
    for (const [x, y] of [
      [-WIDTH / 2 - 0.04, HEIGHT / 2 + 0.04],
      [WIDTH / 2 + 0.04, HEIGHT / 2 + 0.04],
      [-WIDTH / 2 - 0.04, -HEIGHT / 2 - 0.04],
      [WIDTH / 2 + 0.04, -HEIGHT / 2 - 0.04],
    ] as const) {
      this.group.add(meshBox(0.16, 0.16, 0.1, 0xc9a45f, { position: [x, y, -0.04], metalness: 0.8, roughness: 0.25 }));
    }
    const screenGeometry = new THREE.PlaneGeometry(WIDTH, HEIGHT);
    this.screen = new THREE.Mesh(
      screenGeometry,
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        toneMapped: false,
        depthWrite: true,
        alphaTest: 0.05,
        side: THREE.FrontSide,
      }),
    );
    this.screen.position.z = 0.005;
    this.group.add(this.screen);
    addGlowSprite(this.group, makeRadialGlowTexture(), [0, 0, -0.3], 5.5, '#73e7ff', 0.1);
    this.scene.add(this.group);
    this.drawEmpty();
  }

  setCollidersRef(colliders: THREE.Box3[]): void {
    this.collidersRef = colliders;
  }

  setStationsRef(stations: Station[]): void {
    this.stationsRef = stations;
  }

  calculateSafePosition(camera: THREE.PerspectiveCamera, station: Station | null, isFocused: boolean): THREE.Vector3 {
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

    const target = new THREE.Vector3();

    if (isFocused && station) {
      // In focus mode, camera orbits around station.worldPosition.
      // Float the board neatly on the left side of the screen framing in clear air.
      target.copy(camera.position)
        .addScaledVector(camDir, 3.8)
        .addScaledVector(camRight, -2.2)
        .addScaledVector(camUp, 0.05);

      // Station clearance guarantee: minimum 5.2m from apparatus center
      const horizDist = Math.hypot(target.x - station.worldPosition.x, target.z - station.worldPosition.z);
      const MIN_STATION_DIST = 5.2;
      if (horizDist < MIN_STATION_DIST) {
        // Pull back towards camera
        const pull = (MIN_STATION_DIST - horizDist) + 0.6;
        target.addScaledVector(camDir, -pull);
      }
    } else {
      // First-person exploration view:
      // Board floats 3.2m ahead, slightly to the side (+1.5m right)
      target.copy(camera.position)
        .addScaledVector(camDir, 3.2)
        .addScaledVector(camRight, 1.5)
        .addScaledVector(camUp, 0.05);

      // Check distance against all station apparatus centers
      for (const st of this.stationsRef) {
        const dX = target.x - st.worldPosition.x;
        const dZ = target.z - st.worldPosition.z;
        const dist = Math.hypot(dX, dZ);
        const SAFE_DIST = 5.0;
        if (dist < SAFE_DIST) {
          const playerDist = Math.hypot(camera.position.x - st.worldPosition.x, camera.position.z - st.worldPosition.z);
          if (playerDist > SAFE_DIST) {
            // Player is outside: pull board closer to player
            const allowed = Math.max(1.8, playerDist - SAFE_DIST + 0.5);
            target.copy(camera.position).addScaledVector(camDir, Math.min(3.0, allowed)).addScaledVector(camRight, 1.2);
          } else {
            // Player is inside: push board radially outward
            const angle = dist > 0.01 ? Math.atan2(dZ, dX) : 0;
            target.x = st.worldPosition.x + Math.cos(angle) * (SAFE_DIST + 0.6);
            target.z = st.worldPosition.z + Math.sin(angle) * (SAFE_DIST + 0.6);
          }
        }
      }
    }

    // Minimum ground clearance
    target.y = Math.max(target.y, HEIGHT * 0.5 + 0.35);

    // Obstacle depenetration against world colliders
    if (this.collidersRef.length > 0) {
      const halfW = WIDTH * 0.45;
      const halfH = HEIGHT * 0.45;
      const testBox = new THREE.Box3();
      for (let iter = 0; iter < 4; iter++) {
        testBox.min.set(target.x - halfW, target.y - halfH, target.z - halfW);
        testBox.max.set(target.x + halfW, target.y + halfH, target.z + halfW);
        let hitAny = false;
        for (const col of this.collidersRef) {
          if (testBox.intersectsBox(col)) {
            hitAny = true;
            const ox1 = testBox.max.x - col.min.x;
            const ox2 = col.max.x - testBox.min.x;
            const oz1 = testBox.max.z - col.min.z;
            const oz2 = col.max.z - testBox.min.z;
            const shiftX = ox1 < ox2 ? -ox1 : ox2;
            const shiftZ = oz1 < oz2 ? -oz1 : oz2;
            if (Math.abs(shiftX) < Math.abs(shiftZ)) {
              target.x += shiftX;
            } else {
              target.z += shiftZ;
            }
          }
        }
        if (!hitAny) break;
      }
    }

    return target;
  }

  toggle(camera: THREE.PerspectiveCamera, station: Station | null, isFocused = false): void {
    if (this.visible) {
      this.hide();
      return;
    }
    this.spawn(camera, station, isFocused);
  }

  spawn(camera: THREE.PerspectiveCamera, station: Station | null, isFocused = false): void {
    this.isFocusedView = isFocused;
    const safePos = this.calculateSafePosition(camera, station, isFocused);
    this.group.position.copy(safePos);
    this.targetPosition.copy(safePos);
    this.faceCamera(camera);
    this.samples = [];
    this.previousT = -1;
    this.stationId = station?.id ?? null;
    this.accent = station?.accent ?? '#7ef9ff';
    this.spawnBlend = 0;
    this.group.visible = true;
    this.visible = true;
    this.drawEmpty();
  }

  reposition(camera: THREE.PerspectiveCamera, station: Station | null, isFocused = false): void {
    if (!this.visible) return;
    this.isFocusedView = isFocused;
    if (station && station.id !== this.stationId) {
      this.stationId = station.id;
      this.accent = station.accent;
    }
    const safePos = this.calculateSafePosition(camera, station, isFocused);
    this.targetPosition.copy(safePos);
  }

  hide(): void {
    this.visible = false;
    this.group.visible = false;
  }

  update(dt: number, station: Station | null, experiment: Experiment | null, env: EnvironmentState): void {
    if (!this.visible) return;
    this.spawnBlend = Math.min(1, this.spawnBlend + dt * 4);
    this.group.scale.setScalar(0.82 + this.spawnBlend * 0.18);
    if (!station || !experiment) {
      return;
    }
    if (station.id !== this.stationId) {
      this.stationId = station.id;
      this.accent = station.accent;
      this.samples = [];
      this.previousT = -1;
    }
    this.sampleTimer += dt;
    this.drawTimer += dt;
    if (this.sampleTimer > 0.12) {
      this.sampleTimer = 0;
      const sample = experiment.getGraphSample();
      if (sample && Number.isFinite(sample.position) && Number.isFinite(sample.velocity)) {
        if (this.previousT >= 0 && (sample.t < this.previousT - 0.05 || sample.t - this.previousT > 1.4)) {
          this.samples = [];
        }
        this.previousT = sample.t;
        this.samples.push(sample);
        if (this.samples.length > 130) this.samples.shift();
      }
    }
    if (this.drawTimer > 0.14) {
      this.drawTimer = 0;
      this.draw(experiment, env);
    }
  }

  private faceCamera(camera: THREE.PerspectiveCamera): void {
    this.group.lookAt(camera.position);
  }

  updateOrientation(camera: THREE.PerspectiveCamera, dt: number, station?: Station | null, isFocused?: boolean): void {
    if (!this.visible) return;
    const focused = isFocused ?? Boolean(station);
    this.isFocusedView = focused;

    if (focused && station) {
      // In focus mode, keep target updated with camera orbit position smoothly
      const desired = this.calculateSafePosition(camera, station, true);
      this.targetPosition.copy(desired);
    } else {
      // In first-person mode, check if player moved away or turned around
      const dist = camera.position.distanceTo(this.group.position);
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const toBoard = new THREE.Vector3().subVectors(this.group.position, camera.position).normalize();
      const dot = camDir.dot(toBoard);

      if (dist > 5.5 || dist < 1.8 || dot < 0.25) {
        const desired = this.calculateSafePosition(camera, station ?? null, false);
        this.targetPosition.copy(desired);
      }
    }

    // Smooth position lerp
    const lerpSpeed = focused ? 6.5 : 4.0;
    this.group.position.lerp(this.targetPosition, Math.min(1, dt * lerpSpeed));

    // Smooth rotation facing camera
    const dummy = new THREE.Object3D();
    dummy.position.copy(this.group.position);
    dummy.lookAt(camera.position);
    this.group.quaternion.slerp(dummy.quaternion, Math.min(1, dt * 5.0));
  }

  private drawEmpty(): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(3, 11, 18, 0.96)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.strokeStyle = this.accent;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 3;
    roundRect(ctx, 18, 18, CANVAS_W - 36, CANVAS_H - 36, 18);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#dff8ff';
    ctx.font = '600 34px "Space Grotesk Variable", sans-serif';
    ctx.fillText('GRAPH SPAWNER BLOCK', 52, 80);
    ctx.fillStyle = this.accent;
    ctx.font = '500 20px "JetBrains Mono Variable", monospace';
    ctx.fillText('AWAITING A FOCUSED APPARATUS', 52, 118);
    ctx.fillStyle = 'rgba(126,249,255,0.12)';
    for (let y = 170; y < CANVAS_H - 50; y += 42) {
      ctx.fillRect(52, y, CANVAS_W - 104, 1);
    }
    for (let x = 52; x < CANVAS_W - 50; x += 72) {
      ctx.fillRect(x, 170, 1, CANVAS_H - 220);
    }
    ctx.fillStyle = 'rgba(126,249,255,0.35)';
    ctx.font = '400 18px "JetBrains Mono Variable", monospace';
    ctx.fillText('PRESS G TO RETRACT', 52, CANVAS_H - 44);
    this.texture.needsUpdate = true;
  }

  private draw(experiment: Experiment, env: EnvironmentState): void {
    const ctx = this.ctx;
    const w = CANVAS_W;
    const h = CANVAS_H;
    const accent = this.accent;
    ctx.fillStyle = 'rgba(3, 11, 18, 0.96)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    roundRect(ctx, 18, 18, w - 36, h - 36, 18);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent;
    ctx.fillRect(44, 40, 6, 52);
    ctx.fillStyle = '#edfaff';
    ctx.font = '600 30px "Space Grotesk Variable", sans-serif';
    ctx.fillText(`${experiment.meta.number} · ${experiment.meta.chart.title.toUpperCase()}`, 68, 72);
    ctx.fillStyle = accent;
    ctx.font = '500 18px "JetBrains Mono Variable", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`T + ${Math.max(0, this.previousT).toFixed(2)} s`, w - 48, 72);
    ctx.textAlign = 'left';

    const chart = experiment.meta.chart;
    const latest = this.samples[this.samples.length - 1];
    const rows = [
      {
        label: chart.positionLabel,
        value: latest?.position ?? 0,
        color: '#72e9ff',
        get: (sample: GraphSample) => sample.position,
      },
      {
        label: chart.velocityLabel,
        value: latest?.velocity ?? 0,
        color: '#ffb060',
        get: (sample: GraphSample) => sample.velocity,
      },
      {
        label: chart.energyLabel,
        value: latest ? latest.ke + latest.pe : 0,
        color: '#8bffc4',
        get: (sample: GraphSample) => sample.ke + sample.pe,
      },
    ];

    const startY = 104;
    const rowHeight = 155;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const top = startY + r * rowHeight;
      const plotLeft = 204;
      const plotRight = w - 54;
      const plotTop = top + 18;
      const plotBottom = top + rowHeight - 34;
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(plotLeft, plotTop, plotRight - plotLeft, plotBottom - plotTop);
      ctx.strokeStyle = 'rgba(150, 195, 210, 0.1)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = plotTop + ((plotBottom - plotTop) / 4) * i;
        ctx.beginPath();
        ctx.moveTo(plotLeft, y);
        ctx.lineTo(plotRight, y);
        ctx.stroke();
      }
      for (let i = 0; i <= 6; i++) {
        const x = plotLeft + ((plotRight - plotLeft) / 6) * i;
        ctx.beginPath();
        ctx.moveTo(x, plotTop);
        ctx.lineTo(x, plotBottom);
        ctx.stroke();
      }

      const values = this.samples.map(row.get).filter((v) => Number.isFinite(v));
      const max = Math.max(1e-6, ...values.map((v) => Math.abs(v)));
      const min = Math.min(0, ...values);
      const range = max - min || 1;
      const coords: Array<[number, number]> = [];
      const n = Math.max(1, this.samples.length - 1);
      this.samples.forEach((sample, index) => {
        const value = row.get(sample);
        if (!Number.isFinite(value)) return;
        const x = plotLeft + (index / n) * (plotRight - plotLeft);
        const y = plotBottom - ((value - min) / range) * (plotBottom - plotTop);
        coords.push([x, y]);
      });
      if (coords.length > 1) {
        const gradient = ctx.createLinearGradient(plotLeft, 0, plotRight, 0);
        gradient.addColorStop(0, `${row.color}10`);
        gradient.addColorStop(1, row.color);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.beginPath();
        coords.forEach(([x, y], i) => {
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        if (r === 2) {
          ctx.lineTo(coords[coords.length - 1][0], plotBottom);
          ctx.lineTo(coords[0][0], plotBottom);
          ctx.closePath();
          ctx.fillStyle = `${row.color}16`;
          ctx.fill();
        }
        const [lastX, lastY] = coords[coords.length - 1];
        ctx.fillStyle = row.color;
        ctx.beginPath();
        ctx.arc(lastX, lastY, 4.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.32;
        ctx.beginPath();
        ctx.arc(lastX, lastY, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = 'rgba(200, 235, 245, 0.55)';
      ctx.font = '500 17px "JetBrains Mono Variable", monospace';
      ctx.fillText(row.label.toUpperCase(), 52, top + 28);
      ctx.fillStyle = row.color;
      ctx.font = '600 34px "Space Grotesk Variable", sans-serif';
      const formatted = Math.abs(row.value) >= 1000 ? row.value.toExponential(2) : row.value.toFixed(2);
      ctx.fillText(formatted, 52, top + 66);
      ctx.fillStyle = 'rgba(200,235,245,0.35)';
      ctx.font = '400 15px "JetBrains Mono Variable", monospace';
      ctx.fillText(`PEAK ${max > 0 ? max.toExponential(1) : '0'}`, 52, top + 92);
    }
    ctx.fillStyle = 'rgba(151, 205, 220, 0.45)';
    ctx.font = '400 16px "JetBrains Mono Variable", monospace';
    ctx.fillText(`GLOBAL g ${env.gravity.toFixed(2)} m/s²  ·  ${env.air.toUpperCase()}  ·  ${env.friction.toUpperCase()}`, 52, h - 42);
    ctx.textAlign = 'right';
    ctx.fillText('SPAWNED BY INSTRUMENT 05', w - 52, h - 42);
    ctx.textAlign = 'left';
    this.texture.needsUpdate = true;
  }
}
