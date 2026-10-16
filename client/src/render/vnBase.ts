import * as THREE from 'three';
import { CITADEL } from '@game/shared';
import type { BoxCollider, Collider, GameMap, MapOptions } from './gameMap.ts';
import type { Destructibles, TreePart } from '../game/destructibles.ts';
import { mergeStaticMeshes } from './mergeStatic.ts';
import { boxGeo, cylGeo, scaleUv } from './geometry.ts';
import { buildCrystal } from './crystal.ts';
import { isDestructible, polar } from './citadel.ts';
import { mulberry32 } from './forest.ts';
import {
  awningTexture,
  concreteSlabTexture,
  corrugatedTexture,
  dirtRoadTexture,
  glowTexture,
  hazardConcreteTexture,
  signTexture,
  tropicalGroundTexture,
} from './textures.ts';

// Map 2 "Căn cứ Container" — a Vietnamese-flavoured base in a tropical forest:
// a ring of stacked shipping containers, concrete blocks, fences and watchtowers;
// a big supermarket (siêu thị) as headquarters; the crystal in the middle of the yard;
// coconut palms and mangrove scrub outside; the sea in the distance. Daytime.

const C = CITADEL;
const R = 27; // perimeter radius
const GAP_HALF = (C.gateWidth / 2 + 1.6) / R; // half-angle of each entrance
const ROAD_WIDTH = 6;
const QUARTERS = C.gateAngles.map((a) => a + Math.PI / 4);
const up = new THREE.Vector3(0, 1, 0);

