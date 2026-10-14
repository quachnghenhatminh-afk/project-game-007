// Balance data (towers, enemies). First-pass numbers from docs/GDD.md; tuned in Phase 1.

export type TowerId = 'arrow' | 'cannon' | 'frost';

export interface TowerStats {
  id: TowerId;
  name: string;
  cost: number;
}

export const TOWERS: Record<TowerId, TowerStats> = {
  arrow: { id: 'arrow', name: 'Tháp Cung', cost: 100 },
  cannon: { id: 'cannon', name: 'Tháp Pháo', cost: 200 },
  frost: { id: 'frost', name: 'Tháp Băng', cost: 150 },
};

export const PLAYER = {
  maxHp: 100,
  maxMana: 100,
  manaRegenPerSec: 8,
  /** Temporary: players cannot die until combat exists (Phase 1). */
  invincible: true,
} as const;

/** Circular citadel layout (meters). Shared so server pathing matches the client scene. */
export const CITADEL = {
  wallRadius: 30,
  wallThickness: 3,
  wallHeight: 10,
  gateWidth: 7,
  gateHeight: 7,
  /** Gate directions in radians; a gate sits at (sin a, 0, cos a) * wallRadius. Index = gate number - 1. */
  gateAngles: [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2] as const,
  /** Roads run from each gate to a monster portal just inside the fog wall. */
  roadLength: 42,
  forestInnerRadius: 40,
  forestOuterRadius: 130,
  /** Players cannot walk past this radius (hidden inside the fog wall). */
  playAreaRadius: 72,
  fogWallRadius: 76,
} as const;
