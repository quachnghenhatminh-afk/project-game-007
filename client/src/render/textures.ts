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

/** Deterministic RNG for repeatable textures. */
function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function tiled(tex: THREE.CanvasTexture): THREE.CanvasTexture {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Sprinkles fine noise over the whole canvas (breaks up flat colors). */
function grain(ctx: CanvasRenderingContext2D, s: number, r: () => number, amount: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const v = r() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${r() * amount})`;
    ctx.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2);
  }
}

const cache = new Map<string, THREE.CanvasTexture>();
function cached(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/** Earthen bricks (gạch đất) in running bond. One texture tile = 2m × 2m: 8 rows × 4 bricks. */
export function earthBrickTexture(): THREE.CanvasTexture {
  return cached('brick', () =>
    tiled(
      canvasTexture(512, (ctx, s) => {
        const r = rng(11);
        ctx.fillStyle = '#4a3324'; // mortar / packed earth
        ctx.fillRect(0, 0, s, s);
        const rows = 8;
        const cols = 4;
        const bh = s / rows;
        const bw = s / cols;
        for (let y = 0; y < rows; y++) {
          const off = y % 2 ? bw / 2 : 0;
          for (let x = -1; x < cols; x++) {
            const hue = 18 + r() * 14;
            const light = 32 + r() * 14;
            ctx.fillStyle = `hsl(${hue}, ${38 + r() * 18}%, ${light}%)`;
            const px = x * bw + off + 3;
            ctx.fillRect(px, y * bh + 3, bw - 6, bh - 6);
            // Worn top edge highlight + a few chips.
            ctx.fillStyle = `rgba(255,220,180,${0.06 + r() * 0.06})`;
            ctx.fillRect(px, y * bh + 3, bw - 6, 3);
            if (r() < 0.3) {
              ctx.fillStyle = 'rgba(40,25,15,0.5)';
              ctx.fillRect(px + r() * (bw - 20), y * bh + 3 + r() * (bh - 12), 4 + r() * 8, 3 + r() * 5);
            }
          }
        }
        grain(ctx, s, r, 0.12, 9000);
      }),
    ),
  );
}

/** Large flagstones for the crystal plaza. One tile = 4m × 4m. */
export function flagstoneTexture(): THREE.CanvasTexture {
  return cached('flag', () =>
    tiled(
      canvasTexture(512, (ctx, s) => {
        const r = rng(5);
        ctx.fillStyle = '#3a3836';
        ctx.fillRect(0, 0, s, s);
        const n = 4;
        const c = s / n;
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            const l = 50 + r() * 14;
            ctx.fillStyle = `hsl(35, 6%, ${l}%)`;
            const inset = 4 + r() * 3;
            ctx.fillRect(x * c + inset, y * c + inset, c - inset * 2, c - inset * 2);
          }
        }
        grain(ctx, s, r, 0.15, 12000);
      }),
    ),
  );
}

/** Ashlar stone blocks for walls and towers. One tile = 2m × 2m: 4 courses. */
export function stoneBlockTexture(): THREE.CanvasTexture {
  return cached('stone', () =>
    tiled(
      canvasTexture(512, (ctx, s) => {
        const r = rng(23);
        ctx.fillStyle = '#4b4843';
        ctx.fillRect(0, 0, s, s);
        const rows = 4;
        const bh = s / rows;
        for (let y = 0; y < rows; y++) {
          let x = y % 2 ? -bh * 0.6 : 0;
          while (x < s) {
            const w = bh * (1.1 + r() * 0.9);
            const l = 58 + r() * 16;
            ctx.fillStyle = `hsl(${30 + r() * 15}, ${5 + r() * 6}%, ${l}%)`;
            ctx.fillRect(x + 3, y * bh + 3, w - 6, bh - 6);
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(x + 3, y * bh + 3, w - 6, 4);
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.fillRect(x + 3, y * bh + bh - 9, w - 6, 6);
            x += w;
          }
        }
        // Moss/dirt stains near the bottom of the tile.
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = `rgba(60,80,40,${r() * 0.12})`;
          ctx.beginPath();
          ctx.arc(r() * s, s * (0.6 + r() * 0.4), 6 + r() * 24, 0, Math.PI * 2);
          ctx.fill();
        }
        grain(ctx, s, r, 0.12, 10000);
      }),
    ),
  );
}

/** Dirt road with pebbles and wheel ruts. One tile = 6m wide road × 6m long. */
export function dirtRoadTexture(): THREE.CanvasTexture {
  return cached('dirt', () =>
    tiled(
      canvasTexture(512, (ctx, s) => {
        const r = rng(31);
        ctx.fillStyle = '#5e4630';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 600; i++) {
          ctx.fillStyle = `rgba(${r() < 0.5 ? '40,28,18' : '120,95,65'},${r() * 0.25})`;
          ctx.beginPath();
          ctx.arc(r() * s, r() * s, 4 + r() * 18, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const rx of [0.3, 0.7]) {
          ctx.fillStyle = 'rgba(30,20,12,0.25)';
          ctx.fillRect(s * rx - 10, 0, 20, s);
        }
        for (let i = 0; i < 260; i++) {
          const l = 40 + r() * 30;
          ctx.fillStyle = `hsl(30, 8%, ${l}%)`;
          ctx.beginPath();
          ctx.ellipse(r() * s, r() * s, 2 + r() * 5, 2 + r() * 4, r() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        grain(ctx, s, r, 0.15, 9000);
      }),
    ),
  );
}

/** Patchy grass/forest floor. One tile = 8m × 8m. */
export function grassTexture(): THREE.CanvasTexture {
  return cached('grass', () =>
    tiled(
      canvasTexture(512, (ctx, s) => {
        const r = rng(47);
        ctx.fillStyle = '#34502a';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 500; i++) {
          const dark = r() < 0.5;
          ctx.fillStyle = dark ? `rgba(25,40,20,${r() * 0.3})` : `rgba(90,120,55,${r() * 0.2})`;
          ctx.beginPath();
          ctx.arc(r() * s, r() * s, 6 + r() * 30, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = 0; i < 4000; i++) {
          ctx.strokeStyle = `rgba(${110 + r() * 60},${150 + r() * 60},${70 + r() * 30},${0.15 + r() * 0.2})`;
          const x = r() * s;
          const y = r() * s;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 6);
          ctx.stroke();
        }
        // Fallen needles / dirt patches.
        for (let i = 0; i < 80; i++) {
          ctx.fillStyle = `rgba(90,60,35,${r() * 0.25})`;
          ctx.beginPath();
          ctx.arc(r() * s, r() * s, 5 + r() * 20, 0, Math.PI * 2);
          ctx.fill();
        }
      }),
    ),
  );
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
