import { SLOT_COUNT, type Loadout } from '../game/loadout.ts';
import { CHIP_CSS, weaponChip, spellChip } from './spellIcons.ts';

// In-game slot bar above the mana bar: weapon slot + spell slots 1–7, active slot in gold.
// Display only (the pointer is locked while playing); editing happens in the Spellbook (J).

const CSS = `
.hb { position: absolute; left: 50%; bottom: 84px; transform: translateX(-50%); display: flex; gap: 5px; align-items: flex-end;
  pointer-events: none; font-family: system-ui, sans-serif; color: #fff; text-shadow: 0 1px 2px #000; }
.hb-slot { position: relative; width: 48px; height: 48px; border-radius: 9px; display: flex; flex-direction: column; align-items: center;
  justify-content: center; background: rgba(8,10,20,0.6); border: 1px solid rgba(255,255,255,0.25); }
.hb-slot .chip-glyph { width: 26px; height: 26px; font-size: 15px; }
.hb-slot .chip-name { font-size: 8px; max-width: 46px; overflow: hidden; text-overflow: ellipsis; }
.hb-slot .key { position: absolute; left: 3px; top: 1px; font: 800 10px system-ui; opacity: 0.75; }
.hb-slot.active { border: 2px solid #ffd75a; box-shadow: 0 0 10px rgba(255,215,90,0.7); transform: translateY(-4px); }
.hb-slot.weapon { width: 54px; height: 54px; margin-right: 8px; border-color: rgba(201,162,74,0.8); }
.hb-hint { position: absolute; left: 50%; bottom: 140px; transform: translateX(-50%); font: 600 11px system-ui; opacity: 0.75;
  white-space: nowrap; pointer-events: none; text-shadow: 0 1px 2px #000; color: #fff; }
.touch .hb, .touch .hb-hint { display: none; }
${CHIP_CSS}
`;

export class Hotbar {
  private el: HTMLElement;

  constructor(container: HTMLElement, private loadout: Loadout) {
    if (!document.getElementById('hb-style')) {
      const style = document.createElement('style');
      style.id = 'hb-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.el = document.createElement('div');
    this.el.className = 'hb';
    container.appendChild(this.el);
    const hint = document.createElement('div');
    hint.className = 'hb-hint';
    hint.textContent = 'J: sách phép · 1–7 / lăn chuột: chọn ô';
    container.appendChild(hint);
    loadout.onChange(() => this.render());
    this.render();
  }

  private render(): void {
    const L = this.loadout;
    let html = `<div class="hb-slot weapon">${weaponChip(L.weapon)}</div>`;
    for (let i = 0; i < SLOT_COUNT; i++) {
      html += `<div class="hb-slot${i === L.active ? ' active' : ''}"><span class="key">${i + 1}</span>${spellChip(L.slots[i] ?? null)}</div>`;
    }
    this.el.innerHTML = html;
  }
}
