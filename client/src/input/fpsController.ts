import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { CITADEL } from '@game/shared';
import { PEDESTAL_RADIUS, TOWER_RADIUS, angleToNearestGate, gateTowerPositions } from '../render/citadel.ts';

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 6;
const RUN_SPEED = 10;
const JUMP_SPEED = 7.5;
const GRAVITY = 24;
const PLAYER_RADIUS = 0.45;

/**
 * First-person controller: pointer-lock mouse look, WASD, Shift to run, Space to jump.
 * Collides with the citadel wall (passable only through gates), gate towers and the crystal pedestal.
 */
export class FpsController {
  readonly controls: PointerLockControls;
  private keys = new Set<string>();
  private velY = 0;
  private onGround = true;
  private towers = gateTowerPositions();

  constructor(private camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
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
    if (!this.controls.isLocked) return;
    const k = this.keys;
    const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_SPEED : WALK_SPEED;
    let fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    let right = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const len = Math.hypot(fwd, right);
    if (len > 0) {
      fwd /= len;
      right /= len;
    }

    const pos = this.camera.position;
    const prevR = Math.hypot(pos.x, pos.z);
    this.controls.moveForward(fwd * speed * dt);
    this.controls.moveRight(right * speed * dt);
    this.collide(pos, prevR);

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
    // Wall ring: blocked unless within a gate opening.
    const r = Math.hypot(pos.x, pos.z);
    const inner = C.wallRadius - C.wallThickness / 2 - PLAYER_RADIUS;
    const outer = C.wallRadius + C.wallThickness / 2 + PLAYER_RADIUS;
    if (r > inner && r < outer) {
      const a = Math.atan2(pos.x, pos.z);
      const inGate = angleToNearestGate(a) * C.wallRadius < C.gateWidth / 2 - PLAYER_RADIUS;
      if (!inGate) setRadius(pos, prevR < C.wallRadius ? inner : outer);
    }
    // Round obstacles.
    pushOutOfCircle(pos, 0, 0, PEDESTAL_RADIUS + PLAYER_RADIUS);
    for (const t of this.towers) pushOutOfCircle(pos, t.x, t.z, TOWER_RADIUS + PLAYER_RADIUS);
    // World bounds.
    if (Math.hypot(pos.x, pos.z) > C.forestOuterRadius) setRadius(pos, C.forestOuterRadius);
  }
}

function setRadius(pos: THREE.Vector3, r: number): void {
  const cur = Math.hypot(pos.x, pos.z) || 1;
  pos.x *= r / cur;
  pos.z *= r / cur;
}

function pushOutOfCircle(pos: THREE.Vector3, cx: number, cz: number, radius: number): void {
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d = Math.hypot(dx, dz);
  if (d < radius && d > 1e-6) {
    pos.x = cx + (dx / d) * radius;
    pos.z = cz + (dz / d) * radius;
  }
}
