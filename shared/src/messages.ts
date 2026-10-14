// Client ↔ server message types. Filled in during Phase 2 (multiplayer).

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CastIntent {
  type: 'cast';
  commandId: string;
  aimPoint: Vec3;
}

export interface BuildIntent {
  type: 'build';
  towerId: string;
  cell: { col: number; row: number };
}

export type ClientIntent = CastIntent | BuildIntent;
