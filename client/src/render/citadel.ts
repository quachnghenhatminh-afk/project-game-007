import * as THREE from 'three';
import { CITADEL } from '@game/shared';

// Placeholder geometry for map 1: a round citadel with 4 gates, a large crystal
// in the middle and a pine forest outside. Replace pieces with .glb art later.

const C = CITADEL;
export const GATE_COLORS = ['#d9473b', '#3b7bd9', '#e0b62c', '#8e4bd1'] as const;
export const TOWER_RADIUS = 2.4;
export const PEDESTAL_RADIUS = 3.8;
const PLAZA_RADIUS = 9;
const ROAD_WIDTH = 6;

/** Point on the circle at angle a (a=0 → +Z). */
export function polar(a: number, r: number, y = 0): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
}

/** Centers of the two towers flanking every gate. */
export function gateTowerPositions(): THREE.Vector3[] {
  const off = (C.gateWidth / 2 + TOWER_RADIUS) / C.wallRadius;
  return C.gateAngles.flatMap((a) => [polar(a - off, C.wallRadius), polar(a + off, C.wallRadius)]);
}

/** Smallest absolute angle difference to any gate direction. */
export function angleToNearestGate(a: number): number {
  let best = Infinity;
  for (const g of C.gateAngles) {
    const d = Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g)));
    best = Math.min(best, d);
  }
  return best;
}

export interface Citadel {
  root: THREE.Group;
  update(dt: number, time: number): void;
}

export function buildCitadel(scene: THREE.Scene): Citadel {
  const root = new THREE.Group();
  scene.add(root);

  const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });

  // --- Ground layers ---------------------------------------------------------
  const flat = (geo: THREE.BufferGeometry, color: number, y: number) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  flat(new THREE.PlaneGeometry(600, 600), 0x5f8a3e, 0);
  flat(new THREE.CircleGeometry(C.wallRadius, 64), 0x9c8a6a, 0.02);
  flat(new THREE.CircleGeometry(PLAZA_RADIUS, 32), 0xb0a89a, 0.04);

  const roadMat = mat(0x8a6a45);
  const roadLen = C.wallRadius + C.roadLength - PLAZA_RADIUS;
  for (const a of C.gateAngles) {
    const road = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH, 0.06, roadLen), roadMat);
    road.position.copy(polar(a, PLAZA_RADIUS + roadLen / 2, 0.03));
    road.rotation.y = a;
    road.receiveShadow = true;
    root.add(road);
  }

  // --- Wall ring (instanced segments, gaps at the gates) ---------------------
  const wallMat = mat(0xa7a29a);
  const SEGMENTS = 120;
  const segLen = ((2 * Math.PI * C.wallRadius) / SEGMENTS) * 1.05;
  const gapHalf = (C.gateWidth / 2 + TOWER_RADIUS) / C.wallRadius;
  const segAngles: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a = ((i + 0.5) / SEGMENTS) * Math.PI * 2;
    if (angleToNearestGate(a) > gapHalf) segAngles.push(a);
  }
  const wall = new THREE.InstancedMesh(
    new THREE.BoxGeometry(segLen, C.wallHeight, C.wallThickness),
    wallMat,
    segAngles.length,
  );
  const merlons = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.1, 0.6), wallMat, segAngles.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  segAngles.forEach((a, i) => {
    q.setFromAxisAngle(up, a);
    wall.setMatrixAt(i, m4.compose(polar(a, C.wallRadius, C.wallHeight / 2), q, one));
    const outer = C.wallRadius + C.wallThickness / 2 - 0.3;
    merlons.setMatrixAt(i, m4.compose(polar(a, outer, C.wallHeight + 0.55), q, one));
  });
  for (const m of [wall, merlons]) {
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }

  // --- Gates: two towers, a lintel and a numbered label ----------------------
  const towerMat = mat(0x938d84);
  const roofMat = mat(0x7a3b2e);
  const towerH = C.wallHeight + 3;
  for (const p of gateTowerPositions()) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(TOWER_RADIUS, TOWER_RADIUS + 0.2, towerH, 10), towerMat);
    tower.position.set(p.x, towerH / 2, p.z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(TOWER_RADIUS + 0.6, 3.2, 10), roofMat);
    roof.position.set(p.x, towerH + 1.6, p.z);
    for (const m of [tower, roof]) {
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
    }
  }
  C.gateAngles.forEach((a, i) => {
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(C.gateWidth + 1, 1.6, C.wallThickness), wallMat);
    lintel.position.copy(polar(a, C.wallRadius, C.wallHeight - 0.8));
    lintel.rotation.y = a;
    lintel.castShadow = true;
    root.add(lintel);

    const label = makeNumberSprite(String(i + 1), GATE_COLORS[i] ?? '#ffffff');
    label.position.copy(polar(a, C.wallRadius, C.wallHeight + 3));
    root.add(label);

    // Monster portal where the road meets the forest.
    const portal = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.5, 8, 24),
      mat(0x2a1838, { emissive: new THREE.Color(GATE_COLORS[i] ?? '#ffffff'), emissiveIntensity: 0.35 }),
    );
    portal.position.copy(polar(a, C.wallRadius + C.roadLength, 3.4));
    portal.rotation.y = a;
    portal.castShadow = true;
    root.add(portal);
  });

  // --- Crystal ----------------------------------------------------------------
  const stone = mat(0x8f8a82);
  const ped1 = new THREE.Mesh(new THREE.CylinderGeometry(PEDESTAL_RADIUS - 0.6, PEDESTAL_RADIUS, 1.2, 8), stone);
  ped1.position.y = 0.6;
  const ped2 = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.8, 8), stone);
  ped2.position.y = 1.6;
  for (const m of [ped1, ped2]) {
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }

  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x7fe9ff,
    emissive: 0x1aa6d9,
    emissiveIntensity: 1.1,
    roughness: 0.15,
    metalness: 0.1,
    flatShading: true,
    transparent: true,
    opacity: 0.92,
  });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(2, 0), crystalMat);
  crystal.scale.set(1, 2.2, 1);
  crystal.castShadow = true;
  const crystalBaseY = 7;
  crystal.position.y = crystalBaseY;
  root.add(crystal);

  const shards: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), crystalMat);
    s.scale.set(1, 1.8, 1);
    root.add(s);
    shards.push(s);
  }

  const glow = new THREE.PointLight(0x7fe8ff, 300, 45, 2);
  glow.position.y = crystalBaseY;
  root.add(glow);

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(4, 7, 48),
    new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.06;
  root.add(halo);

  // --- Pine forest --------------------------------------------------------------
  root.add(buildForest());

  return {
    root,
    update(_dt, time) {
      crystal.rotation.y = time * 0.4;
      crystal.position.y = crystalBaseY + Math.sin(time * 1.5) * 0.25;
      glow.intensity = 260 + Math.sin(time * 2.3) * 40;
      shards.forEach((s, i) => {
        const a = time * 0.8 + (i * Math.PI) / 2;
        s.position.set(Math.sin(a) * 3.6, crystalBaseY + Math.sin(time * 2 + i) * 0.6, Math.cos(a) * 3.6);
        s.rotation.y = -time * 1.5;
      });
    },
  };
}

