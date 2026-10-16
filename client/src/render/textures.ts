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

// --- Vietnam container base -------------------------------------------------------

/** Cracked concrete slabs with dirt stains. One tile = 5m × 5m (2 × 2 slabs). */
export function concreteSlabTexture(): THREE.CanvasTexture {
  return cached('concrete', () =>
    tiled(
      canvasTexture(512, (ctx, s) => {
        const r = rng(61);
        ctx.fillStyle = '#6d6a63';
        ctx.fillRect(0, 0, s, s);
        const half = s / 2;
        for (let y = 0; y < 2; y++) {
          for (let x = 0; x < 2; x++) {
            const l = 62 + r() * 10;
            ctx.fillStyle = `hsl(${35 + r() * 10}, ${6 + r() * 6}%, ${l}%)`;
            ctx.fillRect(x * half + 3, y * half + 3, half - 6, half - 6);
          }
        }
        // Yellow-brown stains and dirt.
        for (let i = 0; i < 60; i++) {
          ctx.fillStyle = `rgba(${150 + r() * 40},${120 + r() * 30},${60 + r() * 20},${r() * 0.18})`;
          ctx.beginPath();
          ctx.arc(r() * s, r() * s, 8 + r() * 40, 0, Math.PI * 2);
          ctx.fill();
        }
        // Cracks.
        ctx.strokeStyle = 'rgba(40,38,34,0.55)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 9; i++) {
          let x = r() * s;
          let y = r() * s;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let k = 0; k < 6; k++) {
            x += (r() - 0.5) * 50;
            y += (r() - 0.5) * 50;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        grain(ctx, s, r, 0.12, 12000);
      }),
    ),
  );
}

/** Corrugated steel (white, tinted by material color). One tile = 1m wide ribs × 1m. */
export function corrugatedTexture(): THREE.CanvasTexture {
  return cached('corrugated', () =>
    tiled(
      canvasTexture(256, (ctx, s) => {
        const r = rng(71);
        const ribs = 6;
        for (let i = 0; i < ribs; i++) {
          const g = ctx.createLinearGradient((i * s) / ribs, 0, ((i + 1) * s) / ribs, 0);
          g.addColorStop(0, '#9a9a9a');
          g.addColorStop(0.5, '#ffffff');
          g.addColorStop(1, '#8a8a8a');
          ctx.fillStyle = g;
          ctx.fillRect((i * s) / ribs, 0, s / ribs, s);
        }
        // Rust streaks and scratches.
        for (let i = 0; i < 30; i++) {
          ctx.fillStyle = `rgba(120,60,20,${r() * 0.25})`;
          ctx.fillRect(r() * s, r() * s, 2 + r() * 4, 10 + r() * 60);
        }
        grain(ctx, s, r, 0.1, 3000);
      }),
    ),
  );
}

/** Concrete block with yellow hazard chevrons. One tile = one block face. */
export function hazardConcreteTexture(): THREE.CanvasTexture {
  return cached('hazard', () => {
    const t = canvasTexture(256, (ctx, s) => {
      const r = rng(83);
      ctx.fillStyle = '#a9a69d';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(80,75,65,${r() * 0.18})`;
        ctx.beginPath();
        ctx.arc(r() * s, r() * s, 4 + r() * 18, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, s * 0.55, s, s * 0.22);
      ctx.clip();
      for (let x = -s; x < s * 2; x += 40) {
        ctx.fillStyle = '#e8b923';
        ctx.beginPath();
        ctx.moveTo(x, s * 0.55);
        ctx.lineTo(x + 20, s * 0.55);
        ctx.lineTo(x + 20 + s * 0.22, s * 0.77);
        ctx.lineTo(x + s * 0.22, s * 0.77);
        ctx.fill();
      }
      ctx.restore();
      grain(ctx, s, r, 0.15, 5000);
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** Green/white awning stripes (vertical). */
export function awningTexture(): THREE.CanvasTexture {
  return cached('awning', () =>
    tiled(
      canvasTexture(128, (ctx, s) => {
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = i % 2 ? '#f4f1e6' : '#2f8a4e';
          ctx.fillRect((i * s) / 4, 0, s / 4, s);
        }
      }),
    ),
  );
}

/** Shop sign with text (e.g. "SIÊU THỊ"). */
export function signTexture(text: string, bg = '#c8282a', fg = '#ffffff'): THREE.CanvasTexture {
  return cached(`sign:${text}:${bg}`, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1024, 256);
      ctx.strokeStyle = '#f2d34a';
      ctx.lineWidth = 14;
      ctx.strokeRect(10, 10, 1004, 236);
      ctx.fillStyle = fg;
      ctx.font = 'bold 150px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 512, 136);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Sunny tropical ground: sandy soil with grass patches. One tile = 8m. */
export function tropicalGroundTexture(): THREE.CanvasTexture {
  return cached('tropical', () =>
    tiled(
      canvasTexture(512, (ctx, s) => {
        const r = rng(97);
        ctx.fillStyle = '#b68f55';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 420; i++) {
          const grass = r() < 0.6;
          ctx.fillStyle = grass ? `rgba(${70 + r() * 40},${120 + r() * 50},${40 + r() * 20},${0.25 + r() * 0.3})` : `rgba(150,110,60,${r() * 0.3})`;
          ctx.beginPath();
          ctx.arc(r() * s, r() * s, 6 + r() * 34, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = 0; i < 2500; i++) {
          ctx.strokeStyle = `rgba(${90 + r() * 60},${150 + r() * 60},${50 + r() * 30},${0.2 + r() * 0.3})`;
          const x = r() * s;
          const y = r() * s;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 6);
          ctx.stroke();
        }
        grain(ctx, s, r, 0.1, 8000);
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