export function buildVnBase(scene: THREE.Scene, opts: MapOptions = {}): GameMap & { root: THREE.Group } {
  const root = new THREE.Group();
  scene.add(root);
  const colliders: Collider[] = [];
  const boxes: BoxCollider[] = [];
  const destructibles = opts.destructibles;
  const rnd = mulberry32(2026);

  // Same color → same material, so mergeStaticMeshes can batch them into one draw call.
  const matCache = new Map<number, THREE.MeshStandardMaterial>();
  const mat = (color: number, extra?: THREE.MeshStandardMaterialParameters) => {
    if (extra) return new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
    let m = matCache.get(color);
    if (!m) matCache.set(color, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true })));
    return m;
  };
  const M = {
    wood: mat(0x8a6238),
    woodDark: mat(0x5c3f24),
    sand: mat(0xc9ad7c),
    rock: mat(0x8f8b84),
    concrete: new THREE.MeshStandardMaterial({ map: hazardConcreteTexture(), roughness: 0.95 }),
    concretePlain: mat(0xa9a69d),
    metal: mat(0x9aa4ad, { metalness: 0.6, roughness: 0.35 }),
    tarpGreen: mat(0x5f7a3a, { side: THREE.DoubleSide }),
    tarpOlive: mat(0x7d7f45, { side: THREE.DoubleSide }),
    roofRed: mat(0xb8452e),
    roofBlue: mat(0x2f62a8),
    shopGreen: mat(0x3e8a64),
    shopTrim: mat(0xe8e2cf),
    glass: new THREE.MeshStandardMaterial({ color: 0x2a4a5a, roughness: 0.1, metalness: 0.4 }),
    dark: mat(0x1a1a1a),
    solar: new THREE.MeshStandardMaterial({ color: 0x1d2f6a, roughness: 0.2, metalness: 0.6 }),
    leaf: mat(0x3f7a2c),
    lantern: new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb347, emissiveIntensity: 1.4 }),
  };
  const containerMats = [0xb0412e, 0x2f5f9e, 0x4f7a3a, 0x9a5a2a, 0xc79a2a].map(
    (c) => new THREE.MeshStandardMaterial({ map: corrugatedTexture(), color: c, roughness: 0.6, metalness: 0.3 }),
  );
  const barrelMats = [0x2f62a8, 0xb8452e, 0x3f7a3a].map((c) => mat(c, { metalness: 0.3, roughness: 0.5 }));

  const mesh = (geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, material);
    o.position.set(x, y, z);
    return o;
  };
  /** Adds `obj` at world (x, z) with rotation `rot`; optional circle or box collider. */
  const put = (obj: THREE.Object3D, x: number, z: number, rot = 0, col?: { r?: number; hw?: number; hd?: number }) => {
    obj.position.x = x;
    obj.position.z = z;
    obj.rotation.y = rot;
    root.add(obj);
    let collider: Collider | null = null;
    if (col?.r) colliders.push((collider = { x, z, r: col.r }));
    if (col?.hw && col?.hd) boxes.push({ x, z, hw: col.hw, hd: col.hd, rot });
    return { obj, collider };
  };
  /** Polar version of put: angle a, radius r, facing tangentially (+ extra turn). */
  const putPolar = (obj: THREE.Object3D, a: number, r: number, turn = 0, col?: { r?: number; hw?: number; hd?: number }) =>
    put(obj, Math.sin(a) * r, Math.cos(a) * r, a + turn, col);
  /** A smashable prop: merged into one object and registered with Destructibles. */
  const breakable = (obj: THREE.Object3D, x: number, z: number, rot: number, r: number, debris: number) => {
    const g = new THREE.Group();
    g.add(obj);
    mergeStaticMeshes(g);
    g.userData.destructible = true;
    const { collider } = put(g, x, z, rot, { r });
    destructibles?.addProp(g, r, collider, debris);
    return g;
  };

  // --- Prop factories ------------------------------------------------------------
  const container = (color = Math.floor(rnd() * containerMats.length)) =>
    mesh(boxGeo(6.06, 2.6, 2.44, 1.8), containerMats[color]!, 0, 1.3, 0);
  const tWall = () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1.35, 2.3, 0.45), M.concrete, 0, 1.25, 0));
    g.add(mesh(new THREE.BoxGeometry(1.35, 0.3, 1.2), M.concretePlain, 0, 0.15, 0));
    return g;
  };
  const fence = (len: number) => {
    const g = new THREE.Group();
    const posts = Math.max(2, Math.round(len / 2) + 1);
    for (let i = 0; i < posts; i++) g.add(mesh(new THREE.BoxGeometry(0.16, 1.9, 0.16), M.woodDark, -len / 2 + (i * len) / (posts - 1), 0.95, 0));
    for (const y of [0.7, 1.45]) g.add(mesh(new THREE.BoxGeometry(len, 0.12, 0.08), M.wood, 0, y, 0));
    return g;
  };
  const sandbags = (len: number, rows = 3) => {
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(1, 7, 5);
    for (let row = 0; row < rows; row++) {
      const n = Math.max(1, Math.round(len / 0.75) - row);
      for (let i = 0; i < n; i++) {
        const b = mesh(geo, M.sand, -((n - 1) * 0.75) / 2 + i * 0.75, 0.18 + row * 0.3, 0);
        b.scale.set(0.42, 0.17, 0.26);
        b.rotation.y = (rnd() - 0.5) * 0.2;
        g.add(b);
      }
    }
    return g;
  };
  const barrel = (m = barrelMats[Math.floor(rnd() * barrelMats.length)]!) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.05, 12), m, 0, 0.525, 0));
    for (const y of [0.3, 0.75]) g.add(mesh(new THREE.TorusGeometry(0.385, 0.025, 4, 16).rotateX(Math.PI / 2), M.dark, 0, y, 0));
    return g;
  };
  const crate = (s = 0.9) => mesh(boxGeo(s, s, s, 1), M.wood, 0, s / 2, 0);
  const crates = () => {
    const g = new THREE.Group();
    g.add(crate(), crate().translateX(0.95), crate(0.8).translateX(0.45).translateY(0.9));
    return g;
  };
  const rock = (r: number) => {
    const m = mesh(new THREE.DodecahedronGeometry(r, 0), M.rock, 0, r * 0.45, 0);
    m.scale.set(1, 0.85 + rnd() * 0.5, 0.8 + rnd() * 0.4);
    m.rotation.set(rnd(), rnd() * 6, rnd() * 0.3);
    return m;
  };
  const watchtower = (roof: THREE.Material) => {
    const g = new THREE.Group();
    const H = 5;
    for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) g.add(mesh(new THREE.BoxGeometry(0.2, H, 0.2), M.woodDark, x, H / 2, z));
    for (const side of [-1, 1]) {
      for (const dir of [-1, 1]) {
        const brace = mesh(new THREE.BoxGeometry(0.1, 3.4, 0.1), M.wood, 0, H * 0.45, side * 1.2);
        brace.rotation.z = dir * 0.62;
        g.add(brace);
        const brace2 = mesh(new THREE.BoxGeometry(0.1, 3.4, 0.1), M.wood, side * 1.2, H * 0.45, 0);
        brace2.rotation.x = dir * 0.62;
        g.add(brace2);
      }
    }
    g.add(mesh(new THREE.BoxGeometry(3, 0.2, 3), M.wood, 0, H, 0));
    for (const [x, z, w, d] of [[0, 1.45, 3, 0.08], [0, -1.45, 3, 0.08], [1.45, 0, 0.08, 3], [-1.45, 0, 0.08, 3]] as const) {
      g.add(mesh(new THREE.BoxGeometry(w, 1, d), M.wood, x, H + 0.6, z));
    }
    for (const x of [-1.35, 1.35]) for (const z of [-1.35, 1.35]) g.add(mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), M.woodDark, x, H + 1.1, z));
    const r = mesh(new THREE.ConeGeometry(2.5, 1.5, 4), roof, 0, H + 2.9, 0);
    r.rotation.y = Math.PI / 4;
    g.add(r);
    return g;
  };
  const lanternPositions: THREE.Vector3[] = [];
  const lampPost = (x: number, z: number) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.2, 6), M.woodDark, 0, 1.6, 0));
    g.add(mesh(new THREE.BoxGeometry(0.36, 0.42, 0.36), M.lantern, 0, 3.35, 0));
    g.add(mesh(new THREE.ConeGeometry(0.3, 0.22, 4).rotateY(Math.PI / 4), M.woodDark, 0, 3.67, 0));
    put(g, x, z, 0, { r: 0.25 });
    lanternPositions.push(new THREE.Vector3(x, 3.35, z));
  };
  const tarpStall = (tarp: THREE.Material) => {
    const g = new THREE.Group();
    for (const x of [-1.4, 1.4]) for (const z of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), M.woodDark, x, 1.2, z));
    const t = mesh(new THREE.BoxGeometry(3.4, 0.05, 2.6), tarp, 0, 2.45, 0);
    t.rotation.x = 0.12;
    g.add(t);
    g.add(mesh(boxGeo(2.6, 0.9, 1, 1), M.wood, 0, 0.45, 0.3));
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), mat([0xd9473b, 0xf0c040, 0x5fae4a, 0xe8e2cf][i % 4]!), -1 + i * 0.5, 1.03, 0.3));
    return g;
  };
  const cart = () => {
    const g = new THREE.Group();
    const wire = new THREE.MeshStandardMaterial({ color: 0xc8ced4, metalness: 0.7, roughness: 0.3, wireframe: true });
    g.add(mesh(new THREE.BoxGeometry(0.6, 0.45, 0.9, 3, 2, 4), wire, 0, 0.75, 0));
    g.add(mesh(new THREE.BoxGeometry(0.62, 0.04, 0.04), M.roofRed, 0, 1.0, -0.5));
    for (const x of [-0.25, 0.25]) for (const z of [-0.35, 0.35]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8).rotateZ(Math.PI / 2), M.dark, x, 0.08, z));
    return g;
  };

  // --- Ground, roads, water -------------------------------------------------------
  const flat = (geo: THREE.BufferGeometry, material: THREE.Material, y: number) => {
    const m = mesh(geo, material, 0, y, 0);
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    root.add(m);
  };
  flat(scaleUv(new THREE.PlaneGeometry(600, 600), 600 / 8), new THREE.MeshStandardMaterial({ map: tropicalGroundTexture(), roughness: 1 }), 0);
  flat(scaleUv(new THREE.CircleGeometry(R + 1.5, 72), ((R + 1.5) * 2) / 5), new THREE.MeshStandardMaterial({ map: concreteSlabTexture(), roughness: 0.95 }), 0.02);
  flat(new THREE.RingGeometry(108, 420, 72), new THREE.MeshStandardMaterial({ color: 0x2f8fc6, roughness: 0.15, metalness: 0.2 }), 0.15);
  const roadMat = new THREE.MeshStandardMaterial({ map: dirtRoadTexture(), color: 0xe0c9a0, roughness: 1 });
  for (const a of C.gateAngles) {
    const len = C.roadLength + 6;
    const road = mesh(boxGeo(ROAD_WIDTH, 0.06, len, ROAD_WIDTH), roadMat);
    road.position.copy(polar(a, R + len / 2 - 2, 0.03));
    road.rotation.y = a;
    road.receiveShadow = true;
    root.add(road);
    for (const r of [40, 52, 64]) for (const side of [-1, 1]) {
      const p = polar(a, r).add(new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(side * (ROAD_WIDTH / 2 + 1)));
      lampPost(p.x, p.z);
    }
    // Monster portal at the end of the road, inside the fog.
    const portal = mesh(new THREE.TorusGeometry(3.4, 0.55, 8, 28), mat(0x22122e, { emissive: 0xb04bd1, emissiveIntensity: 0.6 }));
    portal.position.copy(polar(a, C.wallRadius + C.roadLength + 1, 3.6));
    portal.rotation.y = a;
    root.add(portal);
  }

  // --- Perimeter: containers, concrete T-walls, fences, sandbags, rocks ----------
  type Piece = { len: number; build(a: number): void };
  const tangentPiece = (len: number, make: () => THREE.Object3D, depth: number, height = 2) => ({
    len,
    build(a: number) {
      putPolar(make(), a, R, 0, { hw: len / 2, hd: depth / 2 });
      void height;
    },
  });
  const pieces: Piece[] = [
    tangentPiece(6.1, () => container(), 2.44),
    {
      len: 4.2,
      build(a) {
        for (let i = -1; i <= 1; i++) {
          const da = (i * 1.4) / R;
          putPolar(tWall(), a + da, R, (rnd() - 0.5) * 0.08, { hw: 0.68, hd: 0.6 });
        }
      },
    },
    {
      len: 6.1,
      build(a) {
        const g = new THREE.Group();
        g.add(container());
        const top = container();
        top.position.y += 2.6;
        top.rotation.y = (rnd() - 0.5) * 0.12;
        g.add(top);
        putPolar(g, a, R, 0, { hw: 3.05, hd: 1.22 });
      },
    },
    {
      len: 4.4,
      build(a) {
        putPolar(fence(4.2), a, R + 0.6, 0, { hw: 2.1, hd: 0.25 });
        putPolar(sandbags(3.6), a, R - 0.6, 0, { hw: 1.8, hd: 0.35 });
      },
    },
    tangentPiece(4.2, () => {
      const g = new THREE.Group();
      g.add(rock(1.5), rock(1.1).translateX(1.6), rock(0.9).translateX(-1.5));
      return g;
    }, 2.6),
    tangentPiece(6.1, () => container(), 2.44),
  ];
  for (const q of QUARTERS) {
    const from = q - Math.PI / 4 + GAP_HALF;
    const to = q + Math.PI / 4 - GAP_HALF;
    let s = from * R;
    const total = pieces.reduce((acc, p) => acc + p.len + 0.25, 0);
    s += (to * R - from * R - total) / 2; // center the sequence in the quarter
    for (const p of pieces) {
      p.build((s + p.len / 2) / R);
      s += p.len + 0.25;
    }
    // Watchtower inside the wall, lamp posts along the inner side.
    const tower = watchtower(QUARTERS.indexOf(q) % 2 ? M.roofBlue : M.roofRed);
    putPolar(tower, q, R - 3.2, 0, { r: 1.9 });
    for (const da of [-0.42, 0.42]) {
      const p = polar(q + da, R - 2.2);
      lampPost(p.x, p.z);
    }
  }
  // Entrance markers: concrete blocks + lamps on both sides of each gap.
  for (const a of C.gateAngles) {
    for (const side of [-1, 1]) {
      const ea = a + side * (GAP_HALF + 0.02);
      putPolar(tWall(), ea, R + 0.4, Math.PI / 2, { hw: 0.68, hd: 0.6 });
      const p = polar(a + side * (GAP_HALF + 0.08), R - 1.6);
      lampPost(p.x, p.z);
    }
  }

  // --- Headquarters: the supermarket (between gates 1 and 2) --------------------
  {
    const a = Math.PI / 4;
    const W = 14;
    const D = 10;
    const H = 6.5;
    const g = new THREE.Group();
    g.add(mesh(boxGeo(W, H, D, 2), M.shopGreen, 0, H / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(W + 0.3, 0.5, D + 0.3), M.shopTrim, 0, H + 0.25, 0)); // parapet
    // Front (local +Z faces the crystal): windows with shelves, entrance, awning, sign.
    for (const x of [-4.4, 4.4]) {
      g.add(mesh(new THREE.BoxGeometry(4.6, 2.7, 0.08), M.glass, x, 1.75, D / 2 + 0.03));
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 6; i++) {
          const c = [0xd9473b, 0xf0c040, 0x5fae4a, 0x3b7bd9, 0xe88a2a][(i + row) % 5]!;
          g.add(mesh(new THREE.BoxGeometry(0.55, 0.45, 0.3), mat(c), x - 1.7 + i * 0.68, 0.75 + row * 0.75, D / 2 - 0.35));
        }
      }
    }
    g.add(mesh(new THREE.BoxGeometry(3.2, 3, 0.1), M.dark, 0, 1.5, D / 2 + 0.03));
    const awning = mesh(scaleUv(new THREE.BoxGeometry(W - 0.6, 0.06, 2.4), 7, 1), new THREE.MeshStandardMaterial({ map: awningTexture(), roughness: 0.8 }), 0, 3.45, D / 2 + 1.1);
    awning.rotation.x = 0.32;
    g.add(awning);
    const sign = mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshStandardMaterial({ map: signTexture('SIÊU THỊ'), emissive: 0x220000, roughness: 0.6 }), 0, 5.1, D / 2 + 0.06);
    g.add(sign);
    // Vines on the corners.
    for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) g.add(mesh(new THREE.BoxGeometry(0.5, 4.5, 0.15), M.leaf, x, 4, D / 2 + 0.1));
    // Roof: solar panels, water tank, AC units.
    for (let i = 0; i < 6; i++) {
      const p = mesh(new THREE.BoxGeometry(1.8, 0.08, 1.1), M.solar, -4.5 + (i % 3) * 2.1, H + 0.75, -1.2 + Math.floor(i / 3) * 1.5);
      p.rotation.x = -0.35;
      g.add(p);
    }
    const tank = new THREE.Group();
    tank.add(mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.9, 16), M.metal, 0, 2.2, 0));
    tank.add(mesh(new THREE.ConeGeometry(1.1, 0.5, 16), M.metal, 0, 3.4, 0));
    for (const x of [-0.7, 0.7]) for (const z of [-0.7, 0.7]) tank.add(mesh(new THREE.BoxGeometry(0.12, 1.3, 0.12), M.woodDark, x, 0.65, z));
    tank.position.set(4.6, H + 0.5, -2.5);
    g.add(tank);
    g.add(mesh(new THREE.BoxGeometry(1.1, 0.8, 0.8), M.metal, 1.5, H + 0.9, -3.2));
    put(g, Math.sin(a) * 18, Math.cos(a) * 18, a + Math.PI, { hw: W / 2, hd: D / 2 });
    // Shopping carts and crates in front (smashable).
    const front = new THREE.Vector3(Math.sin(a) * 11.6, 0, Math.cos(a) * 11.6);
    const side = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    for (const k of [-2.6, -1.8, 2.2]) {
      const p = front.clone().addScaledVector(side, k);
      breakable(cart(), p.x, p.z, a + rnd() * 0.6, 0.55, 0xc8ced4);
    }
    const pc = front.clone().addScaledVector(side, 4.6);
    breakable(crates(), pc.x, pc.z, a + 0.3, 1.1, 0x8a6238);
  }

  // --- The other quarters ------------------------------------------------------------
  const deg = (d: number) => (d * Math.PI) / 180;
  // Market under green tarps (gate 2–3).
  {
    const q = QUARTERS[1]!;
    for (const [da, r] of [[-18, 19.5], [0, 20.5], [18, 19.5]] as const) putPolar(tarpStall(M.tarpGreen), q + deg(da), r, Math.PI, { hw: 1.6, hd: 1.2 });
    for (const [da, r] of [[-30, 21], [26, 22], [-6, 16]] as const) {
      const p = polar(q + deg(da), r);
      breakable(barrel(), p.x, p.z, rnd() * 6, 0.45, 0x2f62a8);
    }
    const p = polar(q + deg(10), 16);
    breakable(crates(), p.x, p.z, rnd(), 1.1, 0x8a6238);
  }
  // Container depot with sandbag walls (gate 3–4).
  {
    const q = QUARTERS[2]!;
    const g = new THREE.Group();
    g.add(container(1));
    const top = container(4);
    top.position.y += 2.6;
    g.add(top);
    putPolar(g, q, 20, Math.PI / 2, { hw: 3.05, hd: 1.22 });
    putPolar(container(0), q + deg(20), 18.5, Math.PI / 2 + 0.5, { hw: 3.05, hd: 1.22 });
    for (const da of [-20, -12]) putPolar(sandbags(2.4, 2), q + deg(da), 15, 0, { hw: 1.2, hd: 0.35 });
    for (const [da, r] of [[-25, 20], [-27, 21.2], [28, 21]] as const) {
      const p = polar(q + deg(da), r);
      breakable(barrel(barrelMats[0]), p.x, p.z, rnd() * 6, 0.45, 0x2f62a8);
    }
  }
  // Camp: olive tarps, crates, red barrels (gate 4–1).
  {
    const q = QUARTERS[3]!;
    putPolar(tarpStall(M.tarpOlive), q - deg(14), 20, Math.PI, { hw: 1.6, hd: 1.2 });
    putPolar(tarpStall(M.tarpOlive), q + deg(14), 20, Math.PI, { hw: 1.6, hd: 1.2 });
    for (const [da, r] of [[-28, 16], [0, 15.5], [28, 16]] as const) {
      const p = polar(q + deg(da), r);
      breakable(crates(), p.x, p.z, rnd(), 1.1, 0x8a6238);
    }
    for (const [da, r] of [[-6, 22], [6, 22.6]] as const) {
      const p = polar(q + deg(da), r);
      breakable(barrel(barrelMats[1]), p.x, p.z, rnd() * 6, 0.45, 0xb8452e);
    }
    putPolar(sandbags(3, 2), q, 13.5, 0, { hw: 1.5, hd: 0.35 });
  }

  // --- Center: the crystal on concrete, ringed by sandbags and wooden barricades --
  root.add(mesh(new THREE.BoxGeometry(3.2, 0.5, 3.2), M.concretePlain, 0, 0.25, 0));
  const crystal = buildCrystal(root, 4.4, 0.62, 250);
  for (const a of QUARTERS) {
    putPolar(sandbags(3.2, 2), a, 4.2, 0);
    const x = new THREE.Group();
    for (const s of [-1, 1]) {
      const plank = mesh(new THREE.BoxGeometry(0.16, 2.2, 0.12), M.wood, 0, 0.9, 0);
      plank.rotation.z = s * 0.7;
      x.add(plank);
    }
    x.add(mesh(new THREE.BoxGeometry(1.8, 0.12, 0.12), M.woodDark, 0, 0.55, 0));
    putPolar(x, a + deg(28), 3.4, 0);
  }
  colliders.push({ x: 0, z: 0, r: 4.6 });
  for (const a of [deg(30), deg(-30)]) {
    const p = polar(a, 5.4);
    lampPost(p.x, p.z);
  }
  for (const a of [deg(150), deg(200)]) {
    const p = polar(a, 5.6);
    breakable(barrel(), p.x, p.z, rnd() * 6, 0.45, 0x2f62a8);
  }

  // Little weeds poking out of the concrete.
  {
    const n = 220;
    const weeds = new THREE.InstancedMesh(grassTuftGeometry(), new THREE.MeshStandardMaterial({ color: 0x6fae3c, side: THREE.DoubleSide, roughness: 0.9 }), n);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const r = 3 + Math.sqrt(rnd()) * (R - 4);
      const a = rnd() * Math.PI * 2;
      const s = 0.7 + rnd() * 0.9;
      q.setFromAxisAngle(up, rnd() * 6);
      weeds.setMatrixAt(i, m4.compose(new THREE.Vector3(Math.sin(a) * r, 0.02, Math.cos(a) * r), q, new THREE.Vector3(s, s, s)));
    }
    root.add(weeds);
  }

  // Lantern glow (one point cloud for all lamps).
  {
    const pos = new Float32Array(lanternPositions.length * 3);
    lanternPositions.forEach((p, i) => pos.set([p.x, p.y, p.z], i * 3));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    root.add(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({ map: glowTexture(), color: 0xffc070, size: 2.2, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }),
      ),
    );
  }

  // --- Tropical forest -----------------------------------------------------------------
  const forest = buildTropicalForest(rnd, opts.lowQuality ? 0.45 : 1, destructibles);
  root.add(forest.group);
  colliders.push(...forest.colliders);

  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  const animated = new Set<THREE.Object3D>(crystal.animated);
  mergeStaticMeshes(root, (m) => animated.has(m) || isDestructible(m));

  return {
    id: 'vn-base',
    environment: 'day',
    root,
    colliders,
    boxes,
    spawn: { pos: new THREE.Vector3(0, 1.7, -11), yaw: Math.PI },
    coreTop: crystal.top,
    update(_dt, time) {
      crystal.update(time);
    },
  };
}

