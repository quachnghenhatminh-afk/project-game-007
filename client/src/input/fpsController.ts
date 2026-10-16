import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { CITADEL } from '@game/shared';
import type { BoxCollider, MapCollision } from '../render/gameMap.ts';
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
 * Collides with the map's round/box obstacles (+ map-specific walls). The player can walk a few\n * meters into the fog wall, slowing down, then is stopped. lift raises the player (guardian spirit).
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
  /** Set by the owner: called on each jump attempt; return false to refuse (not enough stamina). */
  jumpAllowed: () => boolean = () => true;
  /** Meters above the ground the player floats at (guardian spirit); 0 = normal walking. */
  lift = 0;
  /** Movement speed multiplier (e.g. slower while the spirit is active). */
  speedScale = 1;
  /** Touch input (mobile): joystick vector (x = right, y = forward, length ≤ 1) and buttons. */
  readonly touch = { active: false, x: 0, y: 0, sprint: false, jump: false };
  private keys = new Set<string>();
  private velY = 0;
  private onGround = true;

  constructor(
    private camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    private map: MapCollision,
    spawn?: { pos: THREE.Vector3; yaw: number },
  ) {
    this.controls = new PointerLockControls(camera, domElement);
    camera.position.copy(spawn?.pos ?? new THREE.Vector3(0, EYE_HEIGHT, -14));
    camera.rotation.set(0, spawn?.yaw ?? Math.PI, 0);

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

  /** Touch look: rotate the view by a drag delta in pixels. */
  look(dx: number, dy: number, sensitivity = 0.005): void {
    const r = this.camera.rotation;
    r.order = 'YXZ';
    r.y -= dx * sensitivity;
    r.x = Math.max(-1.45, Math.min(1.45, r.x - dy * sensitivity));
  }

  update(dt: number): void {
    const t = this.touch;
    if (!this.controls.isLocked && !t.active) {
      this.speed = 0;
      this.wantsSprint = false;
      return;
    }
    const k = this.keys;
    let fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + t.y;
    let right = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + t.x;
    const len = Math.hypot(fwd, right);
    if (len > 1) {
      fwd /= len;
      right /= len;
    }
    this.wantsSprint = (k.has('ShiftLeft') || k.has('ShiftRight') || t.sprint) && len > 0.1;
    const pos = this.camera.position;
    const fog = fogDepth(Math.hypot(pos.x, pos.z));
    const base = this.wantsSprint && this.sprintAllowed() ? RUN_SPEED : WALK_SPEED;
    const speed = base * (1 - fog * (1 - FOG_MIN_SPEED)) * this.speedScale;

    const prevX = pos.x;
    const prevZ = pos.z;
    const prevR = Math.hypot(pos.x, pos.z);
    this.controls.moveForward(fwd * speed * dt);
    this.controls.moveRight(right * speed * dt);
    this.collide(pos, prevR);
    this.speed = dt > 0 ? Math.hypot(pos.x - prevX, pos.z - prevZ) / dt : 0;

    if (this.lift > 0) {
      // Floating inside the guardian spirit: glide up to the lift height, no gravity, no jumping.
      t.jump = false;
      const target = EYE_HEIGHT + this.lift;
      pos.y += (target - pos.y) * Math.min(1, dt * 4);
      this.velY = 0;
      this.onGround = false;
      return;
    }
    if ((k.has('Space') || t.jump) && this.onGround) {
      t.jump = false;
      if (this.jumpAllowed()) {
        this.velY = JUMP_SPEED;
        this.onGround = false;
      }
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
    this.map.collideExtra?.(pos, prevR, PLAYER_RADIUS);
    for (const c of this.map.colliders) if (c.enabled !== false) pushOutOfCircle(pos, c.x, c.z, c.r + PLAYER_RADIUS);
    for (const b of this.map.boxes) if (b.enabled !== false) pushOutOfBox(pos, b, PLAYER_RADIUS);
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

/** Pushes a circle (the player) out of a rotated rectangle along the shortest way. */
function pushOutOfBox(pos: THREE.Vector3, b: BoxCollider, pr: number): void {
  const dx = pos.x - b.x;
  const dz = pos.z - b.z;
  const reach = Math.max(b.hw, b.hd) + pr;
  if (Math.abs(dx) > reach * 1.42 || Math.abs(dz) > reach * 1.42) return;
  const cos = Math.cos(b.rot);
  const sin = Math.sin(b.rot);
  // World → box-local (local X = (cos, -sin), local Z = (sin, cos)).
  let lx = dx * cos - dz * sin;
  let lz = dx * sin + dz * cos;
  const ex = b.hw + pr;
  const ez = b.hd + pr;
  if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) return;
  if (ex - Math.abs(lx) < ez - Math.abs(lz)) lx = Math.sign(lx || 1) * ex;
  else lz = Math.sign(lz || 1) * ez;
  pos.x = b.x + lx * cos + lz * sin;
  pos.z = b.z - lx * sin + lz * cos;
}