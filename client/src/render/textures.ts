import * as THREE from 'three';

// Small procedural textures (no image files needed).

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let glow: THREE.CanvasTexture | null = null;
/** White radial falloff, for additive glows (torches, moon halo). */
export function glowTexture(): THREE.CanvasTexture {
  glow ??= canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  return glow;
}

let cloud: THREE.CanvasTexture | null = null;
/** Soft lumpy puff for mist sprites. */
export function cloudTexture(): THREE.CanvasTexture {
  cloud ??= canvasTexture(256, (ctx, s) => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 22; i++) {
      const x = s * (0.25 + rnd() * 0.5);
      const y = s * (0.3 + rnd() * 0.4);
      const r = s * (0.12 + rnd() * 0.18);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
  });
  return cloud;
}

let fade: THREE.CanvasTexture | null = null;
/** Vertical alpha fade: opaque at the bottom, clear at the top (fog wall). */
export function verticalFadeTexture(): THREE.CanvasTexture {
  fade ??= canvasTexture(64, (ctx, s) => {
    const g = ctx.createLinearGradient(0, s, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  return fade;
}
