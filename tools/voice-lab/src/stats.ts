import type { CastAttempt } from '@game/client/game/spellCaster';

export interface Attempt extends CastAttempt {
  at: number;
  grammar: boolean;
  /** Guided practice only: the command the tester was asked to say. */
  target: string | null;
  /** Guided practice only: did the recognized command equal the target? */
  correct: boolean | null;
}

export interface Summary {
  attempts: number;
  /** Fraction of attempts where any spell was recognized. */
  matchRate: number | null;
  /** Guided practice: fraction recognized as the requested spell. */
  accuracy: number | null;
  scored: number;
  correct: number;
  empoweredRate: number | null;
  avgMs: number | null;
  p95Ms: number | null;
}

export function summarize(list: readonly Attempt[]): Summary {
  const spells = list.filter((a) => a.result === 'spell');
  const scored = list.filter((a) => a.correct !== null);
  const correct = scored.filter((a) => a.correct).length;
  const lat = list
    .map((a) => a.latencyMs)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  return {
    attempts: list.length,
    matchRate: list.length ? spells.length / list.length : null,
    accuracy: scored.length ? correct / scored.length : null,
    scored: scored.length,
    correct,
    empoweredRate: spells.length ? spells.filter((a) => a.empowered).length / spells.length : null,
    avgMs: lat.length ? lat.reduce((s, v) => s + v, 0) / lat.length : null,
    p95Ms: lat.length ? lat[Math.max(0, Math.ceil(lat.length * 0.95) - 1)]! : null,
  };
}

/** Phase 0 pass criteria from CLAUDE.md. */
export const CRITERIA = { avgMs: 500, p95Ms: 800, accuracy: 0.9, minAttempts: 50 };

const STORAGE_KEY = 'voice-lab-attempts-v2';

export function loadAttempts(): Attempt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attempt[]) : [];
  } catch {
    return [];
  }
}

export function saveAttempts(list: readonly Attempt[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage may be blocked inside iframes; stats then live for this session only.
  }
}
