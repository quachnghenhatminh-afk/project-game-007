import * as THREE from 'three';
import { DESTRUCTIBLES } from '@game/shared';
import type { Collider } from '../render/citadel.ts';

// Trees that fall and small props that break, then come back after a while
// (only when no player is nearby, so nothing pops into existence in front of you).
//
// Trees live inside InstancedMeshes: "destroying" one hides its instances and spawns a
// separate falling copy; respawning restores the instance matrices with a grow-in.

export interface TreePart {
  mesh: THREE.InstancedMesh;
  index: number;
}

interface Entry {
  kind: 'tree' | 'prop';
  pos: THREE.Vector3;
  /** Hit radius (m). */
  radius: number;
  height: number;
  hp: number;
  maxHp: number;
  collider: Collider | null;
  state: 'alive' | 'dead' | 'regrow';
  deadTime: number;
  regrowT: number;
  // tree
  parts?: Array<TreePart & { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3; color: THREE.Color }>;
  // prop
  object?: THREE.Object3D;
  debrisColor?: number;
}

interface Anim {
  obj: THREE.Object3D;
  age: number;
  tick(a: Anim, dt: number): boolean; // false = finished
}

export type DestructionEvent = { type: 'tree-fall' | 'prop-break' | 'hit'; pos: THREE.Vector3 };

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

export class Destructibles {
  onEvent: (e: DestructionEvent) => void = () => {};
  private entries: Entry[] = [];
  private anims: Anim[] = [];
  private m4 = new THREE.Matrix4();

  constructor(private scene: THREE.Scene) {}

  get count(): number {
    return this.entries.length;
  }

  /** A tree made of instances in one or more InstancedMeshes. */
  addTree(base: THREE.Vector3, height: number, parts: TreePart[], collider: Collider | null, hp = 2): void {
    const full = parts.map((p) => {
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      p.mesh.getMatrixAt(p.index, this.m4);
      this.m4.decompose(pos, quat, scale);
      const color = new THREE.Color(1, 1, 1);
      if (p.mesh.instanceColor) p.mesh.getColorAt(p.index, color);
      else color.copy((p.mesh.material as THREE.MeshStandardMaterial).color);
      return { ...p, pos, quat, scale, color };
    });
    this.entries.push({
      kind: 'tree', pos: base.clone(), radius: Math.max(0.6, height * 0.06), height, hp, maxHp: hp,
      collider, state: 'alive', deadTime: 0, regrowT: 0, parts: full,
    });
  }

  /** A small standalone object (crate, barrel…). It must not be merged into static meshes. */
  addProp(object: THREE.Object3D, radius: number, collider: Collider | null, debrisColor: number, hp = 1): void {
    object.updateMatrixWorld(true);
    const pos = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
    this.entries.push({
      kind: 'prop', pos, radius, height: 1, hp, maxHp: hp, collider,
      state: 'alive', deadTime: 0, regrowT: 0, object, debrisColor,
    });
  }

  /** Damages everything within `radius` of `center` (spell explosions). */
  damageSphere(center: THREE.Vector3, radius: number, amount: number): number {
    let n = 0;
    for (const e of this.entries) {
      if (e.state !== 'alive') continue;
      const d = Math.hypot(e.pos.x - center.x, e.pos.z - center.z);
      if (d > radius + e.radius) continue;
      n++;
      this.damage(e, amount, center);
    }
    return n;
  }

