import * as THREE from 'three';
import { SPELLS } from '@game/shared';
import { glowTexture } from '../render/textures.ts';

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
  'mage-shield': 0x6fd8ff,
  'sound-blast': 0x9ff6ff,
  'guardian-spirit': 0xa77bff,
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

/** Handle to the running guardian-spirit visual. */
export interface SpiritHandle {
  /** Swing the giant's arm (melee while the spirit is up). */
  swing(): void;
}

export class SpellEffects {
  /**
   * Called when a spell actually lands (immediately for most, after the fall for Meteor,
   * on arrival for the sound bullet). Used for destruction and explosion sounds.
   */
  onImpact: (commandId: string, point: THREE.Vector3, radius: number) => void = () => {};
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

  /**
   * @param scale size multiplier (CASTING.empowerScale for empowered spells)
   * @param from  where the spell leaves the caster (projectiles start here)
   */
  cast(commandId: string, point: THREE.Vector3, scale = 1, from?: THREE.Vector3): void {
    const color = SPELL_COLORS[commandId] ?? 0xffffff;
    const radius = (SPELLS.impactRadius[commandId] ?? 2) * scale;
    if (commandId === 'sound-blast') {
      this.soundBullet(from ?? point.clone().setY(1.5), point, scale, () => this.onImpact(commandId, point, radius));
      return;
    }
    if (scale > 1) this.spawnShockwave(point, 6 * scale);
    if (commandId === 'meteor') {
      this.later(1.5, () => this.onImpact(commandId, point, radius));
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
    this.onImpact(commandId, point, radius);
  }

  /** Runs n after delay seconds of game time. */
  private later(delay: number, fn: () => void): void {
    let done = false;
    this.add(new THREE.Object3D(), 0.01, delay, () => {
      if (!done) fn();
      done = true;
    }, { opacity: 1 } as unknown as THREE.Material & { opacity: number });
  }

  /**
   * Protective bubble around the caster that follows them, then flickers out.
   * @param follow returns the caster's feet position each frame
   */
  shield(follow: () => THREE.Vector3, scale = 1): void {
    const r = SPELLS.shieldRadius * scale;
    const group = new THREE.Group();
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0x6fd8ff,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), shellMat));
    const lattice = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r * 1.01, 1),
      new THREE.MeshBasicMaterial({ color: 0xbff4ff, wireframe: true, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    group.add(lattice);
    const latticeMat = lattice.material as THREE.MeshBasicMaterial;
    const life = SPELLS.shieldDurationSec;
    this.add(group, life, 0, (e, k) => {
      group.position.copy(follow()).setY(follow().y + r * 0.55);
      const t = k * life;
      const appear = Math.min(1, t / 0.15); // pop in
      const fadeStart = 0.8;
      const fade = k < fadeStart ? 1 : (1 - k) / (1 - fadeStart);
      const flicker = k > fadeStart && Math.floor(t * 20) % 2 === 0 ? 0.4 : 1; // blink before vanishing
      group.scale.setScalar(0.6 + 0.4 * appear);
      lattice.rotation.y = t * 0.8;
      lattice.rotation.x = t * 0.3;
      e.material.opacity = 0.18 * fade * flicker;
      latticeMat.opacity = 0.5 * fade * flicker;
    }, shellMat);
  }

  /** "Alô alô": a ring-wave bullet flying from `from` to `to`, bursting on arrival. */
  private soundBullet(from: THREE.Vector3, to: THREE.Vector3, scale: number, onArrive: () => void): void {
    const color = SPELL_COLORS['sound-blast']!;
    const dir = to.clone().sub(from);
    const dist = dir.length();
    dir.normalize();
    const travel = Math.max(0.15, dist / SPELLS.soundBulletSpeed);
    const bullet = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35 + i * 0.18, 0.04, 6, 24), ringMat);
      ring.position.z = -i * 0.35;
      bullet.add(ring);
    }
    bullet.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    bullet.scale.setScalar(scale);
    bullet.lookAt(dir); // local -Z… rings face the travel direction either way
    bullet.position.copy(from);
    let trailTimer = 0;
    this.add(bullet, travel, 0, (e, k) => {
      e.object.position.copy(from).addScaledVector(dir, dist * k);
      e.object.rotation.z = k * 12;
      trailTimer -= 0.016;
      if (trailTimer <= 0 && k < 1) {
        trailTimer = 0.05;
        this.spawnTrailRing(e.object.position, dir, color, scale);
      }
      if (k >= 1) {
        onArrive();
        this.spawnShockwaveColor(to, 5 * scale, color);
        this.spawnSphere(color, to, 0.4, 3 * scale, 0.5);
      }
    }, ringMat);
  }

  private spawnTrailRing(at: THREE.Vector3, dir: THREE.Vector3, color: number, scale: number): void {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.4 * scale, 0.03, 6, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    ring.position.copy(at);
    ring.lookAt(at.clone().add(dir));
    this.add(ring, 0.4, 0, (e, k) => {
      e.object.scale.setScalar(1 + k * 2.5);
      e.material.opacity = 0.8 * (1 - k);
    });
  }

  /**
   * "Bảo hộ": a translucent energy giant around the caster (ribcage, head, arms).
   * @param follow caster's feet position and view yaw each frame
   */
  spirit(follow: () => { pos: THREE.Vector3; yaw: number }, durationSec: number): SpiritHandle {
    const color = SPELL_COLORS['guardian-spirit']!;
    // Normal blending so it stays visible against a bright daytime sky (additive would vanish).
    const glow = (o: number, c = color) =>
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
    const g = new THREE.Group();
    const shell = glow(0.22);
    const bone = glow(0.75, 0xd9c4ff);
    g.add(new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 3.2, 6, 18), shell).translateY(3.6));
    for (let i = 0; i < 5; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(1.9 - Math.abs(i - 2) * 0.12, 0.08, 6, 24, Math.PI), bone);
      rib.rotation.x = Math.PI / 2;
      rib.position.y = 2.4 + i * 0.55;
      g.add(rib);
    }
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), bone).translateY(3.4).translateZ(-1.6)); // spine
    const head = new THREE.Group();
    head.position.y = 6.7;
    head.add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), shell));
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.3, 6), bone);
      horn.position.set(s * 0.7, 0.9, -0.1);
      horn.rotation.z = -s * 0.5;
      head.add(horn);
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glow(0.95)).translateX(s * 0.4).translateZ(0.95)); // eyes
    }
    g.add(head);
    const arms: THREE.Group[] = [];
    for (const s of [-1, 1]) {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), shell).translateX(s * 2.5).translateY(5.2));
      const arm = new THREE.Group();
      arm.position.set(s * 2.6, 5.2, 0);
      const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 3, 4, 10), shell);
      limb.position.set(0, -1.2, 1.3);
      limb.rotation.x = 1.0;
      arm.add(limb);
      arm.add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), bone).translateY(-2).translateZ(2.6)); // fist
      g.add(arm);
      arms.push(arm);
    }
    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.6, 1),
      new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    wire.position.y = 3.8;
    g.add(wire);
    // Rising spirit flames.
    const N = 70;
    const fp = new Float32Array(N * 3);
    const seeds = Array.from({ length: N }, () => ({ a: Math.random() * 6.28, r: 1.2 + Math.random() * 1.4, s: 0.5 + Math.random() }));
    const flameGeo = new THREE.BufferGeometry();
    flameGeo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    const flames = new THREE.Points(
      flameGeo,
      new THREE.PointsMaterial({ color, size: 0.9, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    g.add(flames);

    let swingT = -1;
    const mats = [shell, bone];
    const base = mats.map((m) => m.opacity);
    this.add(g, durationSec, 0, (e, k) => {
      const f = follow();
      g.position.copy(f.pos);
      g.rotation.y = f.yaw + Math.PI;
      const t = k * durationSec;
      const fadeIn = Math.min(1, t / 0.4);
      const fadeOut = Math.min(1, (durationSec - t) / 0.5);
      const flicker = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 29) * 0.05;
      mats.forEach((m, i) => (m.opacity = base[i]! * fadeIn * fadeOut * flicker));
      g.scale.setScalar(0.7 + 0.3 * fadeIn);
      wire.rotation.y = t * 0.6;
      head.position.y = 6.7 + Math.sin(t * 2) * 0.1;
      seeds.forEach((sd, i) => {
        const h = ((t * sd.s + i * 0.37) % 1.6) * 4;
        fp.set([Math.sin(sd.a + t) * sd.r, 1 + h, Math.cos(sd.a + t) * sd.r], i * 3);
      });
      flameGeo.attributes.position!.needsUpdate = true;
      // Giant arm punch while swinging.
      if (swingT >= 0) {
        swingT += 0.016 / 0.45;
        const s = Math.sin(Math.min(swingT, 1) * Math.PI);
        arms[1]!.rotation.x = -s * 1.4;
        if (swingT >= 1) swingT = -1;
      } else {
        arms.forEach((a, i) => (a.rotation.x = Math.sin(t * 1.5 + i) * 0.08));
      }
    }, shell);
    return {
      swing: () => {
        swingT = 0;
      },
    };
  }

  /** Little burst of sparks where the wand hits something. */
  spark(at: THREE.Vector3, heavy = false): void {
    const color = heavy ? SPELL_COLORS['guardian-spirit']! : 0xbff4ff;
    this.spawnSphere(color, at, 0.1, heavy ? 2.2 : 0.7, 0.3);
    if (heavy) this.spawnShockwaveColor(at.clone().setY(0), 4, color);
  }

  private spawnShockwaveColor(at: THREE.Vector3, radius: number, color: number): void {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, 0.2, at.z);
    this.add(ring, 0.5, 0, (e, k) => {
      e.object.scale.setScalar(0.5 + radius * Math.sqrt(k));
      e.material.opacity = 1 - k;
    });
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
        e.object.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        });
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

  /** @param material the material `tick` animates (defaults to the mesh's own) */
  private add(
    object: THREE.Object3D,
    life: number,
    delay: number,
    tick: ActiveEffect['tick'],
    material = (object as THREE.Mesh).material as THREE.Material & { opacity: number },
  ): ActiveEffect {
    object.visible = delay === 0;
    this.scene.add(object);
    const effect: ActiveEffect = { object, material, age: 0, life, delay, tick };
    this.active.push(effect);
    return effect;
  }
}
