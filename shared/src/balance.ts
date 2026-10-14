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
  maxStamina: 100,
  /** Temporary: players cannot die until combat exists (Phase 1). */
  invincible: true,
} as const;

/** Spellcasting/stamina tuning. See shared/src/playerState.ts for the rules. */
export const CASTING = {
  /**
   * true: a recognized spell fires immediately at the crosshair; while the button stays
   *       held the channel continues (mana keeps draining) and another spell can be said.
   * false: it stays in the hands (draining stamina) until the button is released.
   */
  autoCast: true,
  /** Stamina drain/regen on or off. */
  staminaEnabled: true,
  /** Mana lost per second while channeling (cast button held): full bar ≈ 4s. */
  manaDrainPerSec: 25,
  /** Recognized while mana ≥ this fraction of max → empowered spell ("perfect" zone = 30%…100% of the bar). */
  empowerThreshold: 0.3,
  /** Empowered spells are this much bigger. */
  empowerScale: 1.5,
  /** Cannot start channeling below this much mana. */
  minManaToChannel: 10,
  /** TESTING value (fast refill); tune down for real play. */
  manaRegenPerSec: 40,
  /** Mana starts refilling this long after draining stops. */
  manaRegenDelaySec: 0.2,
  /** Stamina lost per second while holding a charged spell: full bar ≈ 5s. */
  staminaHoldDrainPerSec: 20,
  staminaSprintDrainPerSec: 15,
  /** Stamina spent per jump; cannot jump with less than this. */
  staminaJumpCost: 14,
  staminaRegenPerSec: 22,
  staminaRegenDelaySec: 0.8,
  /** After stamina hits 0, sprinting stays locked until stamina is back to this. */
  staminaSprintUnlock: 25,
  /** Below this fraction the stamina bar and hands warn the player. */
  staminaLowWarning: 0.3,
  /** Releasing faster than this with nothing recognized = accidental click, cancelled silently. */
  tapCancelSec: 0.15,
  /** After release, how long to wait for the recognizer before giving up. */
  resolveTimeoutSec: 3,
} as const;

/** Spell-specific numbers. */
export const SPELLS = {
  /** "Tạo khiên": bubble around the caster. */
  shieldDurationSec: 2,
  shieldRadius: 1.6,
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
  /** Thick fog begins here; players slow down and visibility drops as they go deeper. */
  fogStartRadius: 72,
  fogWallRadius: 76,
  /** Players cannot walk past this radius (a few meters inside the fog wall). */
  playAreaRadius: 84,
} as const;
