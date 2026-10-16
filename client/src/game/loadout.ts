import { commandsForClass, getCommand } from '@game/shared';

// What the player has equipped: 7 spell slots (keys 1–7), which slot is active
// (cast on release when voice is off), and the weapon in hand. Saved in localStorage.

export type WeaponId = 'wand';
export const SLOT_COUNT = 7;

const KEY = 'pg007-loadout';

interface Saved {
  slots: Array<string | null>;
  active: number;
  weapon: WeaponId | null;
}

export class Loadout {
  slots: Array<string | null>;
  /** Index 0..6 of the active slot. */
  active = 0;
  weapon: WeaponId | null = 'wand';
  private listeners: Array<() => void> = [];

  constructor() {
    const defaults = commandsForClass('mage', false).map((c) => c.id);
    this.slots = Array.from({ length: SLOT_COUNT }, (_, i) => defaults[i] ?? null);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as Saved;
        if (Array.isArray(s.slots) && s.slots.length === SLOT_COUNT) this.slots = s.slots.map((id) => (id && getCommand(id) ? id : null));
        if (Number.isInteger(s.active) && s.active >= 0 && s.active < SLOT_COUNT) this.active = s.active;
        this.weapon = s.weapon === 'wand' ? 'wand' : null;
      }
    } catch {
      // storage blocked or corrupt: keep defaults
    }
  }

  /** Spell in slot `n` (1-based, like the number keys). */
  spellAt(n: number): string | null {
    return this.slots[n - 1] ?? null;
  }

  get activeSpell(): string | null {
    return this.slots[this.active] ?? null;
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  select(index: number): void {
    this.active = ((index % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
    this.changed();
  }

  /** Puts a spell into a slot; if it was already in another slot, the two slots swap. */
  assign(index: number, spellId: string | null): void {
    const from = spellId ? this.slots.indexOf(spellId) : -1;
    if (from >= 0 && from !== index) this.slots[from] = this.slots[index] ?? null;
    this.slots[index] = spellId;
    this.changed();
  }

  swap(a: number, b: number): void {
    [this.slots[a], this.slots[b]] = [this.slots[b] ?? null, this.slots[a] ?? null];
    this.changed();
  }

  setWeapon(w: WeaponId | null): void {
    this.weapon = w;
    this.changed();
  }

  private changed(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ slots: this.slots, active: this.active, weapon: this.weapon } satisfies Saved));
    } catch {
      // ignore
    }
    for (const fn of this.listeners) fn();
  }
}
