import type { VoiceCommand } from './commands.ts';

// Vietnamese tone marks as Unicode combining characters (after NFD).
// Other diacritics (circumflex, breve, horn) are part of the vowel and kept.
const TONE_MARKS: Record<string, string> = {
  '̀': '2', // huyền
  '́': '1', // sắc
  '̃': '4', // ngã
  '̉': '3', // hỏi
  '̣': '5', // nặng
};
const TONE_RE = /[̣̀́̃̉]/g;

/**
 * Canonical form of one syllable: base letters + tone digit.
 * Makes old/new tone placement equal ("hoả" === "hỏa") and ignores case.
 */
export function canonicalSyllable(syllable: string): string {
  const decomposed = syllable.normalize('NFD').toLowerCase();
  let tone = '';
  for (const ch of decomposed) {
    const t = TONE_MARKS[ch];
    if (t) tone = t;
  }
  return decomposed.replace(TONE_RE, '').normalize('NFC') + tone;
}

/** Splits free text into canonical syllables, dropping punctuation. */
export function toSyllables(text: string): string[] {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/\[unk\]/g, ' ')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((s) => s.length > 0)
    .map(canonicalSyllable);
}

export interface CommandMatch {
  command: VoiceCommand;
  phrase: string;
}

/**
 * Finds the command whose phrase appears in the recognized text as a
 * contiguous run of syllables. Earliest match wins; ties go to the longer phrase.
 */
export function matchCommand(text: string, commands: readonly VoiceCommand[]): CommandMatch | null {
  const said = toSyllables(text);
  let best: { match: CommandMatch; pos: number; len: number } | null = null;
  for (const command of commands) {
    for (const phrase of command.phrases) {
      const target = toSyllables(phrase);
      const pos = indexOfRun(said, target);
      if (pos < 0) continue;
      if (!best || pos < best.pos || (pos === best.pos && target.length > best.len)) {
        best = { match: { command, phrase }, pos, len: target.length };
      }
    }
  }
  return best?.match ?? null;
}

// --- Fuzzy matching ("70% giống, đúng thứ tự") -----------------------------------

/** Accept a fuzzy match at or above this average syllable similarity. */
export const FUZZY_THRESHOLD = 0.7;
/** …and only if it beats the second-best spell by at least this much (avoids coin flips). */
export const FUZZY_MARGIN = 0.1;
/** Similarity given to syllables that differ only in tone or vowel marks ("tải"/"tài", "alô"/"alo"). */
const MARKS_ONLY_SIMILARITY = 0.85;

export interface FuzzyMatch extends CommandMatch {
  /** 0..1, 1 = exact. */
  score: number;
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** Removes every Vietnamese mark: tones, circumflex/breve/horn, đ → d. */
function bareSyllable(canonical: string): string {
  return canonical
    .replace(/\d$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

/** 0..1 similarity of two canonical syllables. */
export function syllableSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const full = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const ba = bareSyllable(a);
  const bb = bareSyllable(b);
  const bare = (1 - levenshtein(ba, bb) / Math.max(ba.length, bb.length, 1)) * MARKS_ONLY_SIMILARITY;
  return Math.max(0, full, bare);
}

/**
 * Best in-order similarity of `target` syllables against any window of `said`.
 * Missing syllables count as 0, so half a phrase scores at most 0.5.
 */
export function phraseSimilarity(said: string[], target: string[]): number {
  if (target.length === 0) return 0;
  let best = 0;
  const windows = Math.max(1, said.length - target.length + 1);
  for (let start = 0; start < windows; start++) {
    let sum = 0;
    for (let i = 0; i < target.length; i++) {
      const s = said[start + i];
      if (s !== undefined) sum += syllableSimilarity(s, target[i]!);
    }
    best = Math.max(best, sum / target.length);
  }
  return best;
}

/**
 * Exact match first; otherwise the spell whose phrase is ≥70% similar (in order)
 * and clearly better than every other spell.
 */
export function fuzzyMatchCommand(
  text: string,
  commands: readonly VoiceCommand[],
  threshold = FUZZY_THRESHOLD,
  margin = FUZZY_MARGIN,
): FuzzyMatch | null {
  const exact = matchCommand(text, commands);
  if (exact) return { ...exact, score: 1 };
  const said = toSyllables(text);
  if (said.length === 0) return null;
  let best: FuzzyMatch | null = null;
  let second = 0;
  for (const command of commands) {
    let cmdBest: FuzzyMatch | null = null;
    for (const phrase of command.phrases) {
      const score = phraseSimilarity(said, toSyllables(phrase));
      if (!cmdBest || score > cmdBest.score) cmdBest = { command, phrase, score };
    }
    if (!cmdBest) continue;
    if (!best || cmdBest.score > best.score) {
      second = best?.score ?? 0;
      best = cmdBest;
    } else if (cmdBest.score > second) {
      second = cmdBest.score;
    }
  }
  if (!best || best.score < threshold || best.score - second < margin) return null;
  return best;
}

function indexOfRun(haystack: string[], needle: string[]): number {
  if (needle.length === 0) return -1;
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

export interface SyllableCheck {
  /** Syllable of the expected phrase, as written. */
  word: string;
  /** True if the recognizer heard this syllable. */
  ok: boolean;
}

/**
 * Per-syllable pronunciation feedback: which syllables of `phrase` appear in
 * what was heard. Tone-sensitive ("tải" ≠ "đài"), so a wrong tone shows red.
 */
export function compareToPhrase(heard: string, phrase: string): SyllableCheck[] {
  const said = toSyllables(heard);
  const used = new Array<boolean>(said.length).fill(false);
  return phrase
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((word) => {
      const canon = canonicalSyllable(word);
      const i = said.findIndex((s, j) => !used[j] && s === canon);
      if (i >= 0) used[i] = true;
      return { word, ok: i >= 0 };
    });
}

/** Restricted grammar for Vosk: every phrase (NFC, lowercase) plus "[unk]". */
export function buildVoskGrammar(commands: readonly VoiceCommand[]): string[] {
  const phrases = new Set<string>();
  for (const c of commands) for (const p of c.phrases) phrases.add(p.normalize('NFC').toLowerCase());
  return [...phrases, '[unk]'];
}
