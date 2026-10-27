import * as THREE from 'three';

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, value: number): number => (a === b ? 0 : (value - a) / (b - a));
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));
export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function formatNumber(value: number, precision = 2): string {
  if (!Number.isFinite(value)) return '∞';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  if (abs > 0 && abs < 0.01) return value.toExponential(2);
  return value.toFixed(precision).replace(/\.?0+$/, '');
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return minutes > 0 ? `${minutes}:${remaining.toFixed(1).padStart(4, '0')}` : `${remaining.toFixed(1)}s`;
}

export function hash2(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function colorWithRange(color: number, variance: number, rng: () => number): THREE.Color {
  const c = new THREE.Color(color);
  const offset = (rng() - 0.5) * variance;
  c.offsetHSL((rng() - 0.5) * variance * 0.18, (rng() - 0.5) * variance * 0.2, offset);
  return c;
}

export const palette = {
  ink: 0x080d17,
  night: 0x0d1423,
  slate: 0x1b2636,
  stone: 0x38485a,
  snow: 0xeff6ff,
  gold: 0xf3c969,
  brass: 0xbf863f,
  copper: 0xd97d50,
  electric: 0x63e8ff,
  plasma: 0xd67dff,
  mint: 0x7bffd1,
  acid: 0xc9ff62,
  coral: 0xff806b,
  glass: 0x92dce5,
  water: 0x2f9dc6,
  shadow: 0x04070d,
};

export function makeGridTexture(options?: {
  size?: number;
  color?: string;
  line?: string;
  step?: number;
  glow?: boolean;
}): THREE.CanvasTexture {
  const size = options?.size ?? 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = options?.color ?? '#07131f';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = options?.line ?? 'rgba(91, 220, 255, 0.18)';
  ctx.lineWidth = 1;
  const step = options?.step ?? 32;
  for (let i = 0; i <= size; i += step) {
    ctx.beginPath();
    ctx.moveTo(i + 0.5, 0);
    ctx.lineTo(i + 0.5, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i + 0.5);
    ctx.lineTo(size, i + 0.5);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeRadialGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.32, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        material.dispose();
      }
    }
  });
  root.removeFromParent();
}

export function screenPosition(element: HTMLElement, rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function svgIcon(path: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export function wrapText(text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
