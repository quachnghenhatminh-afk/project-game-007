import { describe, expect, it } from 'vitest';
import { CASTING } from './balance.ts';
import { PlayerState, type CastEvent, type CastingConfig } from './playerState.ts';

// Scenario simulations for the casting rules. Each test plays out a situation
// that can happen in a real match, step by step at 60 fps.

const DT = 1 / 60;
function run(p: PlayerState, seconds: number, sprint = false): CastEvent[] {
  const events: CastEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    p.update(DT, sprint);
    events.push(...p.drainEvents());
  }
  return events;
}
const types = (e: CastEvent[]) => e.map((x) => x.type);

/** The earlier design: spell held in hand until release, stamina drains. Kept tested for later. */
const HOLD: CastingConfig = {
  ...CASTING,
  autoCast: false,
  staminaEnabled: true,
  empowerThreshold: 0.7,
  manaRegenPerSec: 15,
  manaRegenDelaySec: 0.5,
};

describe('hold-to-cast mode (autoCast off, stamina on)', () => {
  it('1. fast, clear speech → empowered spell held in hand, fires on release', () => {
    const p = new PlayerState(HOLD);
    expect(p.startChannel()).toBe(true);
    run(p, 0.6); // spoke quickly: mana 100 → 85, still above the 70% mark
    expect(p.empowerWindowOpen).toBe(true);
    p.recognize('fireball');
    expect(p.phase).toBe('charged');
    expect(p.drainEvents()).toContainEqual({ type: 'charged', commandId: 'fireball', empowered: true });
    const manaAtCharge = p.mana;
    run(p, 1);
    expect(p.mana).toBeGreaterThan(manaAtCharge); // mana stopped draining and refills
    expect(p.stamina).toBeLessThan(100); // holding the spell costs stamina
    expect(p.release()).toBe('fired');
    expect(p.drainEvents()).toEqual([{ type: 'fired', commandId: 'fireball', empowered: true }]);
    expect(p.phase).toBe('idle');
  });

  it('2. slow speech: recognized after mana passes the 70% mark → normal spell', () => {
    const p = new PlayerState(HOLD);
    p.startChannel();
    run(p, 1.6); // 100 - 40 = 60%
    p.recognize('frost');
    expect(p.charged).toEqual({ commandId: 'frost', empowered: false });
  });

  it('3. nothing recognized: mana runs out → fizzle (no-mana), then mana refills', () => {
    const p = new PlayerState(HOLD);
    p.startChannel();
    const events = run(p, 5);
    expect(events).toContainEqual({ type: 'fizzle', reason: 'no-mana' });
    expect(p.phase).toBe('idle');
    run(p, 3);
    expect(p.mana).toBeGreaterThan(30);
  });

  it('4a. released while still speaking, recognizer then matches → fires immediately', () => {
    const p = new PlayerState(HOLD);
    p.startChannel();
    run(p, 0.5);
    expect(p.release()).toBe('awaiting');
    const manaAtRelease = p.mana;
    run(p, 0.2); // waiting for the final result: no more drain
    expect(p.mana).toBeGreaterThanOrEqual(manaAtRelease);
    p.recognize('lightning');
    expect(p.drainEvents()).toContainEqual({ type: 'fired', commandId: 'lightning', empowered: true });
  });

  it('4b. released, recognizer finds no command → fizzle (misheard)', () => {
    const p = new PlayerState(HOLD);
    p.startChannel();
    run(p, 0.5);
    p.release();
    p.resolveFailed();
    expect(p.drainEvents()).toContainEqual({ type: 'fizzle', reason: 'misheard' });
  });

  it('4c. released, recognizer never answers → times out as misheard', () => {
    const p = new PlayerState(HOLD);
    p.startChannel();
    run(p, 0.5);
    p.release();
    const events = run(p, HOLD.resolveTimeoutSec + 0.1);
    expect(events).toContainEqual({ type: 'fizzle', reason: 'misheard' });
    expect(p.phase).toBe('idle');
  });

  it('5. accidental click (very short) → cancelled silently, no fizzle', () => {
    const p = new PlayerState(HOLD);
    p.startChannel();
    run(p, 0.05);
    expect(p.release()).toBe('tap');
    const events = p.drainEvents();
    expect(types(events)).toContain('tap-cancelled');
    expect(types(events)).not.toContain('fizzle');
  });

  it('6. not enough mana to start → refused, nothing happens', () => {
    const p = new PlayerState(HOLD);
    p.mana = HOLD.minManaToChannel - 1;
    expect(p.startChannel()).toBe(false);
    expect(p.drainEvents()).toEqual([{ type: 'channel-refused', reason: 'no-mana' }]);
    expect(p.phase).toBe('idle');
  });

  it('7. holding a charged spell too long → stamina runs out → spell fizzles (exhausted)', () => {
    const p = new PlayerState(HOLD);
    p.startChannel();
    run(p, 0.3);
    p.recognize('meteor');
    p.drainEvents();
    run(p, 3);
    expect(p.staminaLow).toBe(false);
    run(p, 1); // ~80 stamina used after 4s
    expect(p.staminaLow).toBe(true); // warning before it is lost
    const events = run(p, 2);
    expect(events).toContainEqual({ type: 'fizzle', reason: 'exhausted' });
    expect(p.phase).toBe('idle');
    expect(p.release()).toBe('none'); // releasing afterwards does nothing
  });

  it('8. pressing again while busy is refused; a second recognition is ignored', () => {
    const p = new PlayerState(HOLD);
    p.startChannel();
    run(p, 0.3);
    p.recognize('fireball');
    expect(p.startChannel()).toBe(false);
    expect(p.recognize('frost')).toBe(false);
    expect(p.charged?.commandId).toBe('fireball');
  });

  it('9. focus lost / pointer unlocked mid-cast → cancelled', () => {
    const p = new PlayerState(HOLD);
    p.startChannel();
    run(p, 0.3);
    p.recognize('heal');
    p.drainEvents();
    p.cancel();
    expect(p.drainEvents()).toEqual([{ type: 'fizzle', reason: 'cancelled' }]);
    expect(p.charged).toBeNull();
  });

  it('10. recognition exactly at the 70% mark counts as empowered', () => {
    const p = new PlayerState(HOLD);
    p.startChannel();
    p.mana = p.maxMana * HOLD.empowerThreshold;
    p.recognize('fireball');
    expect(p.charged?.empowered).toBe(true);
  });

  it('11. starting a cast with less than 70% mana can never be empowered', () => {
    const p = new PlayerState(HOLD);
    p.mana = 60;
    p.startChannel();
    run(p, 0.1);
    p.recognize('fireball');
    expect(p.charged?.empowered).toBe(false);
  });

  it('12. sprinting drains stamina; at 0 sprint locks until stamina recovers to the unlock level', () => {
    const p = new PlayerState(HOLD);
    run(p, 7, true); // 100 / 15 per second ≈ 6.7s of sprinting
    expect(p.stamina).toBeLessThan(1);
    expect(p.canSprint).toBe(false);
    run(p, 1, true); // still holding shift: sprint stays locked while stamina refills
    expect(p.sprinting).toBe(false);
    expect(p.canSprint).toBe(false);
    run(p, 2);
    expect(p.canSprint).toBe(true);
  });

  it('13. sprinting while holding a spell drains stamina faster', () => {
    const a = new PlayerState(HOLD);
    const b = new PlayerState(HOLD);
    for (const p of [a, b]) {
      p.startChannel();
      p.recognize('fireball');
    }
    run(a, 1);
    run(b, 1, true);
    expect(b.stamina).toBeLessThan(a.stamina);
  });

  it('14. invincible player takes no damage', () => {
    const p = new PlayerState(HOLD);
    p.damage(50);
    expect(p.hp).toBe(p.maxHp);
  });
});

