import * as THREE from 'three';
import { CITADEL } from '@game/shared';
import type { Collider } from './gameMap.ts';
import type { Destructibles } from '../game/destructibles.ts';
import { mergeStaticMeshes } from './mergeStatic.ts';
import { boxGeo, cylGeo } from './geometry.ts';
import { mulberry32 } from './forest.ts';

// Courtyard set dressing, one theme per quarter between the gates:
//   gate1–2: market · gate2–3: barracks · gate3–4: well & garden · gate4–1: storage
// Everything is static (merged later by mergeStaticMeshes).

const C = CITADEL;
const QUARTER = C.gateAngles.map((a) => a + Math.PI / 4);

/** Center angle of the wall stairs in each quarter (they span about ±12° around it). */
export function stairAngles(): number[] {
  return QUARTER.map((a) => a - (20 * Math.PI) / 180);
}
export const STAIR_HALF_ARC = (12 * Math.PI) / 180;

export interface CourtyardMats {
  stone: THREE.Material;
  stoneDark: THREE.Material;
  wood: THREE.Material;
  iron: THREE.Material;
  roof: THREE.Material;
}

export function buildCourtyard(m: CourtyardMats, destructibles?: Destructibles): { group: THREE.Group; colliders: Collider[] } {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const rnd = mulberry32(99);
  const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
  const cloth = [mat(0xa8322c), mat(0x2f5fa8), mat(0xd8c9a0), mat(0x3f7a3a), mat(0x7a3f8f)];
  const darkWood = mat(0x3a2716);
  const hay = mat(0xc9a64a);
  const sack = mat(0xb39a72);
  const soil = mat(0x3b2a1c);
  const flowers = [mat(0xd94a6a), mat(0xf0d050), mat(0xe8e8f0), mat(0x8a5ad8)];
  const leaf = mat(0x3e6b2e);

  /** Places `obj` at polar (angle a, radius r) facing the crystal, with an optional extra turn. */
  const place = (obj: THREE.Object3D, a: number, r: number, turn = 0, collide = 0) => {
    obj.position.set(Math.sin(a) * r, obj.position.y, Math.cos(a) * r);
    obj.rotation.y = a + Math.PI + turn;
    group.add(obj);
    let collider: Collider | null = null;
    if (collide > 0) {
      collider = { x: obj.position.x, z: obj.position.z, r: collide };
      colliders.push(collider);
    }
    if (obj.userData.breakable) {
      obj.userData.destructible = true; // keep it out of the big static merge
      destructibles?.addProp(obj, Math.max(collide, 0.5), collider, obj.userData.debrisColor as number);
    }
    return obj;
  };
  /** Wraps a prop so it can be smashed: merged into one object, flagged for Destructibles. */
  const breakable = (obj: THREE.Object3D, debrisColor: number) => {
    const g = new THREE.Group();
    g.add(obj);
    mergeStaticMeshes(g);
    g.userData.breakable = true;
    g.userData.debrisColor = debrisColor;
    return g;
  };
  const mesh = (geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, material);
    o.position.set(x, y, z);
    return o;
  };

  // --- Reusable props ----------------------------------------------------------
  const barrel = () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 10), m.wood, 0, 0.55));
    g.add(mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.5, 10), m.wood, 0, 0.55));
    for (const y of [0.15, 0.95]) g.add(mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.06, 10), m.iron, 0, y));
    return g;
  };
  const crate = (s = 0.9) => mesh(boxGeo(s, s, s, 1), m.wood, 0, s / 2);
  const crateStack = () => {
    const g = new THREE.Group();
    g.add(crate(), crate().translateX(0.95), crate(0.8).translateX(0.45).translateY(0.9));
    g.children[2]!.rotation.y = 0.3;
    return g;
  };
  const sacks = () => {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const s = mesh(new THREE.SphereGeometry(0.35, 7, 5), sack, (i % 2) * 0.6, 0.3 + Math.floor(i / 2) * 0.45, 0);
      s.scale.set(1, 0.75, 0.8);
      g.add(s);
    }
    return g;
  };

  const stall = (color: THREE.Material) => {
    const g = new THREE.Group();
    g.add(mesh(boxGeo(3.2, 1, 1.2, 1), m.wood, 0, 0.5, 0.4)); // counter
    for (const x of [-1.5, 1.5]) for (const z of [-0.9, 0.9]) g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), darkWood, x, 1.3, z));
    const awning = mesh(new THREE.BoxGeometry(3.6, 0.08, 2.4), color, 0, 2.75, 0);
    awning.rotation.x = -0.22;
    g.add(awning);
    for (let i = 0; i < 4; i++) {
      // Striped valance.
      g.add(mesh(new THREE.BoxGeometry(0.45, 0.35, 0.04), i % 2 ? color : cloth[2]!, -1.35 + i * 0.9, 2.42, 1.22));
    }
    g.add(mesh(new THREE.SphereGeometry(0.16, 6, 5), flowers[0]!, -0.8, 1.1, 0.4)); // goods on the counter
    g.add(mesh(new THREE.SphereGeometry(0.16, 6, 5), flowers[1]!, -0.4, 1.1, 0.5));
    g.add(mesh(boxGeo(0.4, 0.3, 0.3, 1), m.wood, 0.6, 1.15, 0.4));
    return g;
  };

  const tent = (color: THREE.Material) => {
    const g = new THREE.Group();
    const body = mesh(new THREE.ConeGeometry(2.6, 3.2, 4, 1, true), color, 0, 1.6, 0);
    body.rotation.y = Math.PI / 4;
    (body.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    g.add(body);
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 6), darkWood, 0, 1.8, 0));
    const flap = mesh(new THREE.PlaneGeometry(1.2, 1.6), mat(0x1a1410), 0, 0.8, 1.52);
    g.add(flap);
    return g;
  };

  const weaponRack = () => {
    const g = new THREE.Group();
    for (const x of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), darkWood, x, 0.8, 0));
    g.add(mesh(new THREE.BoxGeometry(2.2, 0.1, 0.14), darkWood, 0, 1.4, 0));
    g.add(mesh(new THREE.BoxGeometry(2.2, 0.1, 0.14), darkWood, 0, 0.3, 0));
    for (let i = 0; i < 6; i++) {
      const spear = mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5), m.wood, -0.85 + i * 0.34, 1.1, 0.1);
      spear.rotation.x = -0.12;
      g.add(spear, mesh(new THREE.ConeGeometry(0.06, 0.25, 5), m.iron, -0.85 + i * 0.34, 2.28, 0.24));
    }
    return g;
  };

  const dummy = () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.9, 6), darkWood, 0, 0.95, 0));
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.1, 0.1), darkWood, 0, 1.45, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.8, 8), hay, 0, 1.3, 0));
    g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), sack, 0, 1.95, 0));
    return g;
  };

  const archeryTarget = () => {
    const g = new THREE.Group();
    for (const x of [-0.5, 0.5]) {
      const leg = mesh(new THREE.BoxGeometry(0.1, 1.8, 0.1), darkWood, x, 0.85, -0.3);
      leg.rotation.x = 0.25;
      g.add(leg);
    }
    const rings = [0xe8e0d0, 0x2a2a2a, 0x3060c0, 0xc03030, 0xf0d040];
    rings.forEach((c, i) => {
      const disc = mesh(new THREE.CylinderGeometry(0.75 - i * 0.14, 0.75 - i * 0.14, 0.12 + i * 0.01, 20), mat(c), 0, 1.3, 0);
      disc.rotation.x = Math.PI / 2 - 0.25;
      g.add(disc);
    });
    return g;
  };

  const well = () => {
    const g = new THREE.Group();
    g.add(mesh(cylGeo(1.2, 1.3, 1, 14, 2), m.stone, 0, 0.5, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.05, 14), mat(0x0c1520), 0, 0.85, 0)); // water
    for (const x of [-1.05, 1.05]) g.add(mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), darkWood, x, 1.7, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.3, 6).rotateZ(Math.PI / 2), m.wood, 0, 2.2, 0));
    for (const side of [-1, 1]) {
      const r = mesh(new THREE.BoxGeometry(2.8, 0.08, 1.4), m.roof, 0, 2.9, side * 0.55);
      r.rotation.x = side * 0.6;
      g.add(r);
    }
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.25, 8), m.wood, 0.3, 1.6, 0)); // bucket
    return g;
  };

  const flowerBed = (len: number) => {
    const g = new THREE.Group();
    g.add(mesh(boxGeo(len, 0.45, 1.1, 2), m.stoneDark, 0, 0.22, 0));
    g.add(mesh(new THREE.BoxGeometry(len - 0.2, 0.08, 0.9), soil, 0, 0.45, 0));
    for (let i = 0; i < len * 3; i++) {
      const x = -len / 2 + 0.3 + rnd() * (len - 0.6);
      const z = (rnd() - 0.5) * 0.7;
      const b = mesh(new THREE.IcosahedronGeometry(0.22 + rnd() * 0.1, 0), leaf, x, 0.6, z);
      g.add(b);
      if (rnd() < 0.7) g.add(mesh(new THREE.IcosahedronGeometry(0.08, 0), flowers[Math.floor(rnd() * 4)]!, x, 0.82, z));
    }
    return g;
  };

  const bench = () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1.8, 0.1, 0.45), m.wood, 0, 0.48, 0));
    for (const x of [-0.7, 0.7]) g.add(mesh(boxGeo(0.3, 0.45, 0.4, 1), m.stone, x, 0.22, 0));
    return g;
  };

  const smallTree = () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.22, 2.4, 6), darkWood, 0, 1.2, 0));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.IcosahedronGeometry(1.1, 0), leaf, (rnd() - 0.5) * 1.2, 2.7 + rnd() * 0.6, (rnd() - 0.5) * 1.2));
    g.add(mesh(cylGeo(1.1, 1.2, 0.4, 12, 2), m.stoneDark, 0, 0.2, 0));
    return g;
  };

  const cart = () => {
    const g = new THREE.Group();
    g.add(mesh(boxGeo(2.4, 0.6, 1.4, 1), m.wood, 0, 0.95, 0));
    g.add(mesh(new THREE.BoxGeometry(2.2, 0.5, 1.2), hay, 0, 1.45, 0));
    for (const x of [-0.6]) {
      for (const z of [-0.8, 0.8]) {
        const w = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 12).rotateX(Math.PI / 2), darkWood, x, 0.6, z);
        g.add(w);
      }
    }
    for (const z of [-0.4, 0.4]) {
      const shaft = mesh(new THREE.BoxGeometry(2, 0.08, 0.08), darkWood, 1.9, 0.7, z);
      shaft.rotation.z = 0.25;
      g.add(shaft);
    }
    return g;
  };

  const hayBale = () => mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 10).rotateZ(Math.PI / 2), hay, 0, 0.6, 0);

  const firewood = () => {
    const g = new THREE.Group();
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 5 - row; i++) {
        g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.4, 6).rotateX(Math.PI / 2), m.wood, -0.6 + i * 0.3 + row * 0.15, 0.14 + row * 0.26, 0));
      }
    }
    return g;
  };

  const shed = () => {
    const g = new THREE.Group();
    g.add(mesh(boxGeo(3.6, 2.6, 2.6, 1), m.wood, 0, 1.3, 0));
    for (const side of [-1, 1]) {
      const r = mesh(new THREE.BoxGeometry(4, 0.1, 1.7), m.roof, 0, 3, side * 0.7);
      r.rotation.x = side * 0.55;
      g.add(r);
    }
    g.add(mesh(new THREE.BoxGeometry(1, 1.9, 0.05), darkWood, 0, 0.95, 1.31));
    return g;
  };

  const stairs = () => {
    // Stone steps along the inner face of the wall, rising to the walkway.
    const g = new THREE.Group();
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      const h = ((i + 1) / steps) * C.wallHeight;
      g.add(mesh(boxGeo(0.9, h, 2, 2), m.stone, -6 + i * 0.85, h / 2, 0));
    }
    return g;
  };

  const banner = (material: THREE.Material) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6).rotateZ(Math.PI / 2), darkWood, 0, 8.3, 0));
    g.add(mesh(new THREE.PlaneGeometry(1.5, 4.2), material, 0, 6.2, 0.02));
    g.add(mesh(new THREE.CircleGeometry(0.45, 12), cloth[2]!, 0, 6.8, 0.04));
    return g;
  };

  // --- Layout ------------------------------------------------------------------
  const [market, barracks, garden, storage] = QUARTER as [number, number, number, number];
  const d = (deg: number) => (deg * Math.PI) / 180;

  // Market (gate 1–2)
  place(stall(cloth[0]!), market - d(16), 20, 0, 1.8);
  place(stall(cloth[1]!), market + d(2), 21, 0, 1.8);
  place(stall(cloth[3]!), market + d(20), 19.5, 0, 1.8);
  place(breakable(crateStack(), 0x8a6a45), market - d(5), 23.5, 0.4, 1.1);
  place(breakable(sacks(), 0xb39a72), market + d(11), 23.5, -0.3, 0.8);
  place(breakable(barrel(), 0x6a4a2e), market + d(28), 22, 0, 0.5);
  place(breakable(barrel(), 0x6a4a2e), market + d(30), 22.9, 0, 0.5);

  // Barracks (gate 2–3)
  place(tent(cloth[1]!), barracks - d(18), 20.5, 0, 2.4);
  place(tent(cloth[0]!), barracks + d(18), 20.5, 0, 2.4);
  place(weaponRack(), barracks, 22.5, 0, 1.2);
  for (const da of [-8, 0, 8]) place(breakable(dummy(), 0xc9a64a), barracks + d(da), 15.5, 0, 0.35);
  place(breakable(archeryTarget(), 0xc03030), barracks + d(30), 17, 0.5, 0.8);
  place(breakable(crateStack(), 0x8a6a45), barracks - d(30), 22, 0.2, 1.1);

  // Well & garden (gate 3–4)
  place(well(), garden, 18, 0, 1.4);
  place(flowerBed(4), garden - d(16), 15.5, Math.PI / 2 - 0.2, 0);
  place(flowerBed(4), garden + d(16), 15.5, -Math.PI / 2 + 0.2, 0);
  place(smallTree(), garden - d(24), 22, 0, 1.2);
  place(smallTree(), garden + d(24), 22, 0, 1.2);
  place(bench(), garden - d(8), 14, 0, 0);
  place(bench(), garden + d(8), 14, 0, 0);

  // Storage (gate 4–1)
  place(cart(), storage - d(12), 19.5, 1.2, 1.6);
  place(shed(), storage + d(10), 23, 0, 2.2);
  for (const [da, r] of [[-26, 22], [-24, 23], [-27, 23.2]] as const) place(breakable(barrel(), 0x6a4a2e), storage + d(da), r, 0, 0.5);
  place(breakable(hayBale(), 0xc9a64a), storage + d(26), 18.5, 0.3, 0.8);
  place(breakable(hayBale(), 0xc9a64a), storage + d(30), 19, -0.2, 0.8);
  place(firewood(), storage - d(2), 15.5, 0, 0.9);

  // Stairs up the wall in each quarter (local +X runs along the wall).
  for (const sa of stairAngles()) {
    const st = stairs();
    const r = C.wallRadius - 2.6;
    st.position.set(Math.sin(sa) * r, 0, Math.cos(sa) * r);
    st.rotation.y = sa;
    group.add(st);
    for (let x = -6; x <= 5; x += 1.5) {
      colliders.push({ x: st.position.x + Math.cos(sa) * x, z: st.position.z - Math.sin(sa) * x, r: 1 });
    }
  }
  // Banners on the inner wall, one beside each gate (the other side has stairs).
  C.gateAngles.forEach((g, i) => {
    const a = g - d(26);
    const b = banner(cloth[i % 2 ? 1 : 0]!);
    const r = C.wallRadius - C.wallThickness / 2 - 0.08;
    b.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
    b.rotation.y = a + Math.PI;
    group.add(b);
  });

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { group, colliders };
}