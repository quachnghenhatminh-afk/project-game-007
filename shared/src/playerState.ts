import { CASTING, PLAYER } from './balance.ts';

// Player resources and the spellcasting state machine. Pure logic (no DOM, no
// rendering) so it can be unit-tested and later run on the server.
//
//   idle ──press──▶ channeling ──recognized──▶ charged ──release──▶ fired
//                     │  mana drains            stamina drains
//                     │  mana hits 0 → fizzle   stamina hits 0 → fizzle (exhausted)
//                     └─release──▶ resolving ──recognized──▶ fired
//                        (short tap → cancelled)  └─no match / timeout → fizzle (misheard)

export type CastPhase = 'idle' | 'channeling' | 'resolving' | 'charged';
export type FizzleReason = 'no-mana' | 'misheard' | 'exhausted' | 'cancelled';

export type CastEvent =
  | { type: 'channel-start' }
  | { type: 'channel-refused'; reason: 'no-mana' | 'busy' }
  | { type: 'charged'; commandId: string; empowered: boolean }
  | { type: 'awaiting-result' }
  | { type: 'fired'; commandId: string; empowered: boolean }
  | { type: 'fizzle'; reason: FizzleReason }
  | { type: 'tap-cancelled' };

export type ReleaseResult = 'fired' | 'awaiting' | 'tap' | 'none';

export class PlayerState {
  readonly maxHp = PLAYER.maxHp;
  readonly maxMana = PLAYER.maxMana;
  readonly maxStamina = PLAYER.maxStamina;
  hp: number = PLAYER.maxHp;
  mana: number = PLAYER.maxMana;
  stamina: number = PLAYER.maxStamina;
  invincible: boolean = PLAYER.invincible;

  phase: CastPhase = 'idle';
  charged: { commandId: string; empowered: boolean } | null = null;
  /** Seconds since the current channel started. */
  channelTime = 0;
  sprinting = false;

  private sprintLocked = false;
  private manaRegenWait = 0;
  private staminaRegenWait = 0;
  private resolveTime = 0;
  private events: CastEvent[] = [];

  /** Mana level (0..1) at which the empower marker sits. */
  get empowerMark(): number {
    return CASTING.empowerThreshold;
  }

  /** True while a recognition right now would give an empowered spell. */
  get empowerWindowOpen(): boolean {
    return this.mana >= this.maxMana * CASTING.empowerThreshold;
  }

  get canSprint(): boolean {
    return !this.sprintLocked && this.stamina > 0;
  }

  get staminaLow(): boolean {
    return this.stamina < this.maxStamina * CASTING.staminaLowWarning;
  }

  /** Returns and clears pending events (UI/effects react to these). */
  drainEvents(): CastEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Right mouse pressed. */
  startChannel(): boolean {
    if (this.phase !== 'idle') {
      this.emit({ type: 'channel-refused', reason: 'busy' });
      return false;
    }
    if (this.mana < CASTING.minManaToChannel) {
      this.emit({ type: 'channel-refused', reason: 'no-mana' });
      return false;
    }
    this.phase = 'channeling';
    this.channelTime = 0;
    this.emit({ type: 'channel-start' });
    return true;
  }

  /** A command was recognized (by voice or by fallback hotkey). Returns false if ignored. */
  recognize(commandId: string): boolean {
    if (this.phase !== 'channeling' && this.phase !== 'resolving') return false;
    const empowered = this.empowerWindowOpen;
    this.manaRegenWait = CASTING.manaRegenDelaySec;
    if (this.phase === 'resolving') {
      // Button was already released: cast right away.
      this.phase = 'idle';
      this.emit({ type: 'fired', commandId, empowered });
    } else {
      this.phase = 'charged';
      this.charged = { commandId, empowered };
      this.emit({ type: 'charged', commandId, empowered });
    }
    return true;
  }

  /** Right mouse released. */
  release(): ReleaseResult {
    if (this.phase === 'charged' && this.charged) {
      const c = this.charged;
      this.phase = 'idle';
      this.charged = null;
      this.staminaRegenWait = CASTING.staminaRegenDelaySec;
      this.emit({ type: 'fired', commandId: c.commandId, empowered: c.empowered });
      return 'fired';
    }
    if (this.phase === 'channeling') {
      this.manaRegenWait = CASTING.manaRegenDelaySec;
      if (this.channelTime < CASTING.tapCancelSec) {
        this.phase = 'idle';
        this.emit({ type: 'tap-cancelled' });
        return 'tap';
      }
      this.phase = 'resolving';
      this.resolveTime = 0;
      this.emit({ type: 'awaiting-result' });
      return 'awaiting';
    }
    return 'none';
  }

  /** The recognizer finished after release without a usable command. */
  resolveFailed(): void {
    if (this.phase !== 'resolving') return;
    this.phase = 'idle';
    this.emit({ type: 'fizzle', reason: 'misheard' });
  }

  /** Abort whatever is in progress (focus lost, pointer unlocked…). */
  cancel(): void {
    if (this.phase === 'idle') return;
    if (this.phase === 'charged') this.staminaRegenWait = CASTING.staminaRegenDelaySec;
    else this.manaRegenWait = CASTING.manaRegenDelaySec;
    this.phase = 'idle';
    this.charged = null;
    this.emit({ type: 'fizzle', reason: 'cancelled' });
  }

  damage(amount: number): void {
    if (this.invincible) return;
    this.hp = Math.max(0, this.hp - amount);
  }

  /** @param wantsSprint sprint key held while moving */
  update(dt: number, wantsSprint = false): void {
    // --- Casting ---
    if (this.phase === 'channeling') {
      this.channelTime += dt;
      this.mana -= CASTING.manaDrainPerSec * dt;
      if (this.mana <= 0) {
        this.mana = 0;
        this.phase = 'idle';
        this.manaRegenWait = CASTING.manaRegenDelaySec;
        this.emit({ type: 'fizzle', reason: 'no-mana' });
      }
    } else if (this.phase === 'resolving') {
      this.resolveTime += dt;
      if (this.resolveTime >= CASTING.resolveTimeoutSec) this.resolveFailed();
    }

    // --- Stamina drain ---
    this.sprinting = wantsSprint && this.canSprint;
    let staminaDrain = 0;
    if (this.phase === 'charged') staminaDrain += CASTING.staminaHoldDrainPerSec;
    if (this.sprinting) staminaDrain += CASTING.staminaSprintDrainPerSec;
    if (staminaDrain > 0) {
      this.stamina -= staminaDrain * dt;
      this.staminaRegenWait = CASTING.staminaRegenDelaySec;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.sprintLocked = true;
        this.sprinting = false;
        if (this.phase === 'charged') {
          this.phase = 'idle';
          this.charged = null;
          this.emit({ type: 'fizzle', reason: 'exhausted' });
        }
      }
    }

    // --- Regeneration ---
    if (this.phase !== 'channeling') {
      if (this.manaRegenWait > 0) this.manaRegenWait -= dt;
      else this.mana = Math.min(this.maxMana, this.mana + CASTING.manaRegenPerSec * dt);
    }
    if (staminaDrain === 0) {
      if (this.staminaRegenWait > 0) this.staminaRegenWait -= dt;
      else this.stamina = Math.min(this.maxStamina, this.stamina + CASTING.staminaRegenPerSec * dt);
    }
    if (this.sprintLocked && this.stamina >= CASTING.staminaSprintUnlock) this.sprintLocked = false;
  }

  private emit(e: CastEvent): void {
    this.events.push(e);
  }
}
