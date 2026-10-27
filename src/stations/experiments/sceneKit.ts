import * as THREE from 'three';
import { makeCanvasTexture, makeReadoutTexture, roundRect } from '../../world/labels';

/** A readable sign board for station scenery with a solid physical backing chassis and bezel. */
export function addStationSign(
  parent: THREE.Object3D,
  title: string,
  subtitle: string,
  accent: string,
  position: [number, number, number],
  size = 2.7,
  rotationY = 0,
): THREE.Mesh {
  const texture = makeReadoutTexture([`#${title}`, subtitle], accent, 900, 300);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size / 3),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: true,
      alphaTest: 0.05,
      toneMapped: false,
      side: THREE.FrontSide,
    }),
  );
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;

  // Solid physical backing chassis (stops slicing and gives real-world physical thickness)
  const casingHeight = size / 3;
  const casing = new THREE.Mesh(
    new THREE.BoxGeometry(size + 0.1, casingHeight + 0.08, 0.06),
    new THREE.MeshStandardMaterial({
      color: 0x0c1622,
      roughness: 0.35,
      metalness: 0.8,
    }),
  );
  casing.position.set(0, 0, -0.031);
  mesh.add(casing);

  // Metallic accent trim rim
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(size + 0.12, casingHeight + 0.1, 0.015),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(accent).multiplyScalar(0.75),
      roughness: 0.25,
      metalness: 0.9,
    }),
  );
  trim.position.set(0, 0, -0.042);
  mesh.add(trim);

  parent.add(mesh);
  return mesh;
}

export function makeLine(
  points: THREE.Vector3[],
  color: number,
  opacity = 0.7,
  additive = true,
): THREE.Line {
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    toneMapped: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
  });
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

export function makeDashedLine(
  points: THREE.Vector3[],
  color: number,
  opacity = 0.4,
  dashSize = 0.22,
  gapSize = 0.16,
): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineDashedMaterial({
    color,
    transparent: true,
    opacity,
    dashSize,
    gapSize,
    toneMapped: false,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances();
  return line;
}

/** Cheap tinted glass for vacuum tubes, prisms, and water volumes. */
export function glassBox(
  width: number,
  height: number,
  depth: number,
  color = 0x9ee6ef,
  opacity = 0.09,
): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshPhysicalMaterial({
      color,
      transparent: true,
      opacity,
      roughness: 0.04,
      metalness: 0.01,
      transmission: 0.72,
      thickness: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
}

/**
 * A live canvas panel. Use sparingly: redraw at a few hertz, not every frame.
 * The plane's local +Z faces the viewer.
 */
export class CanvasBoard {
  readonly mesh: THREE.Mesh;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  private lastDraw = -Infinity;

  constructor(
    readonly worldWidth: number,
    readonly worldHeight: number,
    private readonly pixelWidth = 512,
    private readonly pixelHeight = 256,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(worldWidth, worldHeight),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthWrite: true,
        alphaTest: 0.05,
        toneMapped: false,
        side: THREE.FrontSide,
      }),
    );

    // Solid physical casing behind monitor canvas
    const casing = new THREE.Mesh(
      new THREE.BoxGeometry(worldWidth + 0.12, worldHeight + 0.12, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0x0a141e,
        roughness: 0.35,
        metalness: 0.85,
      }),
    );
    casing.position.set(0, 0, -0.042);
    this.mesh.add(casing);

    // Outer alloy bezel
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(worldWidth + 0.16, worldHeight + 0.16, 0.02),
      new THREE.MeshStandardMaterial({
        color: 0x223344,
        roughness: 0.2,
        metalness: 0.9,
      }),
    );
    bezel.position.set(0, 0, -0.052);
    this.mesh.add(bezel);
  }

  /** Draw immediately. Pass force=false to throttle redraws by seconds. */
  draw(
    render: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
    force = true,
    minInterval = 0.1,
  ): void {
    const now = performance.now() / 1000;
    if (!force && now - this.lastDraw < minInterval) return;
    this.lastDraw = now;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    render(ctx, canvas.width, canvas.height);
    this.texture.needsUpdate = true;
  }

  /** A dark instrument-style backing with a neon header. */
  frame(ctx: CanvasRenderingContext2D, accent: string, header?: string): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = 'rgba(4, 11, 20, 0.9)';
    roundRect(ctx, 6, 6, w - 12, h - 12, 18);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    roundRect(ctx, 6, 6, w - 12, h - 12, 18);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent;
    ctx.fillRect(22, 24, 5, h - 48);
    if (header) {
      ctx.fillStyle = accent;
      ctx.font = '600 17px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(header.toUpperCase(), 38, 30);
    }
  }

  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

export function drawClockFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  accent: string,
  years: number,
  label: string,
): void {
  ctx.save();
  ctx.translate(cx, cy);

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8, 14, 24, 0.95)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.7;
  ctx.stroke();
  ctx.globalAlpha = 1;

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const inner = i % 3 === 0 ? radius * 0.78 : radius * 0.86;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * radius * 0.94, Math.sin(a) * radius * 0.94);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = i % 3 === 0 ? 0.95 : 0.45;
    ctx.lineWidth = i % 3 === 0 ? 2.5 : 1.2;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const hand = (fraction: number, length: number, width: number, color: string) => {
    const a = fraction * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * length, Math.sin(a) * length);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  hand(years % 10 / 10, radius * 0.7, 4, '#f5fbff');
  hand(years % 1, radius * 0.9, 2, accent);

  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();

  ctx.fillStyle = '#e8f3ff';
  ctx.font = '700 22px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${years.toFixed(2)} y`, 0, radius * 0.5);

  ctx.fillStyle = accent;
  ctx.font = '600 15px "JetBrains Mono", monospace';
  ctx.fillText(label.toUpperCase(), 0, -radius * 0.5);
  ctx.restore();
}

export const makeBillboardTexture = makeCanvasTexture;
