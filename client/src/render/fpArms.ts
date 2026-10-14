import * as THREE from 'three';
import { glowTexture } from './textures.ts';

// Placeholder first-person arms (to be replaced by player-mage-fparms.glb).
// Poses are in camera space: camera looks down -Z, +X right, +Y up.
// The left arm is the right arm mirrored (parent scale.x = -1), so poses are shared.
//
// States: rest → channel (gathering a pale orb) → charged (spell orb held, colored,
// bigger + gold halo when empowered, shaking when stamina is low) → throw / fizzle.

interface Pose {
  pos: THREE.Vector3;
  rot: THREE.Euler;
}
const REST: Pose = { pos: new THREE.Vector3(0.28, -0.4, -0.08), rot: new THREE.Euler(0.45, 0.18, 0.05) };
const CAST: Pose = { pos: new THREE.Vector3(0.22, -0.36, -0.12), rot: new THREE.Euler(0.66, 0.36, -0.45) };
const ORB_REST = new THREE.Vector3(0, -0.13, -0.62); // below the crosshair so aiming stays clear
/** Overall arm size; < 1 keeps the hands from filling the screen. */
const ARM_SCALE = 0.8;
const CHANNEL_COLOR = 0xbff4ff;
const EMPOWER_COLOR = 0xffd75a;

const SKIN = 0xe8b48f;
const SLEEVE = 0x3b2a6e;
const CUFF = 0xc9a24a;

type ArmState = 'rest' | 'channel' | 'charged' | 'release';

export class FpArms {
  private root = new THREE.Group();
  private arms: THREE.Group[] = [];
  private orb: THREE.Mesh;
  private orbGlow: THREE.Sprite;
  private halo: THREE.Sprite;
  private orbLight: THREE.PointLight;
  private orbMat: THREE.MeshBasicMaterial;
  private state: ArmState = 'rest';
  private castWeight = 0;
  private chargedScale = 1;
  private empowered = false;
  private shake = 0;
  /** 0..1 progress of the release animation. */
  private releaseT = 0;
  private releaseOk = false;
  private walkPhase = 0;
  private tmpPos = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private qA = new THREE.Quaternion();
  private qB = new THREE.Quaternion();

