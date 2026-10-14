import { PLAYER } from '@game/shared';

// Local HP/mana for the prototype. In Phase 2 the server owns these values.

export class PlayerStats {
  hp: number = PLAYER.maxHp;
  mana: number = PLAYER.maxMana;
  readonly maxHp = PLAYER.maxHp;
  readonly maxMana = PLAYER.maxMana;
  invincible: boolean = PLAYER.invincible;

  update(dt: number): void {
    this.mana = Math.min(this.maxMana, this.mana + PLAYER.manaRegenPerSec * dt);
  }

  /** Spends mana if there is enough; returns false (and spends nothing) otherwise. */
  trySpendMana(cost: number): boolean {
    if (this.mana < cost) return false;
    this.mana -= cost;
    return true;
  }

  damage(amount: number): void {
    if (this.invincible) return;
    this.hp = Math.max(0, this.hp - amount);
  }
}
