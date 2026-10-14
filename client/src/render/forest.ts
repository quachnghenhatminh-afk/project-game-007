import * as THREE from 'three';
import { CITADEL } from '@game/shared';
import type { Collider } from './citadel.ts';

// Mixed forest: tall/medium/short pines, round broadleaf trees, lots of bushes
// and rocks. Every kind is one InstancedMesh, so the whole forest costs ~10 draw calls.

const C = CITADEL;
const ROAD_HALF = 3;
const up = new THREE.Vector3(0, 1, 0);

export interface Forest {
  group: THREE.Group;
  /** Trunks inside the play area (the player bumps into them). */
  colliders: Collider[];
}

interface Spot {
  x: number;
  z: number;
}

/** @param density 0..1 multiplier on how many trees/bushes/rocks are placed (phones use less). */
export function buildForest(seed = 7, density = 1): Forest {
  const rnd = mulberry32(seed);
  const group = new THREE.Group();
  const colliders: Collider[] = [];

  /** Distance from (x,z) to the nearest road center line (outside the walls). */
  const roadDistance = (x: number, z: number) => {
    let best = Infinity;
    for (const g of C.gateAngles) {
      const along = x * Math.sin(g) + z * Math.cos(g);
      if (along < 0) continue;
      best = Math.min(best, Math.abs(x * Math.cos(g) - z * Math.sin(g)));
    }
    return best;
  };
  const scatter = (wanted: number, rMin: number, rMax: number, roadClear: number): Spot[] => {
    const count = Math.round(wanted * density);
    const out: Spot[] = [];
    for (let guard = 0; out.length < count && guard < count * 20; guard++) {
      const r = Math.sqrt(rMin * rMin + rnd() * (rMax * rMax - rMin * rMin));
      const a = rnd() * Math.PI * 2;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (roadDistance(x, z) < roadClear + rnd() * 3) continue;
      out.push({ x, z });
    }
    return out;
  };

  const flatMat = (color: number) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95 });
  const tinted = () => new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.95 });
  const unitCone = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
  const unitTrunk = new THREE.CylinderGeometry(0.7, 1, 1, 6).translate(0, 0.5, 0);
  const blob = new THREE.IcosahedronGeometry(1, 0);
  const rock = new THREE.DodecahedronGeometry(1, 0);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, shadow = true) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(n, 1));
    m.count = n;
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const addTrunkCollider = (x: number, z: number, r: number) => {
    if (Math.hypot(x, z) < C.playAreaRadius + 2) colliders.push({ x, z, r });
  };

  // --- Pines: tall, medium, short share three instanced meshes -----------------
  const pineSpots = [
    ...scatter(380, C.forestInnerRadius + 6, C.forestOuterRadius, ROAD_HALF + 6).map((v) => ({ ...v, h: 15 + rnd() * 8 })),
    ...scatter(700, C.forestInnerRadius, C.forestOuterRadius, ROAD_HALF + 4).map((v) => ({ ...v, h: 7 + rnd() * 6 })),
    ...scatter(480, C.wallRadius + 9, C.forestOuterRadius, ROAD_HALF + 2).map((v) => ({ ...v, h: 2.5 + rnd() * 3.5 })),
  ];
  const n = pineSpots.length;
  const trunks = instanced(unitTrunk, flatMat(0x4a3322), n);
  const lower = instanced(unitCone, tinted(), n);
  const middle = instanced(unitCone, tinted(), n);
  const upper = instanced(unitCone, tinted(), n);
  pineSpots.forEach(({ x, z, h }, i) => {
    q.setFromAxisAngle(up, rnd() * Math.PI * 2);
    const trunkH = h * 0.22;
    const tw = 0.12 + h * 0.018;
    trunks.setMatrixAt(i, m4.compose(p.set(x, 0, z), q, s.set(tw, trunkH, tw)));
    const base = trunkH * 0.55;
    const w = h * (0.26 + rnd() * 0.06);
    lower.setMatrixAt(i, m4.compose(p.set(x, base, z), q, s.set(w, h * 0.45, w)));
    middle.setMatrixAt(i, m4.compose(p.set(x, base + h * 0.25, z), q, s.set(w * 0.75, h * 0.42, w * 0.75)));
    upper.setMatrixAt(i, m4.compose(p.set(x, base + h * 0.48, z), q, s.set(w * 0.48, h * 0.4, w * 0.48)));
    col.setHSL(0.3 + rnd() * 0.07, 0.38 + rnd() * 0.18, 0.15 + rnd() * 0.08);
    lower.setColorAt(i, col);
    middle.setColorAt(i, col.offsetHSL(0, 0, 0.03));
    upper.setColorAt(i, col.offsetHSL(0, 0, 0.03));
    if (h > 5) addTrunkCollider(x, z, tw + 0.15);
  });

  // --- Broadleaf trees: trunk + 3 leafy blobs ---------------------------------
  const broadSpots = scatter(300, C.forestInnerRadius - 2, C.forestOuterRadius, ROAD_HALF + 5);
  const bTrunks = instanced(unitTrunk, flatMat(0x553a26), broadSpots.length);
  const bLeaves = instanced(blob, tinted(), broadSpots.length * 3);
  broadSpots.forEach(({ x, z }, i) => {
    const h = 4 + rnd() * 4;
    q.setFromAxisAngle(up, rnd() * Math.PI * 2);
    bTrunks.setMatrixAt(i, m4.compose(p.set(x, 0, z), q, s.set(0.3, h, 0.3)));
    col.setHSL(0.22 + rnd() * 0.1, 0.4 + rnd() * 0.2, 0.2 + rnd() * 0.08);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + rnd();
      const rr = 1.6 + rnd() * 1.4;
      p.set(x + Math.sin(a) * rr * 0.6, h + rnd() * 1.6 - 0.3, z + Math.cos(a) * rr * 0.6);
      bLeaves.setMatrixAt(i * 3 + k, m4.compose(p, q, s.set(rr, rr * 0.85, rr)));
      bLeaves.setColorAt(i * 3 + k, col.offsetHSL(0, 0, (rnd() - 0.5) * 0.04));
    }
    addTrunkCollider(x, z, 0.45);
  });

  // --- Bushes: clusters of 2–4 blobs; many hug tree bases and road edges ------
  const bushSpots: Spot[] = [
    ...scatter(1100, C.wallRadius + 5, C.forestOuterRadius, ROAD_HALF + 0.8),
    ...pineSpots.filter(() => rnd() < 0.35).map(({ x, z }) => ({ x: x + (rnd() - 0.5) * 3, z: z + (rnd() - 0.5) * 3 })),
  ];
  const bushBlobs: Array<{ x: number; y: number; z: number; r: number; c: THREE.Color }> = [];
  for (const { x, z } of bushSpots) {
    const k = 2 + Math.floor(rnd() * 3);
    const size = 0.5 + rnd() * 0.9;
    const c = new THREE.Color().setHSL(0.25 + rnd() * 0.1, 0.35 + rnd() * 0.2, 0.16 + rnd() * 0.08);
    for (let j = 0; j < k; j++) {
      const r = size * (0.6 + rnd() * 0.5);
      bushBlobs.push({ x: x + (rnd() - 0.5) * size * 1.6, y: r * 0.55, z: z + (rnd() - 0.5) * size * 1.6, r, c });
    }
  }
  const bushes = instanced(blob, tinted(), bushBlobs.length, false);
  bushBlobs.forEach(({ x, y, z, r, c }, i) => {
    q.setFromAxisAngle(up, rnd() * Math.PI * 2);
    bushes.setMatrixAt(i, m4.compose(p.set(x, y, z), q, s.set(r, r * 0.75, r)));
    bushes.setColorAt(i, col.copy(c).offsetHSL(0, 0, (rnd() - 0.5) * 0.05));
  });

  // --- Rocks -------------------------------------------------------------------
  const rockSpots = scatter(260, C.wallRadius + 6, C.forestOuterRadius, ROAD_HALF + 1);
  const rocks = instanced(rock, tinted(), rockSpots.length);
  rockSpots.forEach(({ x, z }, i) => {
    const r = 0.3 + rnd() * rnd() * 1.6;
    q.setFromEuler(new THREE.Euler(rnd(), rnd() * 6, rnd()));
    rocks.setMatrixAt(i, m4.compose(p.set(x, r * 0.3, z), q, s.set(r * (1 + rnd() * 0.5), r * 0.7, r)));
    rocks.setColorAt(i, col.setHSL(0.08, 0.05, 0.3 + rnd() * 0.15));
    if (r > 1) addTrunkCollider(x, z, r * 0.9);
  });

  return { group, colliders };
}

/** Small deterministic RNG so the forest looks the same every load. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