  constructor(fpScene: THREE.Scene) {
    fpScene.add(this.root);
    for (const side of [1, -1]) {
      const mirror = new THREE.Group();
      mirror.scale.x = side;
      const arm = buildArm();
      arm.scale.setScalar(ARM_SCALE);
      mirror.add(arm);
      this.root.add(mirror);
      this.arms.push(arm);
    }
    this.orbMat = new THREE.MeshBasicMaterial({ color: CHANNEL_COLOR, transparent: true });
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.042, 16, 12), this.orbMat);
    const additive = (color: number) =>
      new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.orbGlow = new THREE.Sprite(additive(0x7fe0ff));
    this.halo = new THREE.Sprite(additive(EMPOWER_COLOR));
    this.orbLight = new THREE.PointLight(0x9fe8ff, 0, 1.5, 2);
    this.root.add(this.orb, this.orbGlow, this.halo, this.orbLight);
    this.setOrbVisible(false);
  }

  /** Cast button pressed: raise hands and start gathering energy. */
  startChannel(): void {
    this.state = 'channel';
    this.empowered = false;
    this.setColor(CHANNEL_COLOR, 0x7fe0ff);
    this.orbMat.opacity = 1;
    this.setOrbVisible(true);
  }

  /** Spell recognized: the orb takes the spell's color and stays in the hands. */
  hold(color: number, empowered: boolean): void {
    this.state = 'charged';
    this.empowered = empowered;
    this.chargedScale = empowered ? 1.4 : 1.15;
    this.setColor(color, color);
    this.orbMat.opacity = 1;
    this.setOrbVisible(true);
  }

  /** Throw the held spell forward (success) or let the orb puff out (failure). */
  release(success: boolean, color?: number): void {
    if (this.state === 'rest') return;
    this.state = 'release';
    this.releaseT = 0;
    this.releaseOk = success;
    if (!success) this.setColor(0x777777, 0x555555);
    else if (color !== undefined) this.setColor(color, color);
  }

  /** 0..1: how much the hands tremble (low stamina while holding a spell). */
  setShake(amount: number): void {
    this.shake = amount;
  }

  update(dt: number, time: number, camera: THREE.Camera, moveSpeed: number): void {
    this.root.position.copy(camera.position);
    this.root.quaternion.copy(camera.quaternion);

    const target = this.state === 'rest' ? 0 : 1;
    this.castWeight += (target - this.castWeight) * Math.min(1, dt * 12);
    const w = this.castWeight;

    // Walk bob and idle breathing.
    this.walkPhase += dt * (moveSpeed > 0.5 ? moveSpeed * 1.4 : 1.2);
    const bobAmp = moveSpeed > 0.5 ? Math.min(moveSpeed / 10, 1) * 0.025 : 0.006;
    const bobY = Math.abs(Math.sin(this.walkPhase)) * bobAmp * (1 - w * 0.7);
    const swayX = Math.sin(this.walkPhase * 0.5) * bobAmp * 0.8 * (1 - w);
    const shakeAmp = this.state === 'charged' ? this.shake * 0.012 : 0;
    const jx = (Math.random() - 0.5) * shakeAmp;
    const jy = (Math.random() - 0.5) * shakeAmp;

    let thrust = 0;
    if (this.state === 'release') {
      this.releaseT += dt / 0.35;
      thrust = this.releaseOk ? Math.sin(Math.min(this.releaseT, 1) * Math.PI) * 0.16 : 0;
      if (this.releaseT >= 1) this.state = 'rest';
    }

    this.qA.setFromEuler(REST.rot);
    this.qB.setFromEuler(CAST.rot);
    this.tmpQ.copy(this.qA).slerp(this.qB, w);
    this.tmpPos.lerpVectors(REST.pos, CAST.pos, w);
    this.tmpPos.y += bobY - thrust * 0.15 + jy;
    this.tmpPos.z -= thrust;
    this.tmpPos.x += jx;
    this.arms.forEach((arm, i) => {
      arm.position.copy(this.tmpPos);
      arm.position.x += i === 0 ? swayX : -swayX;
      arm.quaternion.copy(this.tmpQ);
    });

    // Orb between the hands.
    const glowMat = this.halo.material as THREE.SpriteMaterial;
    if (this.state === 'channel' || this.state === 'charged') {
      const charged = this.state === 'charged';
      const pulse = 1 + Math.sin(time * (charged ? 10 : 18)) * 0.08;
      const size = Math.min(1, w * 1.2) * (charged ? this.chargedScale : 1) * pulse;
      this.orb.position.copy(ORB_REST).add(new THREE.Vector3(jx, bobY + jy, 0));
      this.orb.scale.setScalar(size);
      this.orbGlow.position.copy(this.orb.position);
      this.orbGlow.scale.setScalar(0.2 * size);
      this.orbLight.position.copy(this.orb.position);
      this.orbLight.intensity = 2.5 * size;
      this.halo.visible = charged && this.empowered;
      this.halo.position.copy(this.orb.position);
      this.halo.scale.setScalar(0.34 * size * (1 + Math.sin(time * 6) * 0.1));
      glowMat.rotation = time * 2;
    } else if (this.state === 'release') {
      const k = Math.min(this.releaseT, 1);
      const base = this.chargedScale;
      if (this.releaseOk) {
        this.orb.position.copy(ORB_REST).setZ(ORB_REST.z - k * 4);
        this.orb.scale.setScalar(base * (1 + k));
      } else {
        this.orb.position.copy(ORB_REST).setY(ORB_REST.y + k * 0.1);
        this.orb.scale.setScalar(1 + k * 3);
      }
      this.orbMat.opacity = 1 - k;
      this.orbGlow.position.copy(this.orb.position);
      this.orbGlow.scale.setScalar(0.55 * (1 + k) * (1 - k));
      this.orbLight.intensity = 2.5 * (1 - k);
      this.halo.visible = false;
    } else {
      this.setOrbVisible(false);
      this.chargedScale = 1;
    }
  }

  private setColor(core: number, glow: number): void {
    this.orbMat.color.set(core);
    (this.orbGlow.material as THREE.SpriteMaterial).color.set(glow);
    this.orbLight.color.set(glow);
  }

  private setOrbVisible(v: boolean): void {
    this.orb.visible = this.orbGlow.visible = v;
    if (!v) {
      this.orbLight.intensity = 0;
      this.halo.visible = false;
    }
  }
}

/** One arm, origin at the elbow, forearm pointing down -Z. Thumb on the -X (inner) side. */
function buildArm(): THREE.Group {
  const g = new THREE.Group();
  const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.085, 0.42, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.21), mat(SLEEVE));
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.016, 6, 14), mat(CUFF));
  cuff.position.z = -0.4;
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.06, 8).rotateX(-Math.PI / 2), mat(SKIN));
  wrist.position.z = -0.44;
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.035, 0.095), mat(SKIN));
  palm.position.z = -0.5;
  const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.026, 0.075), mat(SKIN));
  fingers.position.set(0, -0.012, -0.575);
  fingers.rotation.x = -0.35;
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, 0.06), mat(SKIN));
  thumb.position.set(-0.052, 0.004, -0.5);
  thumb.rotation.y = 0.5;
  g.add(sleeve, cuff, wrist, palm, fingers, thumb);
  return g;
}
