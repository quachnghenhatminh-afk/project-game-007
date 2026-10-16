import { getCommand } from '@game/shared';
import type { WeaponId } from '../game/loadout.ts';

// Placeholder icons (emoji + color) until real icon art exists.

export const SPELL_ICONS: Record<string, { glyph: string; color: string }> = {
  fireball: { glyph: '🔥', color: '#ff6a1f' },
  frost: { glyph: '❄️', color: '#8fdcff' },
  lightning: { glyph: '⚡', color: '#fff36b' },
  meteor: { glyph: '☄️', color: '#ff3b1f' },
  'mage-shield': { glyph: '🛡️', color: '#6fd8ff' },
  'sound-blast': { glyph: '📢', color: '#9ff6ff' },
  'guardian-spirit': { glyph: '👹', color: '#a77bff' },
};

export const WEAPONS: Record<WeaponId, { glyph: string; name: string; color: string }> = {
  wand: { glyph: '🪄', name: 'Đũa phép', color: '#c9a24a' },
};

export function spellName(id: string): string {
  const p = getCommand(id)?.phrases[0] ?? id;
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** Inner HTML for a spell chip (icon + name). */
export function spellChip(id: string | null): string {
  if (!id) return '<span class="chip-empty">trống</span>';
  const icon = SPELL_ICONS[id] ?? { glyph: '✨', color: '#ffffff' };
  return `<span class="chip-glyph" style="--c:${icon.color}">${icon.glyph}</span><span class="chip-name">${spellName(id)}</span>`;
}

export function weaponChip(id: WeaponId | null): string {
  if (!id) return '<span class="chip-empty">tay không</span>';
  const w = WEAPONS[id];
  return `<span class="chip-glyph" style="--c:${w.color}">${w.glyph}</span><span class="chip-name">${w.name}</span>`;
}

export const CHIP_CSS = `
.chip-glyph { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; font-size: 18px;
  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c) 70%, white), color-mix(in srgb, var(--c) 55%, #0a0f1e));
  box-shadow: 0 0 8px color-mix(in srgb, var(--c) 60%, transparent); }
.chip-name { font: 700 10px system-ui, sans-serif; text-align: center; line-height: 1.1; margin-top: 2px; white-space: nowrap; }
.chip-empty { font: 600 10px system-ui, sans-serif; opacity: 0.45; }
`;
