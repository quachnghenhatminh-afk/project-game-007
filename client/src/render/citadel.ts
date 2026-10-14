import * as THREE from 'three';
import { CITADEL } from '@game/shared';
import { Torches } from './torches.ts';
import { glowTexture } from './textures.ts';
import { mergeStaticMeshes } from './mergeStatic.ts';

// Placeholder geometry for map 1 "Thành Pha Lê": a round fortress with 4 arched
// gatehouses, tall towers, a giant crystal in the middle and a pine forest outside.
// Replace pieces with .glb art later (see docs/ASSETS.md).

const C = CITADEL;
export const GATE_COLORS = ['#d9473b', '#3b7bd9', '#e0b62c', '#8e4bd1'] as const;
export const GATE_TOWER_RADIUS = 3;
export const MID_TOWER_RADIUS = 3.6;
export const PEDESTAL_RADIUS = 3.8;
/** Half thickness of the wall including its stone plinth (used for collision). */
export const WALL_HALF_THICKNESS = C.wallThickness / 2 + 0.6;
const PLAZA_RADIUS = 9;
const ROAD_WIDTH = 6;
const GATEHOUSE_DEPTH = C.wallThickness + 1.6;
const GATEHOUSE_HEIGHT = C.wallHeight + 3;
const GATE_TOWER_X = C.gateWidth / 2 + GATE_TOWER_RADIUS;
const MID_TOWER_ANGLES = C.gateAngles.map((a) => a + Math.PI / 4);
const BRAZIER_ANGLES = MID_TOWER_ANGLES;
const BRAZIER_RADIUS = 12;
const OBELISK_RADIUS = 7.5;
const ROAD_TORCH_RADII = [38, 48, 58, 68];

/** Point on the circle at angle a (a=0 → +Z). */
export function polar(a: number, r: number, y = 0): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
}

/** World position of a point given in a gate's local frame (x = along wall, z = outward). */
function gateLocal(a: number, x: number, z: number, y = 0): THREE.Vector3 {
  return new THREE.Vector3(
    Math.sin(a) * (C.wallRadius + z) + Math.cos(a) * x,
    y,
    Math.cos(a) * (C.wallRadius + z) - Math.sin(a) * x,
  );
}

/** Smallest absolute angle difference to any gate direction. */
export function angleToNearestGate(a: number): number {
  let best = Infinity;
  for (const g of C.gateAngles) best = Math.min(best, Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))));
  return best;
}

export interface Collider {
  x: number;
  z: number;
  r: number;
}

/** Round obstacles the player cannot walk through (towers, pedestal, braziers…). */
export function citadelColliders(): Collider[] {
  const out: Collider[] = [{ x: 0, z: 0, r: PEDESTAL_RADIUS }];
  const push = (p: THREE.Vector3, r: number) => out.push({ x: p.x, z: p.z, r });
  for (const a of C.gateAngles) {
    push(gateLocal(a, -GATE_TOWER_X, 0), GATE_TOWER_RADIUS);
    push(gateLocal(a, GATE_TOWER_X, 0), GATE_TOWER_RADIUS);
    for (const side of [-1, 1]) {
      for (const dz of [0.6, 1.8, 3.0]) push(gateLocal(a, side * 3.65, -GATEHOUSE_DEPTH / 2 - dz), 0.35); // open doors
      for (const r of ROAD_TORCH_RADII) push(polar(a, r).add(roadSide(a, side)), 0.25);
    }
  }
  for (const a of MID_TOWER_ANGLES) push(polar(a, C.wallRadius), MID_TOWER_RADIUS);
  for (const a of BRAZIER_ANGLES) push(polar(a, BRAZIER_RADIUS), 0.9);
  for (let i = 0; i < 8; i++) push(polar((i / 8) * Math.PI * 2 + Math.PI / 8, OBELISK_RADIUS), 0.7);
  return out;
}

function roadSide(a: number, side: number): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(side * (ROAD_WIDTH / 2 + 0.8));
}

