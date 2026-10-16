import { CASTING, PLAYER } from './balance.ts';

// Player resources and the spellcasting state machine. Pure logic (no DOM, no
// rendering) so it can be unit-tested and later run on the server.
//
//   idle ──press──▶ channeling ──recognized──▶ fired, keep channeling   (autoCast: true, current)
//                     │   ▲__________________________│  (say the next spell while still holding)
//                     │                     └─▶ charged ──release──▶ fired   (autoCast: false)
//                     │  mana drains            stamina drains (if staminaEnabled)
//                     │  mana hits 0 → fizzle (or a quiet channel-end if something was already cast)
//                     ├─release after ≥1 cast ──▶ idle (channel-end)
//                     └─release before any cast ──▶ resolving ──recognized──▶ fired
//                        (short tap → cancelled)    └─no match / timeout → fizzle (misheard)
//   Stamina (separate): sprinting drains it, each jump costs a chunk.

/** CASTING with literal types widened, so tests can override single values. */
export type CastingConfig = { [K in keyof typeof CASTING]: (typeof CASTING)[K] extends boolean ? boolean : number };

export type CastPhase = 'idle' | 'channeling' | 'resolving' | 'charged';
export type FizzleReason = 'no-mana' | 'misheard' | 'exhausted' | 'cancelled';

export type CastEvent =
  | { type: 'channel-start' }
  | { type: 'channel-refused'; reason: 'no-mana' | 'busy' | 'spirit' }
  | { type: 'charged'; commandId: string; empowered: boolean }
  | { type: 'awaiting-result' }
  | { type: 'fired'; commandId: string; empowered: boolean }
  | { type: 'fizzle'; reason: FizzleReason }
  | { type: 'tap-cancelled' }
  /** Channel ended after at least one successful cast (button released or mana ran out). */
  | { type: 'channel-end'; reason: 'released' | 'no-mana' }
  | { type: 'jump-refused' }
  /** Guardian spirit ("bảo hộ") began / ended. */
  | { type: 'spirit-start'; durationSec: number }
  | { type: 'spirit-end' };

