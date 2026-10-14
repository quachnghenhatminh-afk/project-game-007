import type { VoiceEngineId } from '@game/client/voice/types';

export interface Attempt {
  at: number;
  engine: VoiceEngineId;
  grammar: boolean;
  /** Command the tester was asked to say; null in free mode. */
  target: string | null;
  heard: string;
  matched: string | null;
  correct: boolean | null;
  latencyMs: number;
  holdMs: number;
}

export interface Summary {
  attempts: number;
  scored: number;
  correct: number;
  accuracy: number | null;
  avgMs: number | null;
  p95Ms: number | null;
}

export function summarize(list: readonly Attempt[]): Summary {
  const scored = list.filter((a) => a.correct !== null);
  const correct = scored.filter((a) => a.correct).length;
  const lat = list.map((a) => a.latencyMs).sort((a, b) => a - b);
  return {
    attempts: list.length,
    scored: scored.length,
    correct,
    accuracy: scored.length ? correct / scored.length : null,
    avgMs: lat.length ? lat.reduce((s, v) => s + v, 0) / lat.length : null,
    p95Ms: lat.length ? lat[Math.max(0, Math.ceil(lat.length * 0.95) - 1)]! : null,
  };
}

/** Phase 0 pass criteria from CLAUDE.md. */
export const CRITERIA = { avgMs: 500, p95Ms: 800, accuracy: 0.9, minAttempts: 50 };

const STORAGE_KEY = 'voice-lab-attempts-v1';

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
