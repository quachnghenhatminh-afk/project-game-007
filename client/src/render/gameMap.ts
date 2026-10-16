import type * as THREE from 'three';

// What every playable map provides to the rest of the game.

export type MapId = 'citadel' | 'vn-base';

export const MAP_NAMES: Record<MapId, string> = {
  citadel: 'Thành Pha Lê (đêm)',
  'vn-base': 'Căn cứ Container (Việt Nam)',
};

/** Round obstacle. `enabled: false` = temporarily gone (destroyed prop/tree). */
export interface Collider {
  x: number;
  z: number;
  r: number;
  enabled?: boolean;
}

/** Rectangle obstacle on the ground, rotated by `rot` around Y (same convention as Object3D.rotation.y). */
export interface BoxCollider {
  x: number;
  z: number;
  /** Half width along local X / half depth along local Z. */
  hw: number;
  hd: number;
  rot: number;
  enabled?: boolean;
}

export interface MapCollision {
  colliders: Collider[];
  boxes: BoxCollider[];
  /** Map-specific shapes that circles/boxes can't express (e.g. the citadel's round wall). */
  collideExtra?(pos: THREE.Vector3, prevRadius: number, playerRadius: number): void;
}

export interface GameMap extends MapCollision {
  id: MapId;
  environment: 'night' | 'day';
  spawn: { pos: THREE.Vector3; yaw: number };
  /** Top of the crystal (core) — its health bar floats here. */
  coreTop: THREE.Vector3;
  update(dt: number, time: number): void;
}

export interface MapOptions {
  lowQuality?: boolean;
  /** Registers trees/props that can be destroyed. */
  destructibles?: import('../game/destructibles.ts').Destructibles;
}