export interface Citadel {
  root: THREE.Group;
  update(dt: number, time: number): void;
}

export function buildCitadel(scene: THREE.Scene): Citadel {
  const root = new THREE.Group();
  scene.add(root);
  const torches = new Torches(scene);

  const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.92, flatShading: true, ...extra });
  const stone = mat(0x9a948b);
  const stoneDark = mat(0x6f6a63);
  const roof = mat(0x5a2620);
  const wood = mat(0x4a3220);
  const iron = mat(0x2a2a2e, { metalness: 0.6, roughness: 0.5 });
  const add = <T extends THREE.Object3D>(o: T, shadows = true): T => {
    o.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.castShadow = shadows;
        c.receiveShadow = true;
      }
    });
    root.add(o);
    return o;
  };

  // --- Ground ------------------------------------------------------------------
  const flat = (geo: THREE.BufferGeometry, color: number, y: number) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.receiveShadow = true;
    root.add(m);
  };
  flat(new THREE.PlaneGeometry(600, 600), 0x3d5a2c, 0);
  flat(new THREE.CircleGeometry(C.wallRadius, 64), 0x8a7d66, 0.02);
  flat(new THREE.CircleGeometry(PLAZA_RADIUS + 3, 48), 0x6e6a64, 0.035);
  flat(new THREE.CircleGeometry(PLAZA_RADIUS, 48), 0xa39d92, 0.045);

  const roadMat = mat(0x6e5236);
  const roadLen = C.wallRadius + C.roadLength - PLAZA_RADIUS;
  for (const a of C.gateAngles) {
    const road = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH, 0.06, roadLen), roadMat);
    road.position.copy(polar(a, PLAZA_RADIUS + roadLen / 2, 0.03));
    road.rotation.y = a;
    road.receiveShadow = true;
    root.add(road);
  }

  // --- Curtain wall (instanced), with gaps at the gates and mid towers --------
  const SEGMENTS = 120;
  const segLen = ((2 * Math.PI * C.wallRadius) / SEGMENTS) * 1.04;
  const gateGap = GATE_TOWER_X / C.wallRadius;
  const segAngles: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a = ((i + 0.5) / SEGMENTS) * Math.PI * 2;
    if (angleToNearestGate(a) > gateGap) segAngles.push(a);
  }
  const H = C.wallHeight;
  const T = C.wallThickness;
  const n = segAngles.length;
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(segLen, H, T), stone, n);
  const plinth = new THREE.InstancedMesh(new THREE.BoxGeometry(segLen, 2.2, T + 1.2), stoneDark, n);
  const trim = new THREE.InstancedMesh(new THREE.BoxGeometry(segLen, 0.45, T + 0.4), stoneDark, n);
  const parapet = new THREE.InstancedMesh(new THREE.BoxGeometry(segLen, 0.9, 0.45), stone, n);
  const merlons = new THREE.InstancedMesh(new THREE.BoxGeometry(0.85, 1.3, 0.55), stone, n * 2);
  const buttressAngles = segAngles.filter((_, i) => i % 3 === 1);
  const buttress = new THREE.InstancedMesh(new THREE.BoxGeometry(1.3, H * 0.7, 1.4), stoneDark, buttressAngles.length);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const tint = new THREE.Color();
  const outerR = C.wallRadius + T / 2 - 0.28;
  segAngles.forEach((a, i) => {
    q.setFromAxisAngle(up, a);
    body.setMatrixAt(i, m4.compose(polar(a, C.wallRadius, H / 2), q, one));
    body.setColorAt(i, tint.setHSL(0.09, 0.06, 0.52 + ((i * 37) % 11) / 110));
    plinth.setMatrixAt(i, m4.compose(polar(a, C.wallRadius, 1.1), q, one));
    trim.setMatrixAt(i, m4.compose(polar(a, C.wallRadius, H - 1.2), q, one));
    parapet.setMatrixAt(i, m4.compose(polar(a, C.wallRadius - T / 2 + 0.22, H + 0.45), q, one));
    const da = segLen / 4 / C.wallRadius;
    merlons.setMatrixAt(i * 2, m4.compose(polar(a - da, outerR, H + 0.65), q, one));
    merlons.setMatrixAt(i * 2 + 1, m4.compose(polar(a + da, outerR, H + 0.65), q, one));
  });
  buttressAngles.forEach((a, i) => {
    q.setFromAxisAngle(up, a);
    buttress.setMatrixAt(i, m4.compose(polar(a, C.wallRadius + T / 2 + 0.6, H * 0.35), q, one));
  });
  for (const m of [body, plinth, trim, parapet, merlons, buttress]) add(m);

  // Torches on the inner face of the wall (glow only).
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2 + Math.PI / 24;
    if (angleToNearestGate(a) < gateGap + 0.08) continue;
    if (MID_TOWER_ANGLES.some((m) => Math.abs(Math.atan2(Math.sin(a - m), Math.cos(a - m))) < 0.16)) continue;
    torches.add(polar(a, C.wallRadius - T / 2 - 0.45, 4.2), 'wall', { facing: a + Math.PI });
  }

  // --- Gatehouses ---------------------------------------------------------------
  const gatehouseGeo = gatehouseGeometry();
  C.gateAngles.forEach((a, i) => {
    const color = GATE_COLORS[i] ?? '#ffffff';
    const g = new THREE.Group();
    g.position.copy(polar(a, C.wallRadius));
    g.rotation.y = a;

    g.add(new THREE.Mesh(gatehouseGeo, stone));
    // Battlements on top of the gatehouse, front and back.
    for (let k = -2; k <= 2; k++) {
      for (const side of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.6), stone);
        m.position.set(k * 2.2, GATEHOUSE_HEIGHT + 0.65, side * (GATEHOUSE_DEPTH / 2 - 0.3));
        g.add(m);
      }
    }
    // Raised portcullis just inside the arch.
    for (let k = -5; k <= 5; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), iron);
      bar.position.set(k * 0.6, C.gateHeight - 1.1, GATEHOUSE_DEPTH / 2 - 0.6);
      g.add(bar);
    }
    const crossBar = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.14, 0.14), iron);
    crossBar.position.set(0, C.gateHeight - 1.6, GATEHOUSE_DEPTH / 2 - 0.6);
    g.add(crossBar);
    // Heavy doors, swung open against the inner passage.
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.25, 6.2, 3.4), wood);
      door.position.set(side * 3.65, 3.1, -GATEHOUSE_DEPTH / 2 - 1.7);
      g.add(door);
      for (const y of [1.2, 5]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 3.42), iron);
        band.position.set(side * 3.65, y, -GATEHOUSE_DEPTH / 2 - 1.7);
        g.add(band);
      }
    }
    // Banner with the gate's color over the arch.
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.6), mat(new THREE.Color(color).getHex(), { side: THREE.DoubleSide }));
    banner.position.set(0, C.gateHeight + 2.6, GATEHOUSE_DEPTH / 2 + 0.03);
    g.add(banner);
    // Gate towers.
    for (const side of [-1, 1]) {
      const tower = makeTower(GATE_TOWER_RADIUS, H + 5, { stone, stoneDark, roof, iron }, 'roof');
      tower.position.set(side * GATE_TOWER_X, 0, 0);
      g.add(tower);
    }
    add(g);

    const label = makeNumberSprite(String(i + 1), color);
    label.position.copy(polar(a, C.wallRadius, GATEHOUSE_HEIGHT + 3.2));
    root.add(label);

    // Torches beside the arch on both faces; one real light per face.
    for (const z of [GATEHOUSE_DEPTH / 2 + 0.45, -GATEHOUSE_DEPTH / 2 - 0.45]) {
      const facing = z > 0 ? a : a + Math.PI;
      torches.add(gateLocal(a, -4.7, z, 5), 'wall', { facing, light: true });
      torches.add(gateLocal(a, 4.7, z, 5), 'wall', { facing });
    }

    // Road torch posts + monster portal at the end of the road (inside the fog).
    for (const r of ROAD_TORCH_RADII) {
      for (const side of [-1, 1]) torches.add(polar(a, r, 2.6).add(roadSide(a, side)), 'post');
    }
    const portalPos = polar(a, C.wallRadius + C.roadLength + 1, 3.6);
    const portal = new THREE.Mesh(
      new THREE.TorusGeometry(3.4, 0.55, 8, 28),
      mat(0x22122e, { emissive: new THREE.Color(color), emissiveIntensity: 0.6 }),
    );
    portal.position.copy(portalPos);
    portal.rotation.y = a;
    add(portal);
    const portalGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }),
    );
    portalGlow.position.copy(portalPos);
    portalGlow.scale.setScalar(10);
    root.add(portalGlow);
  });

  // --- Mid-wall towers with battlements and banners ---------------------------
  for (const a of MID_TOWER_ANGLES) {
    const tower = makeTower(MID_TOWER_RADIUS, H + 7, { stone, stoneDark, roof, iron }, 'battlements');
    tower.position.copy(polar(a, C.wallRadius));
    tower.rotation.y = a;
    add(tower);
    torches.add(polar(a, C.wallRadius - MID_TOWER_RADIUS - 0.4, 4.5), 'wall', { facing: a + Math.PI });
  }

  // --- Crystal plaza ---------------------------------------------------------------
  const ped1 = new THREE.Mesh(new THREE.CylinderGeometry(PEDESTAL_RADIUS - 0.6, PEDESTAL_RADIUS, 1.2, 8), stoneDark);
  ped1.position.y = 0.6;
  const ped2 = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.8, 8), stone);
  ped2.position.y = 1.6;
  add(ped1);
  add(ped2);

  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x7fe9ff,
    emissive: 0x1aa6d9,
    emissiveIntensity: 1.6,
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
  const crystalGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: 0x5fd8ff, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 }),
  );
  crystalGlow.position.y = crystalBaseY;
  crystalGlow.scale.setScalar(16);
  root.add(crystalGlow);

  const shards: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), crystalMat);
    s.scale.set(1, 1.8, 1);
    root.add(s);
    shards.push(s);
  }
  const glow = new THREE.PointLight(0x7fe8ff, 400, 50, 2);
  glow.position.y = crystalBaseY;
  root.add(glow);

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(4, 6.5, 48),
    new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.07;
  root.add(halo);

  // Obelisks ringing the plaza, tipped with small crystals.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 3.2, 4), stone);
    ob.position.copy(polar(a, OBELISK_RADIUS, 1.6));
    ob.rotation.y = Math.PI / 4;
    add(ob);
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), crystalMat);
    tip.position.copy(polar(a, OBELISK_RADIUS, 3.6));
    root.add(tip);
  }
  for (const a of BRAZIER_ANGLES) torches.add(polar(a, BRAZIER_RADIUS, 1.5), 'brazier', { light: true });

  root.add(buildForest());

  // Batch everything that never moves (keeps draw calls low on integrated GPUs).
  const animated = new Set<THREE.Object3D>([crystal, ...shards]);
  mergeStaticMeshes(root, (m) => animated.has(m));
  torches.finalize();

  return {
    root,
    update(_dt, time) {
      crystal.rotation.y = time * 0.4;
      crystal.position.y = crystalBaseY + Math.sin(time * 1.5) * 0.25;
      crystalGlow.position.y = crystal.position.y;
      glow.intensity = 380 + Math.sin(time * 2.3) * 60;
      shards.forEach((s, i) => {
        const a = time * 0.8 + (i * Math.PI) / 2;
        s.position.set(Math.sin(a) * 3.6, crystalBaseY + Math.sin(time * 2 + i) * 0.6, Math.cos(a) * 3.6);
        s.rotation.y = -time * 1.5;
      });
      torches.update(time);
    },
  };
}

