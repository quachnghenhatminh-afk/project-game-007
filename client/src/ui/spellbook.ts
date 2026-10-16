import { commandsForClass } from '@game/shared';
import { SLOT_COUNT, type Loadout } from '../game/loadout.ts';
import { CHIP_CSS, WEAPONS, spellChip, weaponChip } from './spellIcons.ts';

// Spellbook & equipment panel (key J / 📖 button on phones). Drag-and-drop with
// pointer events so it works with mouse and touch:
//   spell card → slot 1–7          assign (a spell already in another slot swaps over)
//   slot → slot                    swap
//   slot → anywhere else           clear the slot
//   wand card → weapon slot        equip; weapon slot → anywhere else: unequip
// A click (no drag) on a slot makes it the active spell.

const CSS = `
.sb { position: fixed; inset: 0; z-index: 35; display: flex; align-items: center; justify-content: center;
  background: rgba(3,6,15,0.6); font-family: system-ui, sans-serif; color: #fff; touch-action: none; user-select: none; -webkit-user-select: none; }
.sb[hidden] { display: none; }
.sb-card { width: min(640px, 94vw); max-height: 94vh; overflow: auto; background: linear-gradient(#20263a, #161a28);
  border: 1px solid rgba(255,255,255,0.15); border-radius: 14px; padding: 14px 16px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); }
.sb-head { display: flex; justify-content: space-between; align-items: center; }
.sb-head h2 { margin: 0; font-size: 18px; color: #ffe6a8; }
.sb-close { border: 0; border-radius: 999px; padding: 6px 14px; font: 700 13px system-ui; cursor: pointer; background: rgba(255,255,255,0.12); color: #fff; }
.sb h3 { margin: 12px 0 6px; font-size: 12px; font-weight: 600; color: #9fb3d1; text-transform: uppercase; letter-spacing: 1px; }
.sb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 8px; }
.sb-item { display: flex; flex-direction: column; align-items: center; padding: 8px 4px 6px; border-radius: 10px; cursor: grab;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); touch-action: none; }
.sb-item:hover { background: rgba(255,255,255,0.12); }
.sb-item.in-use { opacity: 0.5; }
.sb-bar { display: flex; gap: 6px; align-items: flex-end; flex-wrap: wrap; justify-content: center; padding: 8px;
  border-radius: 12px; background: rgba(0,0,0,0.3); }
.sb-slot { position: relative; width: 62px; height: 62px; border-radius: 10px; display: flex; flex-direction: column; align-items: center;
  justify-content: center; background: rgba(255,255,255,0.05); border: 2px dashed rgba(255,255,255,0.25); cursor: grab; touch-action: none; }
.sb-slot.filled { border-style: solid; border-color: rgba(255,255,255,0.35); }
.sb-slot.active { border-color: #ffd75a; box-shadow: 0 0 10px rgba(255,215,90,0.6); }
.sb-slot.weapon { width: 70px; height: 70px; border-color: rgba(201,162,74,0.7); margin-right: 10px; }
.sb-slot .key { position: absolute; left: 4px; top: 2px; font: 800 11px system-ui; opacity: 0.7; }
.sb-slot.over { background: rgba(79,195,247,0.25); border-color: #4fc3f7; }
.sb-hint { font-size: 12px; color: #9fb3d1; line-height: 1.6; margin-top: 10px; }
.sb-hint b { color: #ffd75a; }
.sb-ghost { position: fixed; z-index: 50; pointer-events: none; transform: translate(-50%, -50%) scale(1.08); opacity: 0.9;
  display: flex; flex-direction: column; align-items: center; padding: 6px; border-radius: 10px; background: rgba(30,40,70,0.9);
  border: 1px solid #4fc3f7; color: #fff; }
${CHIP_CSS}
`;

type Payload = { kind: 'spell'; id: string } | { kind: 'slot'; index: number } | { kind: 'weapon' } | { kind: 'weaponslot' };

export class Spellbook {
  onToggle: (open: boolean) => void = () => {};
  private root: HTMLElement;
  private bar: HTMLElement;
  private grid: HTMLElement;
  private weapons: HTMLElement;

