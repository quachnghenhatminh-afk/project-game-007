import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { CITADEL } from '@game/shared';
import { WALL_HALF_THICKNESS, angleToNearestGate, type Collider } from '../render/citadel.ts';
import { fogDepth } from '../render/environment.ts';

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 6;
const RUN_SPEED = 10;
const JUMP_SPEED = 8.8; // ≈1.6m jump
const GRAVITY = 24;
const PLAYER_RADIUS = 0.45;
/** Speed multiplier at the very edge of the play area (deep in the fog). */
const FOG_MIN_SPEED = 0.35;

/**
 * First-person controller: pointer-lock mouse look, WASD, Shift to run, Space to jump.
 * Collides with the citadel wall (passable only through gates) and round obstacles.
 * The player can walk a few meters into the fog wall, slowing down, then is stopped.
 */
export class FpsController {
  readonly controls: PointerLockControls;
  /** Horizontal speed this frame (m/s), for head/arm bob. */
  speed = 0;
  /** True when Shift is held while moving (whether stamina allows it is decided by `sprintAllowed`). */
  wantsSprint = false;
  /** Set by the owner: may the player actually run right now (stamina)? */
  sprintAllowed: () => boolean = () => true;
  /** Called when the player pushes against the edge of the play area. */
  onBlockedByFog: () => void = () => {};
  private keys = new Set<string>();
  private velY = 0;
  private onGround = true;

  constructor(
    private camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    private colliders: Collider[] = [],
  ) {
    this.controls = new PointerLockControls(camera, domElement);
    camera.position.set(0, EYE_HEIGHT, -14);
    camera.rotation.set(0, Math.PI, 0); // face gate 1 (+Z)

    window.addEventListener('keydown', (e) => {
      if (!this.controls.isLocked) return;
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.controls.addEventListener('unlock', () => this.keys.clear());
  }

  get isLocked(): boolean {
    return this.controls.isLocked;
  }

  lock(): void {
    this.controls.lock();
  }

  update(dt: number): void {
    if (!this.controls.isLocked) {
      this.speed = 0;
      this.wantsSprint = false;
      return;
    }
    const k = this.keys;
    let fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    let right = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const len = Math.hypot(fwd, right);
    if (len > 0) {
      fwd /= len;
      right /= len;
    }
    this.wantsSprint = (k.has('ShiftLeft') || k.has('ShiftRight')) && len > 0;
    const pos = this.camera.position;
    const fog = fogDepth(Math.hypot(pos.x, pos.z));
    const base = this.wantsSprint && this.sprintAllowed() ? RUN_SPEED : WALK_SPEED;
    const speed = base * (1 - fog * (1 - FOG_MIN_SPEED));

    const prevX = pos.x;
    const prevZ = pos.z;
    const prevR = Math.hypot(pos.x, pos.z);
    this.controls.moveForward(fwd * speed * dt);
    this.controls.moveRight(right * speed * dt);
    this.collide(pos, prevR);
    this.speed = dt > 0 ? Math.hypot(pos.x - prevX, pos.z - prevZ) / dt : 0;

    if (k.has('Space') && this.onGround) {
      this.velY = JUMP_SPEED;
      this.onGround = false;
    }
    this.velY -= GRAVITY * dt;
    pos.y += this.velY * dt;
    if (pos.y <= EYE_HEIGHT) {
      pos.y = EYE_HEIGHT;
      this.velY = 0;
      this.onGround = true;
    }
  }

  private collide(pos: THREE.Vector3, prevR: number): void {
    const C = CITADEL;
    const r = Math.hypot(pos.x, pos.z);
    const inner = C.wallRadius - WALL_HALF_THICKNESS - PLAYER_RADIUS;
    const outer = C.wallRadius + WALL_HALF_THICKNESS + PLAYER_RADIUS;
    if (r > inner && r < outer) {
      const a = Math.atan2(pos.x, pos.z);
      const inGate = angleToNearestGate(a) * C.wallRadius < C.gateWidth / 2 - PLAYER_RADIUS;
      if (!inGate) setRadius(pos, prevR < C.wallRadius ? inner : outer);
    }
    for (const c of this.colliders) pushOutOfCircle(pos, c.x, c.z, c.r + PLAYER_RADIUS);
    if (Math.hypot(pos.x, pos.z) > C.playAreaRadius) {
      setRadius(pos, C.playAreaRadius);
      this.onBlockedByFog();
    }
  }
}

function setRadius(pos: THREE.Vector3, r: number): void {
  const cur = Math.hypot(pos.x, pos.z) || 1;
  pos.x *= r / cur;
  pos.z *= r / cur;
}

function pushOutOfCircle(pos: THREE.Vector3, cx: number, cz: number, radius: number): void {
  const dx = pos.x - cx;
  if (dx > radius || dx < -radius) return;
  const dz = pos.z - cz;
  if (dz > radius || dz < -radius) return;
  const d = Math.hypot(dx, dz);
  if (d < radius && d > 1e-6) {
    pos.x = cx + (dx / d) * radius;
    pos.z = cz + (dz / d) * radius;
  }
}
