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
