import { describe, expect, it } from 'vitest';
import { COMMANDS } from './commands.ts';
import { buildVoskGrammar, canonicalSyllable, matchCommand } from './voiceMatch.ts';

describe('canonicalSyllable', () => {
  it('treats old and new tone placement as equal', () => {
    expect(canonicalSyllable('hoả')).toBe(canonicalSyllable('hỏa'));
  });
  it('ignores case and NFC/NFD differences', () => {
    expect(canonicalSyllable('HỎA'.normalize('NFD'))).toBe(canonicalSyllable('hỏa'));
  });
  it('keeps different tones apart', () => {
    expect(canonicalSyllable('máu')).not.toBe(canonicalSyllable('mâu'));
    expect(canonicalSyllable('sét')).not.toBe(canonicalSyllable('sẹt'));
  });
});

describe('matchCommand', () => {
  it('matches exact Vosk output', () => {
    expect(matchCommand('hỏa cầu', COMMANDS)?.command.id).toBe('fireball');
  });
  it('matches inside a longer Web Speech sentence with punctuation', () => {
    expect(matchCommand('Ờ, Băng Giá!', COMMANDS)?.command.id).toBe('frost');
  });
  it('returns null for [unk] and unrelated text', () => {
    expect(matchCommand('[unk]', COMMANDS)).toBeNull();
    expect(matchCommand('xin chào', COMMANDS)).toBeNull();
  });
  it('does not match a single syllable of a phrase', () => {
    expect(matchCommand('hồi', COMMANDS)).toBeNull();
  });
  it('picks the earliest phrase', () => {
    expect(matchCommand('sấm sét hỏa cầu', COMMANDS)?.command.id).toBe('lightning');
  });
});

describe('buildVoskGrammar', () => {
  it('ends with [unk] and has one entry per phrase', () => {
    const g = buildVoskGrammar(COMMANDS);
    expect(g.at(-1)).toBe('[unk]');
    expect(g).toContain('thiên thạch');
  });
});
