import * as THREE from 'three';

// Placeholder spell visuals: simple shapes that grow and fade. Real VFX come in Phase 1.

const SPELL_COLORS: Record<string, number> = {
  fireball: 0xff6a1f,
  frost: 0x8fdcff,
  lightning: 0xfff36b,
  meteor: 0xff3b1f,
  'raise-shield': 0xc9b48a,
  taunt: 0xff4d4d,
  'ground-slam': 0x9b7a52,
  unyielding: 0xffd34d,
  heal: 0x5dff8a,
  cleanse: 0xffffff,
  blessing: 0xffe680,
  revive: 0xb8ffcf,
  repair: 0x6bc4ff,
  'place-mine': 0x444444,
  overload: 0xff9a3c,
  fortress: 0x9aa6b8,
  'help-me': 0xff6b9d,
  focus: 0xff2d2d,
};

export function spellColor(commandId: string): number {
  return SPELL_COLORS[commandId] ?? 0xffffff;
}

interface ActiveEffect {
  object: THREE.Object3D;
  material: THREE.Material & { opacity: number };
  age: number;
  life: number;
  delay: number;
  tick(e: ActiveEffect, k: number): void;
}

export class SpellEffects {
  private active: ActiveEffect[] = [];
  private aimRing: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(private scene: THREE.Scene) {
    this.aimRing = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.6, 48),
      new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.visible = false;
    scene.add(this.aimRing);
  }

  /** Ground point under the crosshair (max 60 m away). */
  aimPoint(camera: THREE.Camera): THREE.Vector3 {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hit = new THREE.Vector3();
    const ray = this.raycaster.ray;
    if (ray.intersectPlane(this.ground, hit) && hit.distanceTo(ray.origin) < 60) return hit;
    const flatDir = new THREE.Vector3(ray.direction.x, 0, ray.direction.z).normalize();
    return ray.origin.clone().addScaledVector(flatDir, 25).setY(0);
  }

  /**
   * Shows the target ring on the ground (null hides it).
   * @param scale ring size multiplier (empowered spells are bigger)
   * @param color ring color (gold while an empowered spell is held)
   */
  showAimRing(point: THREE.Vector3 | null, scale = 1, color = 0xfff1a8): void {
    this.aimRing.visible = point !== null;
    if (!point) return;
    this.aimRing.position.set(point.x, 0.12, point.z);
    this.aimRing.scale.setScalar(scale);
    (this.aimRing.material as THREE.MeshBasicMaterial).color.set(color);
  }

  /** @param scale size multiplier (CASTING.empowerScale for empowered spells) */
  cast(commandId: string, point: THREE.Vector3, scale = 1): void {
    const color = SPELL_COLORS[commandId] ?? 0xffffff;
    if (scale > 1) this.spawnShockwave(point, 6 * scale);
    if (commandId === 'meteor') {
      this.spawnSphere(color, point, 2.5 * scale, 3.5 * scale, 1.5); // warning marker while it falls
      const rock = this.spawnSphere(0x5a2a1a, point, 0, 2.5, 1.5);
      rock.tick = (e, k) => {
        e.object.position.set(point.x + 30 * (1 - k), 1 + 60 * (1 - k), point.z);
        e.object.scale.setScalar(2.5 * scale);
        e.material.opacity = 1;
      };
      this.spawnSphere(color, point, 1.5, 12 * scale, 1.0, 1.5);
      return;
    }
    if (commandId === 'lightning') {
      const bolt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25 * scale, 0.25 * scale, 40, 6),
        new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }),
      );
      bolt.position.set(point.x, 20, point.z);
      this.add(bolt, 0.45, 0, (e, k) => {
        e.material.opacity = 1 - k;
        e.object.visible = Math.floor(k * 12) % 2 === 0;
      });
    }
    this.spawnSphere(color, point, 0.5, (commandId === 'frost' ? 5 : 4) * scale, 0.9);
  }

  /** Flat gold ring racing outward along the ground (empowered spells). */
  private spawnShockwave(at: THREE.Vector3, radius: number): void {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd75a, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, 0.2, at.z);
    this.add(ring, 0.6, 0, (e, k) => {
      e.object.scale.setScalar(0.5 + radius * Math.sqrt(k));
      e.material.opacity = 1 - k;
    });
  }

  /** Grey puff in front of the camera for a failed cast. */
  fizzle(camera: THREE.Camera): void {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const p = camera.position.clone().addScaledVector(dir, 1.5).add(new THREE.Vector3(0, -0.4, 0));
    this.spawnSphere(0x777777, p, 0.1, 0.6, 0.6);
  }

  update(dt: number): void {
    this.active = this.active.filter((e) => {
      e.age += dt;
      if (e.age < e.delay) return true;
      e.object.visible = true;
      const k = Math.min((e.age - e.delay) / e.life, 1);
      e.tick(e, k);
      if (k >= 1) {
        this.scene.remove(e.object);
        if (e.object instanceof THREE.Mesh) e.object.geometry.dispose();
        e.material.dispose();
        return false;
      }
      return true;
    });
  }

  private spawnSphere(color: number, at: THREE.Vector3, from: number, to: number, life: number, delay = 0): ActiveEffect {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }),
    );
    mesh.position.copy(at);
    return this.add(mesh, life, delay, (e, k) => {
      e.object.scale.setScalar(from + (to - from) * Math.sqrt(k));
      e.material.opacity = 0.85 * (1 - k);
    });
  }

  private add(object: THREE.Mesh, life: number, delay: number, tick: ActiveEffect['tick']): ActiveEffect {
    const material = object.material as THREE.Material & { opacity: number };
    object.visible = delay === 0;
    this.scene.add(object);
    const effect: ActiveEffect = { object, material, age: 0, life, delay, tick };
    this.active.push(effect);
    return effect;
  }
}