/** A tuft of 7 thin grass blades leaning outwards (~0.35m tall). */
function grassTuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + k;
    const h = 0.25 + (k % 3) * 0.06;
    const lean = 0.12 + (k % 2) * 0.06;
    const cx = Math.cos(a);
    const sz = Math.sin(a);
    // Blade = one triangle: two base points across the blade, tip leaning outwards.
    pos.push(-sz * 0.025, 0, cx * 0.025, sz * 0.025, 0, -cx * 0.025, cx * lean, h, sz * lean);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

// --- Coconut palms + mangrove scrub ------------------------------------------------------

function frondGeometry(): THREE.BufferGeometry {
  const len = 3.6;
  const geo = new THREE.PlaneGeometry(1.1, 1, 2, 7);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) + 0.5; // 0 at the crown → 1 at the tip
    const x = p.getX(i) * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (1 - t * 0.4);
    const z = t * len;
    const y = len * (0.28 * t - 0.5 * t * t) + Math.abs(x) * 0.35; // arch up, droop down, V-fold
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function palmTrunk(height: number, lean: number): { geo: THREE.BufferGeometry; top: THREE.Vector3 } {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.12, height * 0.35, 0),
    new THREE.Vector3(lean * 0.5, height * 0.7, 0),
    new THREE.Vector3(lean, height, 0),
  ]);
  return { geo: new THREE.TubeGeometry(curve, 10, 0.2, 6, false), top: new THREE.Vector3(lean, height, 0) };
}

