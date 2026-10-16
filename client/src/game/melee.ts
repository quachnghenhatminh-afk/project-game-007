import * as THREE from 'three';
import { MELEE, type PlayerState } from '@game/shared';
import type { FpArms } from '../render/fpArms.ts';
import type { Destructibles } from './destructibles.ts';
import type { SpellCaster } from './spellCaster.ts';
import type { SpellEffects } from './spellEffects.ts';
import { Sfx } from '../audio/sfx.ts';

// Left click: chop downwards with the wand. The hit lands mid-swing on the nearest
// destructible in front of the player. While the guardian spirit is active the giant's
// arm reaches much further and hits twice as hard.

export class MeleeAttack {
  /** Is a weapon equipped? Bare hands reach less far. */
  hasWeapon: () => boolean = () => true;
  private cooldown = 0;
  /** Seconds until the pending swing connects, or -1. */
  private pending = -1;
  private pendingHeavy = false;

  constructor(
    private state: PlayerState,
    private arms: FpArms,
    private effects: SpellEffects,
    private destructibles: Destructibles,
    private caster: SpellCaster,
    private camera: THREE.Camera,
  ) {}

  attack(): void {
    if (this.cooldown > 0) return;
    // Hands are busy while channeling a spell (the spirit blocks channeling anyway).
    if (this.state.phase !== 'idle') return;
    const heavy = this.state.spiritActive;
    if (!this.arms.swing(heavy)) return;
    this.cooldown = heavy ? MELEE.cooldownSec * 1.4 : MELEE.cooldownSec;
    this.pending = heavy ? 0.22 : 0.12; // the moment the wand comes down
    this.pendingHeavy = heavy;
    if (heavy) this.caster.spirit?.swing();
    Sfx.swing(heavy);
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.pending < 0) return;
    this.pending -= dt;
    if (this.pending > 0) return;
    this.pending = -1;
    const heavy = this.pendingHeavy;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const hit = this.destructibles.melee(
      this.camera.position,
      fwd,
      heavy ? MELEE.spiritRange : this.hasWeapon() ? MELEE.range : MELEE.range * 0.65,
      MELEE.arc,
      heavy ? 2 : 1,
    );
    if (hit) {
      this.effects.spark(hit, heavy);
      Sfx.hit();
    }
  }
}