describe('auto-cast mode (current rules)', () => {
  it('A1. recognized in the perfect zone → fires at once, empowered; channel keeps going while held', () => {
    const p = new PlayerState();
    p.startChannel();
    run(p, 0.8);
    p.recognize('fireball');
    expect(p.drainEvents()).toContainEqual({ type: 'fired', commandId: 'fireball', empowered: true });
    expect(p.phase).toBe('channeling');
    const mana = p.mana;
    run(p, 0.4);
    expect(p.mana).toBeLessThan(mana); // still holding → mana keeps draining
  });

  it('A2. chain: a second spell while still holding; releasing then ends quietly', () => {
    const p = new PlayerState();
    p.startChannel();
    run(p, 0.5);
    p.recognize('fireball');
    run(p, 0.8);
    p.recognize('frost');
    expect(p.castsThisChannel).toBe(2);
    p.drainEvents();
    expect(p.release()).toBe('ended');
    expect(p.drainEvents()).toEqual([{ type: 'channel-end', reason: 'released' }]);
    expect(p.phase).toBe('idle');
  });

  it('A3. perfect zone is 30%…100% of the bar', () => {
    const p = new PlayerState();
    expect(p.empowerMark).toBe(0.3);
    p.startChannel();
    run(p, 2.6); // 100 - 65 = 35% → still perfect
    expect(p.empowerWindowOpen).toBe(true);
    run(p, 0.4); // 25%
    p.recognize('lightning');
    expect(p.drainEvents()).toContainEqual({ type: 'fired', commandId: 'lightning', empowered: false });
  });

  it('A4. mana runs out after a successful cast → quiet channel-end, no fizzle', () => {
    const p = new PlayerState();
    p.startChannel();
    run(p, 0.5);
    p.recognize('fireball');
    p.drainEvents();
    const events = run(p, 4);
    expect(events).toContainEqual({ type: 'channel-end', reason: 'no-mana' });
    expect(types(events)).not.toContain('fizzle');
  });

  it('A5. nothing recognized and mana runs out → fizzle (no-mana)', () => {
    const p = new PlayerState();
    p.startChannel();
    expect(run(p, 5)).toContainEqual({ type: 'fizzle', reason: 'no-mana' });
  });

  it('A6. released before any recognition, then recognized → fires', () => {
    const p = new PlayerState();
    p.startChannel();
    run(p, 0.5);
    expect(p.release()).toBe('awaiting');
    p.recognize('mage-shield');
    expect(p.drainEvents()).toContainEqual({ type: 'fired', commandId: 'mage-shield', empowered: true });
    expect(p.phase).toBe('idle');
  });

  it('A7. sprinting drains stamina; casting does not', () => {
    const p = new PlayerState();
    p.startChannel();
    run(p, 1);
    expect(p.stamina).toBe(p.maxStamina);
    run(p, 2, true);
    expect(p.stamina).toBeLessThan(p.maxStamina - 25);
  });

  it('A8. each jump costs stamina; jumping non-stop runs out and is refused', () => {
    const p = new PlayerState();
    let jumps = 0;
    for (let i = 0; i < 20; i++) {
      if (p.tryJump()) jumps++;
      run(p, 0.25); // jump again as soon as possible
    }
    expect(jumps).toBeLessThan(20);
    expect(p.drainEvents()).toEqual([]); // drained inside run()
    expect(p.tryJump()).toBe(p.stamina >= CASTING.staminaJumpCost);
  });

  it('A9. stamina refills after resting', () => {
    const p = new PlayerState();
    for (let i = 0; i < 5; i++) p.tryJump();
    run(p, 6);
    expect(p.stamina).toBe(p.maxStamina);
  });
});
