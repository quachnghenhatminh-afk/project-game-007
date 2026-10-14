import type { PlayerStats } from '../game/playerStats.ts';

// HP + mana bars in the bottom-left corner of the game view.

const CSS = `
.hud-bars { position: absolute; left: 16px; bottom: 16px; width: 260px; pointer-events: none;
  font: 600 12px/1 system-ui, sans-serif; color: #fff; text-shadow: 0 1px 2px #000; }
.hud-bar { position: relative; height: 18px; margin-top: 6px; border-radius: 4px; overflow: hidden;
  background: rgba(10, 12, 20, 0.7); border: 1px solid rgba(255, 255, 255, 0.25); }
.hud-bar .fill { position: absolute; inset: 0; transform-origin: left; transition: transform 120ms linear; }
.hud-bar .ghost { position: absolute; inset: 0; transform-origin: left; background: rgba(255,255,255,0.35);
  transition: transform 600ms ease-out 150ms; }
.hud-bar.hp .fill { background: linear-gradient(#ff6b6b, #b5222b); }
.hud-bar.mana .fill { background: linear-gradient(#6fc3ff, #2754c9); }
.hud-bar .label { position: absolute; left: 8px; right: 8px; top: 3px; display: flex; justify-content: space-between; }
.hud-bar.flash { animation: hud-flash 0.4s; }
@keyframes hud-flash { 0%, 100% { border-color: rgba(255,255,255,0.25); } 30% { border-color: #8fd0ff; box-shadow: 0 0 10px #4aa8ff; } }
.hud-tag { display: inline-block; padding: 2px 6px; border-radius: 3px; background: rgba(255, 210, 80, 0.85);
  color: #3a2800; text-shadow: none; font-size: 11px; }
`;

export class Hud {
  private hpFill: HTMLElement;
  private hpGhost: HTMLElement;
  private hpText: HTMLElement;
  private manaFill: HTMLElement;
  private manaGhost: HTMLElement;
  private manaText: HTMLElement;
  private manaBar: HTMLElement;
  private tag: HTMLElement;

  constructor(container: HTMLElement, private stats: PlayerStats) {
    if (!document.getElementById('hud-style')) {
      const style = document.createElement('style');
      style.id = 'hud-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const root = document.createElement('div');
    root.className = 'hud-bars';
    root.innerHTML = `
      <span class="hud-tag">BẤT TỬ</span>
      <div class="hud-bar hp"><div class="ghost"></div><div class="fill"></div>
        <div class="label"><span>Máu</span><span class="val"></span></div></div>
      <div class="hud-bar mana"><div class="ghost"></div><div class="fill"></div>
        <div class="label"><span>Mana</span><span class="val"></span></div></div>`;
    container.appendChild(root);
    const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;
    this.hpFill = q('.hp .fill');
    this.hpGhost = q('.hp .ghost');
    this.hpText = q('.hp .val');
    this.manaFill = q('.mana .fill');
    this.manaGhost = q('.mana .ghost');
    this.manaText = q('.mana .val');
    this.manaBar = q('.hud-bar.mana');
    this.tag = q('.hud-tag');
  }

  update(): void {
    const s = this.stats;
    const hp = s.hp / s.maxHp;
    const mana = s.mana / s.maxMana;
    this.hpFill.style.transform = this.hpGhost.style.transform = `scaleX(${hp})`;
    this.manaFill.style.transform = this.manaGhost.style.transform = `scaleX(${mana})`;
    this.hpText.textContent = `${Math.ceil(s.hp)} / ${s.maxHp}`;
    this.manaText.textContent = `${Math.floor(s.mana)} / ${s.maxMana}`;
    this.tag.style.display = s.invincible ? '' : 'none';
  }

  /** Blink the mana bar (e.g. "not enough mana"). */
  flashMana(): void {
    this.manaBar.classList.remove('flash');
    void this.manaBar.offsetWidth;
    this.manaBar.classList.add('flash');
  }
}
