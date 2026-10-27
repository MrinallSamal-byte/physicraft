import * as THREE from 'three';
import type { EnvironmentState } from '../config';
import { makeRadialGlowTexture } from '../core/utils';
import { makeCanvasTexture, roundRect } from '../world/labels';
import { addGlowSprite, meshBox } from '../world/voxel';
import type { Experiment } from '../stations/BaseExperiment';
import type { Station } from '../stations/registry';
import type { GraphSample } from '../stations/types';

const WIDTH = 5.6;
const HEIGHT = 3.15;
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
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, side: THREE.DoubleSide }),
    );
    this.screen.position.z = 0.005;
    this.group.add(this.screen);
    addGlowSprite(this.group, makeRadialGlowTexture(), [0, 0, -0.3], 8, '#73e7ff', 0.1);
    this.scene.add(this.group);
    this.drawEmpty();
  }

  toggle(camera: THREE.PerspectiveCamera, station: Station | null): void {
    if (this.visible) {
      this.hide();
      return;
    }
    this.spawn(camera, station);
  }

  spawn(camera: THREE.PerspectiveCamera, station: Station | null): void {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
    const position = camera.position
      .clone()
      .addScaledVector(forward, 6.4)
      .addScaledVector(right, 2.6)
      .add(new THREE.Vector3(0, 0.55, 0));
    this.group.position.copy(position);
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

  updateOrientation(camera: THREE.PerspectiveCamera, dt: number): void {
    if (!this.visible) return;
    const dummy = new THREE.Object3D();
    dummy.position.copy(this.group.position);
    dummy.lookAt(camera.position);
    this.group.quaternion.slerp(dummy.quaternion, Math.min(1, dt * 3.2));
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