function buildForest(): THREE.Group {
  const group = new THREE.Group();
  const rng = mulberry32(7);
  const positions: Array<{ x: number; z: number; h: number }> = [];
  const inner2 = C.forestInnerRadius ** 2;
  const outer2 = C.forestOuterRadius ** 2;
  let guard = 0;
  while (positions.length < 1400 && guard++ < 20000) {
    const r = Math.sqrt(inner2 + rng() * (outer2 - inner2));
    const a = rng() * Math.PI * 2;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    // Keep the four roads (and a margin around them) clear of trees.
    const onRoad = C.gateAngles.some((g) => {
      const along = x * Math.sin(g) + z * Math.cos(g);
      const across = Math.abs(x * Math.cos(g) - z * Math.sin(g));
      return along > 0 && across < ROAD_WIDTH / 2 + 4 + rng() * 3;
    });
    if (onRoad) continue;
    positions.push({ x, z, h: 6 + rng() * 8 });
  }

  const unitCylinder = new THREE.CylinderGeometry(0.7, 1, 1, 6).translate(0, 0.5, 0);
  const unitCone = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
  const n = positions.length;
  const trunks = new THREE.InstancedMesh(unitCylinder, new THREE.MeshStandardMaterial({ color: 0x5a3d26, flatShading: true }), n);
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.95 });
  const lower = new THREE.InstancedMesh(unitCone, foliageMat, n);
  const upper = new THREE.InstancedMesh(unitCone, foliageMat, n);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const color = new THREE.Color();
  positions.forEach(({ x, z, h }, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    const trunkH = h * 0.25;
    trunks.setMatrixAt(i, m4.compose(pos.set(x, 0, z), q, scl.set(0.3, trunkH, 0.3)));
    const base = trunkH * 0.6;
    lower.setMatrixAt(i, m4.compose(pos.set(x, base, z), q, scl.set(h * 0.28, h * 0.6, h * 0.28)));
    upper.setMatrixAt(i, m4.compose(pos.set(x, base + h * 0.35, z), q, scl.set(h * 0.19, h * 0.5, h * 0.19)));
    color.setHSL(0.3 + rng() * 0.06, 0.45 + rng() * 0.15, 0.2 + rng() * 0.08);
    lower.setColorAt(i, color);
    upper.setColorAt(i, color.offsetHSL(0, 0, 0.04));
  });
  for (const m of [trunks, lower, upper]) {
    m.castShadow = true;
    group.add(m);
  }
  return group;
}

function makeNumberSprite(text: string, bg: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 76px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 68);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  sprite.scale.setScalar(3);
  return sprite;
}

/** Small deterministic RNG so the forest looks the same every load. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