  /**
   * Melee: hits the nearest object in a cone in front of `origin`.
   * @returns the hit point, or null if nothing was in reach
   */
  melee(origin: THREE.Vector3, forward: THREE.Vector3, range: number, arc: number, amount = 1): THREE.Vector3 | null {
    const fwd = new THREE.Vector3(forward.x, 0, forward.z).normalize();
    let best: Entry | null = null;
    let bestD = Infinity;
    for (const e of this.entries) {
      if (e.state !== 'alive') continue;
      const dx = e.pos.x - origin.x;
      const dz = e.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d - e.radius > range || d > bestD) continue;
      const angle = d < 0.01 ? 0 : Math.acos(Math.max(-1, Math.min(1, (dx * fwd.x + dz * fwd.z) / d)));
      if (angle > arc && d > e.radius + 0.3) continue;
      best = e;
      bestD = d;
    }
    if (!best) return null;
    const hitPoint = best.pos.clone().setY(Math.min(origin.y - 0.4, best.kind === 'tree' ? 1.2 : 0.6));
    this.onEvent({ type: 'hit', pos: hitPoint });
    this.damage(best, amount, origin);
    return hitPoint;
  }

  update(dt: number, players: THREE.Vector3[]): void {
    this.anims = this.anims.filter((a) => {
      a.age += dt;
      const keep = a.tick(a, dt);
      if (!keep) disposeTree(this.scene, a.obj);
      return keep;
    });
    for (const e of this.entries) {
      if (e.state === 'dead') {
        e.deadTime += dt;
        if (e.deadTime < DESTRUCTIBLES.respawnSec) continue;
        const clear = players.every((p) => Math.hypot(p.x - e.pos.x, p.z - e.pos.z) > DESTRUCTIBLES.respawnClearRadius);
        if (clear) {
          e.state = 'regrow';
          e.regrowT = 0;
          if (e.object) e.object.visible = true;
        }
      } else if (e.state === 'regrow') {
        e.regrowT = Math.min(1, e.regrowT + dt / 1.5);
        const k = 1 - (1 - e.regrowT) ** 3; // ease-out
        this.setScale(e, Math.max(0.001, k));
        if (e.regrowT >= 1) {
          e.state = 'alive';
          e.hp = e.maxHp;
          if (e.collider) e.collider.enabled = true;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------------

  private damage(e: Entry, amount: number, from: THREE.Vector3): void {
    e.hp -= amount;
    if (e.hp > 0) {
      if (e.kind === 'tree') this.shake(e);
      return;
    }
    e.state = 'dead';
    e.deadTime = 0;
    if (e.collider) e.collider.enabled = false;
    if (e.kind === 'tree') {
      this.fellTree(e, from);
      this.onEvent({ type: 'tree-fall', pos: e.pos });
    } else {
      this.breakProp(e);
      this.onEvent({ type: 'prop-break', pos: e.pos });
    }
  }

  private setScale(e: Entry, k: number): void {
    if (e.parts) {
      const touched = new Set<THREE.InstancedMesh>();
      for (const p of e.parts) {
        const s = p.scale.clone().multiplyScalar(k);
        // Grow from the ground: scale the offset from the tree base too.
        const pos = e.pos.clone().add(p.pos.clone().sub(e.pos).multiplyScalar(k));
        p.mesh.setMatrixAt(p.index, this.m4.compose(pos, p.quat, s));
        touched.add(p.mesh);
      }
      for (const m of touched) m.instanceMatrix.needsUpdate = true;
    } else if (e.object) {
      e.object.scale.setScalar(k);
    }
  }

  /** Little wobble when a tree is hit but not felled. */
  private shake(e: Entry): void {
    const start = performance.now();
    const anim: Anim = {
      obj: new THREE.Object3D(),
      age: 0,
      tick: (a) => {
        const k = Math.sin(a.age * 40) * Math.max(0, 1 - a.age / 0.3) * 0.04;
        if (e.state !== 'alive') return false;
        for (const p of e.parts ?? []) {
          const q = p.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), k));
          p.mesh.setMatrixAt(p.index, this.m4.compose(p.pos, q, p.scale));
          p.mesh.instanceMatrix.needsUpdate = true;
        }
        if (a.age > 0.3) {
          this.setScale(e, 1);
          return false;
        }
        return performance.now() - start < 1000;
      },
    };
    this.anims.push(anim);
  }

  private fellTree(e: Entry, from: THREE.Vector3): void {
    // Hide the instances, build a temporary copy that topples away from the hit.
    const group = new THREE.Group();
    group.position.copy(e.pos);
    for (const p of e.parts ?? []) {
      p.mesh.setMatrixAt(p.index, ZERO);
      p.mesh.instanceMatrix.needsUpdate = true;
      const mesh = new THREE.Mesh(p.mesh.geometry, new THREE.MeshStandardMaterial({ color: p.color, flatShading: true, roughness: 0.95 }));
      mesh.position.copy(p.pos).sub(e.pos);
      mesh.quaternion.copy(p.quat);
      mesh.scale.copy(p.scale);
      mesh.castShadow = true;
      mesh.userData.sharedGeometry = true;
      group.add(mesh);
    }
    this.scene.add(group);
    const away = new THREE.Vector3(e.pos.x - from.x, 0, e.pos.z - from.z);
    if (away.lengthSq() < 0.01) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    away.normalize();
    const axis = new THREE.Vector3().crossVectors(UP, away).normalize();
    const FALL = 1.3;
    this.anims.push({
      obj: group,
      age: 0,
      tick: (a) => {
        const t = Math.min(1, a.age / FALL);
        group.quaternion.setFromAxisAngle(axis, (Math.PI / 2) * 0.96 * t * t); // accelerate like a real fall
        if (a.age > FALL + 3) group.position.y = e.pos.y - (a.age - FALL - 3) * 0.8; // sink after a while
        return a.age < FALL + 6;
      },
    });
  }

  private breakProp(e: Entry): void {
    const obj = e.object!;
    obj.visible = false;
    const group = new THREE.Group();
    group.position.copy(e.pos).setY(0.5);
    const mat = new THREE.MeshStandardMaterial({ color: e.debrisColor ?? 0x8a6a45, flatShading: true });
    const pieces = Array.from({ length: 7 }, () => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.18 + Math.random() * 0.2, 0.08 + Math.random() * 0.12, 0.25), mat);
      const v = new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 3, (Math.random() - 0.5) * 6);
      group.add(m);
      return { m, v, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8) };
    });
    this.scene.add(group);
    this.anims.push({
      obj: group,
      age: 0,
      tick: (a, dt) => {
        for (const p of pieces) {
          p.v.y -= 15 * dt;
          p.m.position.addScaledVector(p.v, dt);
          if (p.m.position.y < -0.45) {
            p.m.position.y = -0.45;
            p.v.multiplyScalar(0.4);
            p.v.y = Math.abs(p.v.y) * 0.3;
          }
          p.m.rotation.x += p.spin.x * dt;
          p.m.rotation.z += p.spin.z * dt;
          if (a.age > 2) p.m.scale.setScalar(Math.max(0.01, 1 - (a.age - 2)));
        }
        return a.age < 3;
      },
    });
  }
}

function disposeTree(scene: THREE.Scene, obj: THREE.Object3D): void {
  scene.remove(obj);
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!o.userData.sharedGeometry) o.geometry.dispose();
    (o.material as THREE.Material).dispose();
  });
}