function buildTropicalForest(
  rnd: () => number,
  density: number,
  destructibles?: Destructibles,
): { group: THREE.Group; colliders: Collider[] } {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const roadDistance = (x: number, z: number) => {
    let best = Infinity;
    for (const g of C.gateAngles) {
      const along = x * Math.sin(g) + z * Math.cos(g);
      if (along < 0) continue;
      best = Math.min(best, Math.abs(x * Math.cos(g) - z * Math.sin(g)));
    }
    return best;
  };
  const scatter = (wanted: number, rMin: number, rMax: number, clear: number) => {
    const out: Array<{ x: number; z: number }> = [];
    const count = Math.round(wanted * density);
    for (let guard = 0; out.length < count && guard < count * 20; guard++) {
      const r = Math.sqrt(rMin * rMin + rnd() * (rMax * rMax - rMin * rMin));
      const a = rnd() * Math.PI * 2;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (roadDistance(x, z) < clear + rnd() * 3) continue;
      out.push({ x, z });
    }
    return out;
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  const flat = (c: number) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9 });
  const tinted = (extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9, ...extra });
  const instanced = (geo: THREE.BufferGeometry, material: THREE.Material, n: number, shadow = true) => {
    const m = new THREE.InstancedMesh(geo, material, Math.max(1, n));
    m.count = n;
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const collide = (x: number, z: number, r: number): Collider | null => {
    if (Math.hypot(x, z) > C.playAreaRadius + 2) return null;
    const c: Collider = { x, z, r };
    colliders.push(c);
    return c;
  };
  const register = (x: number, z: number, h: number, parts: TreePart[], c: Collider | null) => {
    if (destructibles && Math.hypot(x, z) < 100) destructibles.addTree(new THREE.Vector3(x, 0, z), h, parts, c);
  };

  // Coconut palms: 3 trunk shapes, 8 fronds and 3 coconuts each.
  const variants = [palmTrunk(7.5, 1.3), palmTrunk(9.5, 2.2), palmTrunk(11, 0.7)];
  const palms = scatter(520, C.forestInnerRadius - 6, 125, ROAD_WIDTH / 2 + 3).map((p) => ({ ...p, v: Math.floor(rnd() * 3) }));
  const trunkMeshes = variants.map((v, i) => instanced(v.geo, flat(0x8a6a48), palms.filter((p) => p.v === i).length));
  const fronds = instanced(frondGeometry(), tinted({ side: THREE.DoubleSide }), palms.length * 8);
  const nuts = instanced(new THREE.SphereGeometry(0.2, 6, 5), flat(0x5c4a1e), palms.length * 3, false);
  const counters = [0, 0, 0];
  palms.forEach((p, i) => {
    const v = variants[p.v]!;
    const yaw = rnd() * Math.PI * 2;
    const s = 0.85 + rnd() * 0.35;
    q.setFromAxisAngle(up, yaw);
    const ti = counters[p.v]!++;
    const trunk = trunkMeshes[p.v]!;
    trunk.setMatrixAt(ti, m4.compose(pos.set(p.x, 0, p.z), q, scl.setScalar(s)));
    const crown = v.top.clone().multiplyScalar(s).applyQuaternion(q).add(new THREE.Vector3(p.x, 0, p.z));
    const parts: TreePart[] = [{ mesh: trunk, index: ti }];
    col.setHSL(0.24 + rnd() * 0.06, 0.55 + rnd() * 0.2, 0.32 + rnd() * 0.08);
    for (let k = 0; k < 8; k++) {
      const fq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25 + rnd() * 0.3, yaw + (k / 8) * Math.PI * 2 + rnd() * 0.3, 0, 'YXZ'));
      fronds.setMatrixAt(i * 8 + k, m4.compose(crown, fq, scl.setScalar(s * (0.85 + rnd() * 0.3))));
      fronds.setColorAt(i * 8 + k, col);
      parts.push({ mesh: fronds, index: i * 8 + k });
    }
    for (let k = 0; k < 3; k++) {
      const a = yaw + (k / 3) * Math.PI * 2;
      nuts.setMatrixAt(i * 3 + k, m4.compose(crown.clone().add(new THREE.Vector3(Math.sin(a) * 0.3, -0.35, Math.cos(a) * 0.3)), q, scl.setScalar(1)));
      parts.push({ mesh: nuts, index: i * 3 + k });
    }
    register(p.x, p.z, v.top.y * s, parts, collide(p.x, p.z, 0.4));
  });

  // Mangrove-like trees: short trunk on stilt roots, round canopy.
  const mangroves = scatter(170, C.forestInnerRadius - 4, 120, ROAD_WIDTH / 2 + 3);
  const mTrunk = instanced(new THREE.CylinderGeometry(0.7, 1, 1, 6).translate(0, 0.5, 0), flat(0x5a4632), mangroves.length);
  const mRoots = instanced(new THREE.CylinderGeometry(0.05, 0.07, 1, 4).translate(0, 0.5, 0), flat(0x4a3a28), mangroves.length * 5, false);
  const mLeaves = instanced(new THREE.IcosahedronGeometry(1, 0), tinted(), mangroves.length * 3);
  mangroves.forEach((p, i) => {
    const h = 2.4 + rnd() * 1.6;
    q.setFromAxisAngle(up, rnd() * 6);
    mTrunk.setMatrixAt(i, m4.compose(pos.set(p.x, 0.6, p.z), q, scl.set(0.22, h, 0.22)));
    const parts: TreePart[] = [{ mesh: mTrunk, index: i }];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + rnd();
      const foot = new THREE.Vector3(p.x + Math.sin(a) * 1.1, 0, p.z + Math.cos(a) * 1.1);
      const top = new THREE.Vector3(p.x, 1.1, p.z);
      const dir = top.clone().sub(foot);
      const rq = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
      mRoots.setMatrixAt(i * 5 + k, m4.compose(foot, rq, scl.set(1, dir.length(), 1)));
      parts.push({ mesh: mRoots, index: i * 5 + k });
    }
    col.setHSL(0.27 + rnd() * 0.05, 0.45 + rnd() * 0.15, 0.22 + rnd() * 0.06);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + rnd();
      const rr = 1.3 + rnd() * 0.8;
      mLeaves.setMatrixAt(i * 3 + k, m4.compose(pos.set(p.x + Math.sin(a) * 0.7, h + 0.4 + rnd() * 0.6, p.z + Math.cos(a) * 0.7), q, scl.set(rr, rr * 0.7, rr)));
      mLeaves.setColorAt(i * 3 + k, col);
      parts.push({ mesh: mLeaves, index: i * 3 + k });
    }
    register(p.x, p.z, h + 1.5, parts, collide(p.x, p.z, 0.5));
  });

  // Dense bushes and spiky ferns.
  const bushes = scatter(1300, R + 3, 125, ROAD_WIDTH / 2 + 0.8);
  const bushMesh = instanced(new THREE.IcosahedronGeometry(1, 0), tinted(), bushes.length * 3, false);
  bushes.forEach((p, i) => {
    const size = 0.5 + rnd() * 1;
    col.setHSL(0.24 + rnd() * 0.1, 0.45 + rnd() * 0.2, 0.25 + rnd() * 0.1);
    for (let k = 0; k < 3; k++) {
      const r = size * (0.6 + rnd() * 0.5);
      q.setFromAxisAngle(up, rnd() * 6);
      bushMesh.setMatrixAt(i * 3 + k, m4.compose(pos.set(p.x + (rnd() - 0.5) * size * 1.6, r * 0.5, p.z + (rnd() - 0.5) * size * 1.6), q, scl.set(r, r * 0.7, r)));
      bushMesh.setColorAt(i * 3 + k, col);
    }
  });
  const ferns = scatter(700, R + 2, 110, ROAD_WIDTH / 2 + 0.5);
  const fernMesh = instanced(new THREE.ConeGeometry(1, 0.8, 6, 1, true).translate(0, 0.4, 0), tinted({ side: THREE.DoubleSide }), ferns.length, false);
  ferns.forEach((p, i) => {
    const s = 0.7 + rnd() * 0.9;
    q.setFromEuler(new THREE.Euler(Math.PI, rnd() * 6, 0)); // upside-down cone = fan of leaves
    fernMesh.setMatrixAt(i, m4.compose(pos.set(p.x, 0.75 * s, p.z), q, scl.set(s, s, s)));
    fernMesh.setColorAt(i, col.setHSL(0.26 + rnd() * 0.06, 0.6, 0.3 + rnd() * 0.08));
  });

  // Big grey boulders like the concept art.
  const rocks = scatter(150, R + 4, 110, ROAD_WIDTH / 2 + 1.5);
  const rockMesh = instanced(new THREE.DodecahedronGeometry(1, 0), tinted(), rocks.length);
  rocks.forEach((p, i) => {
    const r = 0.6 + rnd() * rnd() * 2.6;
    q.setFromEuler(new THREE.Euler(rnd() * 0.4, rnd() * 6, rnd() * 0.4));
    rockMesh.setMatrixAt(i, m4.compose(pos.set(p.x, r * 0.4, p.z), q, scl.set(r * (1 + rnd() * 0.4), r * (0.8 + rnd() * 0.5), r)));
    rockMesh.setColorAt(i, col.setHSL(0.08, 0.04, 0.48 + rnd() * 0.12));
    if (r > 1) collide(p.x, p.z, r * 0.9);
  });

  return { group, colliders };
}
