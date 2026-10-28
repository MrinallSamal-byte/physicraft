import * as THREE from 'three';

export interface LabelStyle {
  accent?: string;
  background?: string;
  foreground?: string;
  width?: number;
  height?: number;
  font?: string;
  align?: CanvasTextAlign;
  border?: boolean;
}

export function makeCanvasTexture(
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  width = 1024,
  height = 384,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function makeTextLabel(
  title: string,
  subtitle: string,
  accent = '#7ef9ff',
  options: LabelStyle = {},
): THREE.Sprite {
  const width = options.width ?? 1024;
  const height = options.height ?? 300;
  const texture = makeCanvasTexture(
    (ctx, w, h) => {
      const pad = 36;
      const background = options.background ?? 'rgba(5, 13, 23, 0.82)';
      ctx.fillStyle = background;
      roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 20);
      ctx.fill();
      if (options.border !== false) {
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2;
        roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 20);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = accent;
      ctx.fillRect(pad, pad, 7, h - pad * 2);
      ctx.textBaseline = 'middle';
      ctx.textAlign = options.align ?? 'left';
      ctx.fillStyle = options.foreground ?? '#f4f8ff';
      ctx.font = options.font ?? '700 58px "Space Grotesk", sans-serif';
      const textX = options.align === 'center' ? w / 2 : pad + 34;
      ctx.fillText(title, textX, h * 0.39, w - pad * 2 - 50);
      ctx.fillStyle = accent;
      ctx.font = '500 27px "JetBrains Mono", monospace';
      ctx.globalAlpha = 0.9;
      ctx.fillText(subtitle.toUpperCase(), textX, h * 0.67, w - pad * 2 - 50);
      ctx.globalAlpha = 1;
    },
    width,
    height,
  );
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((width / height) * 2.15, 2.15, 1);
  return sprite;
}

export function makeWorldTitle(
  title: string,
  overline: string,
  accent = '#7ef9ff',
  size = 4,
): THREE.Sprite {
  const width = 1400;
  const height = 380;
  const texture = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(4, 10, 18, 0.7)';
      roundRect(ctx, 40, 60, w - 80, h - 120, 28);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 3;
      roundRect(ctx, 40, 60, w - 80, h - 120, 28);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = accent;
      ctx.font = '500 28px "JetBrains Mono", monospace';
      ctx.fillText(overline.toUpperCase(), w / 2, 124);
      ctx.fillStyle = '#f3f7ff';
      ctx.font = '700 74px "Space Grotesk", sans-serif';
      ctx.fillText(title, w / 2, 206, w - 160);
      ctx.fillStyle = accent;
      ctx.fillRect(w / 2 - 70, 280, 140, 4);
    },
    width,
    height,
  );
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((width / height) * size, size, 1);
  return sprite;
}

export function makeReadoutTexture(lines: string[], accent: string, width = 1024, height = 512): THREE.CanvasTexture {
  return makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = 'rgba(3, 11, 20, 0.84)';
      roundRect(ctx, 24, 24, w - 48, h - 48, 22);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = 2;
      roundRect(ctx, 24, 24, w - 48, h - 48, 22);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let y = 94;
      for (const line of lines) {
        const isTitle = line.startsWith('#');
        const text = isTitle ? line.slice(1) : line;
        ctx.fillStyle = isTitle ? accent : '#e7f3ff';
        ctx.font = isTitle
          ? '500 30px "JetBrains Mono", monospace'
          : '500 38px "JetBrains Mono", monospace';
        ctx.fillText(text, 64, y, w - 128);
        y += isTitle ? 58 : 52;
      }
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.2;
      for (let gy = 64; gy < h - 40; gy += 34) {
        ctx.beginPath();
        ctx.moveTo(64, gy);
        ctx.lineTo(w - 64, gy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    width,
    height,
  );
}

export class HoloText {
  sprite: THREE.Sprite;
  texture: THREE.CanvasTexture;

  constructor(
    private title: string,
    private subtitle: string,
    private accent: string,
    scale = 2,
  ) {
    this.sprite = makeTextLabel(title, subtitle, accent);
    this.texture = this.sprite.material.map as THREE.CanvasTexture;
    this.sprite.scale.set(4.8 * scale, 1.4 * scale, 1);
  }

  setTitle(title: string, subtitle = ''): void {
    this.title = title;
    this.subtitle = subtitle;
    const replacement = makeTextLabel(title, subtitle, this.accent);
    this.sprite.material.map?.dispose();
    this.sprite.material.map = replacement.material.map;
    this.sprite.material.needsUpdate = true;
    replacement.material.dispose();
  }
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/**
 * Creates an engraved stone-plaque texture for Biome Milestone Equation Stelae
 */
export function makeEquationPlaqueTexture(
  discipline: string,
  lawName: string,
  formula: string,
  subFormula: string,
  citation: string,
  accent: string,
  width = 1024,
  height = 640,
): THREE.CanvasTexture {
  return makeCanvasTexture(
    (ctx, w, h) => {
      // 1. Deep brushed slate slab background
      ctx.fillStyle = '#0a131c';
      roundRect(ctx, 20, 20, w - 40, h - 40, 24);
      ctx.fill();

      // 2. Dual engraved brass/accent border
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.75;
      roundRect(ctx, 32, 32, w - 64, h - 64, 18);
      ctx.stroke();

      ctx.strokeStyle = '#c7a35d';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.45;
      roundRect(ctx, 42, 42, w - 84, h - 84, 12);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // 3. Discipline Header Pill
      ctx.fillStyle = accent;
      ctx.font = '700 24px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`— SECTOR ${discipline.toUpperCase()} —`, w / 2, 60);

      // 4. Governing Law Title
      ctx.fillStyle = '#f5f0e3';
      ctx.font = '700 36px "Space Grotesk", sans-serif';
      ctx.fillText(lawName, w / 2, 108);

      // Gold rule line
      ctx.strokeStyle = '#c7a35d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.2, 164);
      ctx.lineTo(w * 0.8, 164);
      ctx.stroke();

      // 5. Mathematical Formula Box
      ctx.fillStyle = 'rgba(2, 6, 12, 0.65)';
      roundRect(ctx, 60, 190, w - 120, 150, 14);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5;
      roundRect(ctx, 60, 190, w - 120, 150, 14);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = accent;
      ctx.font = '700 48px "JetBrains Mono", monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(formula, w / 2, 265);

      // 6. Sub-principle
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'italic 25px Georgia, serif';
      ctx.textBaseline = 'top';
      ctx.fillText(subFormula, w / 2, 375);

      // 7. Treatise Citation
      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 22px "JetBrains Mono", monospace';
      ctx.fillText(`Historic Treatise: ${citation}`, w / 2, 470);

      // Corner rosettes / brass studs
      const studPos = [
        [50, 50],
        [w - 50, 50],
        [50, h - 50],
        [w - 50, h - 50],
      ];
      ctx.fillStyle = '#c7a35d';
      for (const [sx, sy] of studPos) {
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    width,
    height,
  );
}

