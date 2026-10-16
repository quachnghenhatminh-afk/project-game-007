// SINGLE SOURCE OF TRUTH for voice commands.
// Vosk grammar, hotkeys and on-screen spell hints are all generated from this table.
// Phrases are written in standard Vietnamese, lowercase. The first phrase is the
// canonical one shown in UI; the rest are aliases.

export type ClassId = 'mage' | 'guardian' | 'healer' | 'engineer' | 'common';

export interface VoiceCommand {
  id: string;
  phrases: readonly string[];
  classId: ClassId;
  /** Fallback key 1–7, or null for commands without a hotkey. */
  hotkey: 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;
  costMana: number;
  cooldownMs: number;
  isUltimate?: boolean;
  /** Takes effect on the caster immediately instead of flying to the aim point. */
  selfCast?: boolean;
}

export const CLASS_NAMES: Record<ClassId, string> = {
  mage: 'Pháp Sư',
  guardian: 'Hộ Vệ',
  healer: 'Thầy Thuốc',
  engineer: 'Kỹ Sư',
  common: 'Chung',
};

// Mana/cooldown values are first-pass placeholders; tune in Phase 1.
export const COMMANDS: readonly VoiceCommand[] = [
  { id: 'fireball', phrases: ['hỏa cầu'], classId: 'mage', hotkey: 1, costMana: 20, cooldownMs: 3000 },
  { id: 'frost', phrases: ['băng giá'], classId: 'mage', hotkey: 2, costMana: 25, cooldownMs: 6000 },
  { id: 'lightning', phrases: ['sấm sét'], classId: 'mage', hotkey: 3, costMana: 30, cooldownMs: 5000 },
  { id: 'meteor', phrases: ['thiên thạch'], classId: 'mage', hotkey: 4, costMana: 80, cooldownMs: 45000, isUltimate: true },
  /** Self-cast: a bubble shield around the caster for 2s (no aiming). */
  { id: 'mage-shield', phrases: ['tạo khiên'], classId: 'mage', hotkey: 5, costMana: 20, cooldownMs: 4000, selfCast: true },
  /** Sound bullet: a ring-wave projectile flying to the aim point. ("alo" is not in the Vosk vocab, "alô" is.) */
  { id: 'sound-blast', phrases: ['alô alô', 'a lô a lô'], classId: 'mage', hotkey: 6, costMana: 15, cooldownMs: 1500 },
  /** Guardian spirit (Susanoo-like): lifts the caster 3m for 5s; no casting, melee only. */
  { id: 'guardian-spirit', phrases: ['bảo hộ'], classId: 'mage', hotkey: 7, costMana: 60, cooldownMs: 20000, selfCast: true },

  { id: 'raise-shield', phrases: ['dựng khiên'], classId: 'guardian', hotkey: 1, costMana: 25, cooldownMs: 10000 },
  { id: 'taunt', phrases: ['khiêu khích'], classId: 'guardian', hotkey: 2, costMana: 15, cooldownMs: 8000 },
  { id: 'ground-slam', phrases: ['đập đất'], classId: 'guardian', hotkey: 3, costMana: 20, cooldownMs: 6000 },
  { id: 'unyielding', phrases: ['bất khuất'], classId: 'guardian', hotkey: 4, costMana: 70, cooldownMs: 60000, isUltimate: true },

  { id: 'heal', phrases: ['hồi máu'], classId: 'healer', hotkey: 1, costMana: 20, cooldownMs: 3000 },
  { id: 'cleanse', phrases: ['thanh tẩy'], classId: 'healer', hotkey: 2, costMana: 20, cooldownMs: 8000 },
  { id: 'blessing', phrases: ['ban phước'], classId: 'healer', hotkey: 3, costMana: 35, cooldownMs: 15000 },
  { id: 'revive', phrases: ['hồi sinh'], classId: 'healer', hotkey: 4, costMana: 80, cooldownMs: 60000, isUltimate: true },

  { id: 'repair', phrases: ['sửa chữa'], classId: 'engineer', hotkey: 1, costMana: 15, cooldownMs: 4000 },
  { id: 'place-mine', phrases: ['đặt mìn'], classId: 'engineer', hotkey: 2, costMana: 20, cooldownMs: 5000 },
  { id: 'overload', phrases: ['quá tải'], classId: 'engineer', hotkey: 3, costMana: 30, cooldownMs: 12000 },
  { id: 'fortress', phrases: ['pháo đài'], classId: 'engineer', hotkey: 4, costMana: 70, cooldownMs: 60000, isUltimate: true },

  { id: 'help-me', phrases: ['cứu tôi'], classId: 'common', hotkey: null, costMana: 0, cooldownMs: 3000 },
  { id: 'focus', phrases: ['tập trung'], classId: 'common', hotkey: null, costMana: 0, cooldownMs: 1000 },
];

export function getCommand(id: string): VoiceCommand | undefined {
  return COMMANDS.find((c) => c.id === id);
}

export function commandsForClass(classId: ClassId, includeCommon = true): VoiceCommand[] {
  return COMMANDS.filter((c) => c.classId === classId || (includeCommon && c.classId === 'common'));
}