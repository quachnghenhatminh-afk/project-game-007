import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COMMANDS } from './commands.ts';
import { toSyllables } from './voiceMatch.ts';

describe('command table', () => {
  it('has unique ids', () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no phrase shared by two commands', () => {
    const seen = new Map<string, string>();
    for (const c of COMMANDS) {
      for (const p of c.phrases) {
        const key = toSyllables(p).join(' ');
        expect(seen.get(key), `"${p}" used twice`).toBeUndefined();
        seen.set(key, c.id);
      }
    }
  });

  it('has unique hotkeys within each class', () => {
    const seen = new Set<string>();
    for (const c of COMMANDS) {
      if (c.hotkey === null) continue;
      const key = `${c.classId}:${c.hotkey}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  // Vosk silently drops grammar words that are not in the model vocabulary.
  // The vocab file is produced by `pnpm voice:model`.
  const vocabPath = fileURLToPath(new URL('../../tools/voice-lab/model-vocab.txt', import.meta.url));
  it.runIf(existsSync(vocabPath))('uses only words known to the Vosk model', () => {
    const vocab = new Set(readFileSync(vocabPath, 'utf8').split('\n'));
    const unknown = COMMANDS.flatMap((c) =>
      c.phrases.flatMap((p) => p.normalize('NFC').toLowerCase().split(/\s+/)),
    ).filter((w) => !vocab.has(w));
    expect(unknown).toEqual([]);
  });
});