/** Gatehouse front: a thick block with a round-topped arch cut through it. */
function gatehouseGeometry(): THREE.BufferGeometry {
  const w = GATE_TOWER_X * 2;
  const r = C.gateWidth / 2;
  const straight = C.gateHeight - r;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2, GATEHOUSE_HEIGHT);
  shape.lineTo(-w / 2, GATEHOUSE_HEIGHT);
  shape.lineTo(-w / 2, 0);
  const hole = new THREE.Path();
  hole.moveTo(-r, 0);
  hole.lineTo(-r, straight);
  hole.absarc(0, straight, r, Math.PI, 0, true);
  hole.lineTo(r, 0);
  hole.lineTo(-r, 0);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: GATEHOUSE_DEPTH, bevelEnabled: false, curveSegments: 16 });
  geo.translate(0, 0, -GATEHOUSE_DEPTH / 2);
  return geo;
}

interface TowerMats {
  stone: THREE.Material;
  stoneDark: THREE.Material;
  roof: THREE.Material;
  iron: THREE.Material;
}

/** Round tower; local +Z faces outward. Top is a cone roof or battlements + banner. */
function makeTower(radius: number, height: number, m: TowerMats, top: 'roof' | 'battlements'): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.2, height, 14), m.stone);
  body.position.y = height / 2;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.5, radius + 0.7, 2.4, 14), m.stoneDark);
  base.position.y = 1.2;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.15, radius + 0.15, 0.4, 14), m.stoneDark);
  band.position.y = height * 0.55;
  const corbel = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.55, radius, 1, 14), m.stoneDark);
  corbel.position.y = height - 0.5;
  g.add(body, base, band, corbel);
  // Arrow slits on the outer half.
  for (const y of [height * 0.35, height * 0.72]) {
    for (const off of [-0.5, 0, 0.5]) {
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.3, 0.3), m.iron);
      slit.position.set(Math.sin(off) * (radius + 0.08), y, Math.cos(off) * (radius + 0.08));
      slit.rotation.y = off;
      g.add(slit);
    }
  }
  if (top === 'roof') {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius + 1, 6.5, 14), m.roof);
    cone.position.y = height + 3.25;
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), m.iron);
    finial.position.y = height + 6.6;
    g.add(cone, finial);
  } else {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const mer = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.5), m.stone);
      mer.position.set(Math.sin(a) * (radius + 0.3), height + 0.65, Math.cos(a) * (radius + 0.3));
      mer.rotation.y = a;
      g.add(mer);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6, 6), m.iron);
    pole.position.y = height + 3;
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x3fb8e6, side: THREE.DoubleSide, emissive: 0x0b3a4f }),
    );
    flag.position.set(1.3, height + 5.1, 0);
    g.add(pole, flag);
  }
  return g;
}

function buildForest(): THREE.Group {
  const group = new THREE.Group();
  const rng = mulberry32(7);
  const positions: Array<{ x: number; z: number; h: number }> = [];
  const inner2 = C.forestInnerRadius ** 2;
  const outer2 = C.forestOuterRadius ** 2;
  let guard = 0;
  while (positions.length < 1500 && guard++ < 20000) {
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
    positions.push({ x, z, h: 7 + rng() * 9 });
  }

  const unitCylinder = new THREE.CylinderGeometry(0.7, 1, 1, 6).translate(0, 0.5, 0);
  const unitCone = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
  const n = positions.length;
  const trunks = new THREE.InstancedMesh(unitCylinder, new THREE.MeshStandardMaterial({ color: 0x4a3322, flatShading: true }), n);
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
    color.setHSL(0.32 + rng() * 0.06, 0.4 + rng() * 0.15, 0.18 + rng() * 0.07);
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
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false }));
  sprite.scale.setScalar(3.4);
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