  constructor(private loadout: Loadout) {
    if (!document.getElementById('sb-style')) {
      const style = document.createElement('style');
      style.id = 'sb-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = document.createElement('div');
    this.root.className = 'sb';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="sb-card">
        <div class="sb-head"><h2>📖 Sách phép & Trang bị</h2><button class="sb-close">Đóng (J)</button></div>
        <h3>Thần chú — kéo vào ô 1–7</h3><div class="sb-grid spells"></div>
        <h3>Vũ khí — kéo vào ô vũ khí</h3><div class="sb-grid weapons"></div>
        <h3>Ô trang bị</h3><div class="sb-bar"></div>
        <div class="sb-hint">
          Không dùng giọng nói: <b>giữ chuột phải</b> để tụ phép rồi <b>thả ra</b> để niệm phép ở ô đang chọn (viền vàng).
          Thả khi mana còn trong vùng PERFECT → phép cường hóa ✦.<br />
          Chọn ô: <b>phím 1–7</b> hoặc <b>lăn chuột</b> · Kéo một ô ra ngoài để bỏ trống · Bấm vào ô để chọn.
        </div></div>`;
    document.body.appendChild(this.root);
    this.grid = this.root.querySelector<HTMLElement>('.spells')!;
    this.weapons = this.root.querySelector<HTMLElement>('.weapons')!;
    this.bar = this.root.querySelector<HTMLElement>('.sb-bar')!;
    this.root.querySelector('.sb-close')!.addEventListener('click', () => this.close());
    this.root.addEventListener('pointerdown', (e) => this.startDrag(e));
    loadout.onChange(() => this.render());
    this.render();
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.render();
    this.root.hidden = false;
    this.onToggle(true);
  }

  close(): void {
    this.root.hidden = true;
    this.onToggle(false);
  }

  private render(): void {
    const L = this.loadout;
    this.grid.innerHTML = commandsForClass('mage', false)
      .map((c) => `<div class="sb-item${L.slots.includes(c.id) ? ' in-use' : ''}" data-drag="spell:${c.id}">${spellChip(c.id)}</div>`)
      .join('');
    this.weapons.innerHTML = (Object.keys(WEAPONS) as Array<keyof typeof WEAPONS>)
      .map((w) => `<div class="sb-item${L.weapon === w ? ' in-use' : ''}" data-drag="weapon:${w}">${weaponChip(w)}</div>`)
      .join('');
    let html = `<div class="sb-slot weapon${L.weapon ? ' filled' : ''}" data-drop="weaponslot" ${L.weapon ? 'data-drag="weaponslot"' : ''}>${weaponChip(L.weapon)}</div>`;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const id = L.slots[i] ?? null;
      html += `<div class="sb-slot${id ? ' filled' : ''}${i === L.active ? ' active' : ''}" data-drop="slot:${i}" ${id ? `data-drag="slot:${i}"` : ''}>
        <span class="key">${i + 1}</span>${spellChip(id)}</div>`;
    }
    this.bar.innerHTML = html;
  }

  private startDrag(e: PointerEvent): void {
    const src = (e.target as HTMLElement).closest<HTMLElement>('[data-drag]');
    if (!src) return;
    e.preventDefault();
    const payload = parsePayload(src.dataset.drag!);
    if (!payload) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let ghost: HTMLElement | null = null;
    let over: HTMLElement | null = null;

    const move = (ev: PointerEvent) => {
      if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) {
        ghost = document.createElement('div');
        ghost.className = 'sb-ghost';
        ghost.innerHTML = src.innerHTML;
        document.body.appendChild(ghost);
      }
      if (!ghost) return;
      ghost.style.left = `${ev.clientX}px`;
      ghost.style.top = `${ev.clientY}px`;
      const target = dropTargetAt(ev.clientX, ev.clientY);
      if (target !== over) {
        over?.classList.remove('over');
        over = target;
        over?.classList.add('over');
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      over?.classList.remove('over');
      if (!ghost) {
        // A click, not a drag: clicking a slot makes it active.
        if (payload.kind === 'slot') this.loadout.select(payload.index);
        return;
      }
      ghost.remove();
      this.drop(payload, dropTargetAt(ev.clientX, ev.clientY)?.dataset.drop ?? null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  private drop(p: Payload, target: string | null): void {
    const L = this.loadout;
    const slot = target?.startsWith('slot:') ? Number(target.slice(5)) : -1;
    if (p.kind === 'spell' && slot >= 0) L.assign(slot, p.id);
    else if (p.kind === 'slot' && slot >= 0 && slot !== p.index) L.swap(p.index, slot);
    else if (p.kind === 'slot' && slot < 0) L.assign(p.index, null); // dragged out → clear
    else if (p.kind === 'weapon' && target === 'weaponslot') L.setWeapon('wand');
    else if (p.kind === 'weaponslot' && target !== 'weaponslot') L.setWeapon(null); // dragged out → unequip
  }
}

function parsePayload(s: string): Payload | null {
  if (s.startsWith('spell:')) return { kind: 'spell', id: s.slice(6) };
  if (s.startsWith('slot:')) return { kind: 'slot', index: Number(s.slice(5)) };
  if (s.startsWith('weapon:')) return { kind: 'weapon' };
  if (s === 'weaponslot') return { kind: 'weaponslot' };
  return null;
}

function dropTargetAt(x: number, y: number): HTMLElement | null {
  return (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-drop]') ?? null;
}
