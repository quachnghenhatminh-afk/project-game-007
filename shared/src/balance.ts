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

/** Circular citadel layout (meters). Shared so server pathing matches the client scene. */
export const CITADEL = {
  wallRadius: 30,
  wallThickness: 2.4,
  wallHeight: 7,
  gateWidth: 7,
  /** Gate directions in radians; a gate sits at (sin a, 0, cos a) * wallRadius. Index = gate number - 1. */
  gateAngles: [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2] as const,
  roadLength: 70,
  forestInnerRadius: 42,
  forestOuterRadius: 140,
} as const;