export type ReleaseResult = 'fired' | 'awaiting' | 'tap' | 'ended' | 'none';

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
  /** Spells cast during the current channel (auto-cast chains). */
  castsThisChannel = 0;
  /** Seconds left of the guardian spirit; > 0 = lifted, no casting, melee only. */
  spiritTime = 0;
  sprinting = false;

  private sprintLocked = false;
  private manaRegenWait = 0;
  private staminaRegenWait = 0;
  private resolveTime = 0;
  private events: CastEvent[] = [];

  /** @param cfg casting rules; defaults to CASTING from balance.ts (tests pass overrides). */
  constructor(private cfg: CastingConfig = CASTING) {}

  /** Mana level (0..1) at which the empower marker sits. */
  get empowerMark(): number {
    return this.cfg.empowerThreshold;
  }

  /** True while a recognition right now would give an empowered spell. */
  get empowerWindowOpen(): boolean {
    return this.mana >= this.maxMana * this.cfg.empowerThreshold;
  }

  get canSprint(): boolean {
    return !this.cfg.staminaEnabled || (!this.sprintLocked && this.stamina > 0);
  }

  get staminaLow(): boolean {
    return this.stamina < this.maxStamina * this.cfg.staminaLowWarning;
  }

  /** Returns and clears pending events (UI/effects react to these). */
  drainEvents(): CastEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  get spiritActive(): boolean {
    return this.spiritTime > 0;
  }

  /** Starts the guardian spirit; ends any channel in progress (casting is blocked while it lasts). */
  startSpirit(durationSec: number): void {
    if (this.phase === 'channeling' || this.phase === 'resolving') {
      this.phase = 'idle';
      this.manaRegenWait = this.cfg.manaRegenDelaySec;
      this.emit({ type: 'channel-end', reason: 'released' });
    }
    this.spiritTime = durationSec;
    this.emit({ type: 'spirit-start', durationSec });
  }

  /** Right mouse pressed. */
  startChannel(): boolean {
    if (this.spiritActive) {
      this.emit({ type: 'channel-refused', reason: 'spirit' });
      return false;
    }
    if (this.phase !== 'idle') {
      this.emit({ type: 'channel-refused', reason: 'busy' });
      return false;
    }
    if (this.mana < this.cfg.minManaToChannel) {
      this.emit({ type: 'channel-refused', reason: 'no-mana' });
      return false;
    }
    this.phase = 'channeling';
    this.channelTime = 0;
    this.castsThisChannel = 0;
    this.emit({ type: 'channel-start' });
    return true;
  }

  /** Space pressed: spends stamina; returns false (no jump) if there is not enough. */
  tryJump(): boolean {
    if (!this.cfg.staminaEnabled) return true;
    if (this.stamina < this.cfg.staminaJumpCost) {
      this.emit({ type: 'jump-refused' });
      return false;
    }
    this.stamina -= this.cfg.staminaJumpCost;
    this.staminaRegenWait = this.cfg.staminaRegenDelaySec;
    return true;
  }

  /** A command was recognized (by voice or by fallback hotkey). Returns false if ignored. */
  recognize(commandId: string): boolean {
    if (this.phase !== 'channeling' && this.phase !== 'resolving') return false;
    const empowered = this.empowerWindowOpen;
    this.manaRegenWait = this.cfg.manaRegenDelaySec;
    if (this.phase === 'resolving') {
      // The button was already released: cast right away and finish.
      this.phase = 'idle';
      this.emit({ type: 'fired', commandId, empowered });
    } else if (this.cfg.autoCast) {
      // Cast right away; the channel goes on while the button is held (mana keeps draining).
      this.castsThisChannel++;
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
      this.staminaRegenWait = this.cfg.staminaRegenDelaySec;
      this.emit({ type: 'fired', commandId: c.commandId, empowered: c.empowered });
      return 'fired';
    }
    if (this.phase === 'channeling') {
      this.manaRegenWait = this.cfg.manaRegenDelaySec;
      if (this.castsThisChannel > 0) {
        // Already cast something this channel: just stop, nothing pending.
        this.phase = 'idle';
        this.emit({ type: 'channel-end', reason: 'released' });
        return 'ended';
      }
      if (this.channelTime < this.cfg.tapCancelSec) {
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
    if (this.phase === 'charged') this.staminaRegenWait = this.cfg.staminaRegenDelaySec;
    else this.manaRegenWait = this.cfg.manaRegenDelaySec;
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
    if (this.spiritTime > 0) {
      this.spiritTime = Math.max(0, this.spiritTime - dt);
      if (this.spiritTime === 0) this.emit({ type: 'spirit-end' });
    }
    // --- Casting ---
    if (this.phase === 'channeling') {
      this.channelTime += dt;
      this.mana -= this.cfg.manaDrainPerSec * dt;
      if (this.mana <= 0) {
        this.mana = 0;
        this.phase = 'idle';
        this.manaRegenWait = this.cfg.manaRegenDelaySec;
        if (this.castsThisChannel > 0) this.emit({ type: 'channel-end', reason: 'no-mana' });
        else this.emit({ type: 'fizzle', reason: 'no-mana' });
      }
    } else if (this.phase === 'resolving') {
      this.resolveTime += dt;
      if (this.resolveTime >= this.cfg.resolveTimeoutSec) this.resolveFailed();
    }

    // --- Stamina drain ---
    this.sprinting = wantsSprint && this.canSprint;
    let staminaDrain = 0;
    if (this.cfg.staminaEnabled) {
      if (this.phase === 'charged') staminaDrain += this.cfg.staminaHoldDrainPerSec;
      if (this.sprinting) staminaDrain += this.cfg.staminaSprintDrainPerSec;
    }
    if (staminaDrain > 0) {
      this.stamina -= staminaDrain * dt;
      this.staminaRegenWait = this.cfg.staminaRegenDelaySec;
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
      else this.mana = Math.min(this.maxMana, this.mana + this.cfg.manaRegenPerSec * dt);
    }
    if (staminaDrain === 0) {
      if (this.staminaRegenWait > 0) this.staminaRegenWait -= dt; // also set by jumps
      else this.stamina = Math.min(this.maxStamina, this.stamina + this.cfg.staminaRegenPerSec * dt);
    }
    if (this.sprintLocked && this.stamina >= this.cfg.staminaSprintUnlock) this.sprintLocked = false;
  }

  private emit(e: CastEvent): void {
    this.events.push(e);
  }
}
