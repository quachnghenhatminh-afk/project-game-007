import type { PlayerState } from '@game/shared';

// In-game HUD overlay (DOM). Bars bottom-left; casting feedback around the crosshair;
// a short subtitle at the bottom showing what the player just said.

const SUBTITLE_MS = 2000;

const CSS = `
.hud { position: absolute; inset: 0; pointer-events: none; font-family: system-ui, sans-serif; color: #fff;
  text-shadow: 0 1px 3px #000; overflow: hidden; }
.hud-bars { position: absolute; left: 16px; bottom: 16px; width: 270px; font: 600 12px/1 system-ui, sans-serif; }
.hud-bar { position: relative; height: 18px; margin-top: 7px; border-radius: 4px;
  background: rgba(10, 12, 20, 0.7); border: 1px solid rgba(255, 255, 255, 0.25); }
.hud-bar .clip { position: absolute; inset: 0; border-radius: 3px; overflow: hidden; }
.hud-bar .fill { position: absolute; inset: 0; transform-origin: left; }
.hud-bar .ghost { position: absolute; inset: 0; transform-origin: left; background: rgba(255,255,255,0.35);
  transition: transform 600ms ease-out 150ms; }
.hud-bar.hp .fill { background: linear-gradient(#ff6b6b, #b5222b); }
.hud-bar.mana .fill { background: linear-gradient(#6fc3ff, #2754c9); }
.hud-bar.stamina .fill { background: linear-gradient(#c8f07a, #5f9e2a); }
.hud-bar.stamina.low .fill { background: linear-gradient(#ffb347, #c0392b); animation: hud-pulse 0.5s infinite alternate; }
.hud-bar .label { position: absolute; left: 8px; right: 8px; top: 3px; display: flex; justify-content: space-between; }
.hud-bar.flash { animation: hud-flash 0.45s; }
@keyframes hud-flash { 30% { border-color: #ff8080; box-shadow: 0 0 12px #ff5050; } }
@keyframes hud-pulse { to { opacity: 0.55; } }
.hud-mark { position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.85); background: rgba(20,25,40,0.9); transition: all 120ms; }
.hud-mark.open { background: #ffd75a; border-color: #fff6c8; box-shadow: 0 0 10px #ffd75a; }
.hud-mark.missed { border-color: rgba(255,255,255,0.3); background: rgba(60,60,70,0.9); }
.hud-mark.hit { background: #ffd75a; border-color: #fff; box-shadow: 0 0 16px 4px #ffd75a; transform: scale(1.3); }
.hud-tag { display: inline-block; padding: 2px 6px; border-radius: 3px; background: rgba(255, 210, 80, 0.85);
  color: #3a2800; text-shadow: none; font-size: 11px; }
.hud-listen { position: absolute; left: 50%; top: 57%; transform: translateX(-50%); text-align: center; white-space: nowrap; }
.hud-listen .rec { color: #ff6b6b; font: 700 15px system-ui; }
.hud-listen .live { font: 700 28px system-ui; min-height: 1.2em; }
.hud-listen .live:empty::before { content: '…'; opacity: 0.5; }
.hud-charged { position: absolute; left: 50%; top: 40%; transform: translateX(-50%); text-align: center; white-space: nowrap;
  font: 800 30px system-ui; text-transform: uppercase; letter-spacing: 1px; }
.hud-charged .sub { font: 600 13px system-ui; text-transform: none; letter-spacing: 0; opacity: 0.85; }
.hud-charged.emp { color: #ffd75a; }
.hud-flash { position: absolute; left: 50%; top: 30%; transform: translateX(-50%); white-space: nowrap;
  font: 800 32px system-ui; opacity: 0; transition: opacity 0.6s; }
.hud-flash.show { opacity: 1; transition: none; }
.hud-subtitle { position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%); max-width: 80%;
  background: rgba(0,0,0,0.6); border-radius: 6px; padding: 6px 14px; text-align: center; font: 500 17px system-ui;
  opacity: 0; transition: opacity 0.4s; white-space: nowrap; }
.hud-subtitle.show { opacity: 1; transition: none; }
.hud-subtitle .ok { color: #7dff9a; font-weight: 700; }
.hud-subtitle .no { color: #ff8a8a; }
`;

export class Hud {
  private el: Record<string, HTMLElement> = {};
  private flashTimer = 0;
  private subTimer = 0;
  private markHit = false;

  constructor(container: HTMLElement, private state: PlayerState) {
    if (!document.getElementById('hud-style')) {
      const style = document.createElement('style');
      style.id = 'hud-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const root = document.createElement('div');
    root.className = 'hud';
    const bar = (cls: string, label: string) =>
      `<div class="hud-bar ${cls}"><div class="clip"><div class="ghost"></div><div class="fill"></div></div>
        <div class="label"><span>${label}</span><span class="val"></span></div></div>`;
    root.innerHTML = `
      <div class="hud-bars">
        <span class="hud-tag">BẤT TỬ</span>
        ${bar('hp', 'Máu')}${bar('mana', 'Mana')}${bar('stamina', 'Thể lực')}
      </div>
      <div class="hud-listen" hidden><div class="rec">● Đang nghe…</div><div class="live"></div></div>
      <div class="hud-charged" hidden></div>
      <div class="hud-flash"></div>
      <div class="hud-subtitle"></div>`;
    container.appendChild(root);
    const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;
    for (const k of ['hp', 'mana', 'stamina']) {
      this.el[`${k}Bar`] = q(`.hud-bar.${k}`);
      this.el[`${k}Fill`] = q(`.${k} .fill`);
      this.el[`${k}Ghost`] = q(`.${k} .ghost`);
      this.el[`${k}Val`] = q(`.${k} .val`);
    }
    const mark = document.createElement('div');
    mark.className = 'hud-mark';
    mark.style.left = `${state.empowerMark * 100}%`;
    this.el.manaBar!.appendChild(mark);
    this.el.mark = mark;
    this.el.tag = q('.hud-tag');
    this.el.listen = q('.hud-listen');
    this.el.live = q('.hud-listen .live');
    this.el.charged = q('.hud-charged');
    this.el.flash = q('.hud-flash');
    this.el.subtitle = q('.hud-subtitle');
  }

  update(): void {
    const s = this.state;
    const set = (k: string, v: number, max: number, text: string) => {
      const t = `scaleX(${Math.max(0, v / max)})`;
      this.el[`${k}Fill`]!.style.transform = t;
      this.el[`${k}Ghost`]!.style.transform = t;
      this.el[`${k}Val`]!.textContent = text;
    };
    set('hp', s.hp, s.maxHp, `${Math.ceil(s.hp)} / ${s.maxHp}`);
    set('mana', s.mana, s.maxMana, `${Math.floor(s.mana)} / ${s.maxMana}`);
    set('stamina', s.stamina, s.maxStamina, `${Math.floor(s.stamina)} / ${s.maxStamina}`);
    this.el.tag!.style.display = s.invincible ? '' : 'none';
    this.el.staminaBar!.classList.toggle('low', s.staminaLow && (s.phase === 'charged' || s.sprinting || s.stamina === 0));

    // Empower marker: gold while a recognition now would be empowered, grey once passed.
    const mark = this.el.mark!;
    mark.classList.toggle('hit', this.markHit);
    mark.classList.toggle('open', !this.markHit && s.phase === 'channeling' && s.empowerWindowOpen);
    mark.classList.toggle('missed', !this.markHit && s.phase === 'channeling' && !s.empowerWindowOpen);
    if (s.phase === 'idle') this.markHit = false;
  }

  setListening(on: boolean, live = ''): void {
    this.el.listen!.hidden = !on;
    this.el.live!.textContent = live;
  }

  /** Name of the spell held in hand (null hides it). */
  setCharged(name: string | null, empowered = false): void {
    const el = this.el.charged!;
    el.hidden = name === null;
    if (name === null) return;
    el.classList.toggle('emp', empowered);
    el.innerHTML = `${escapeHtml(name)}${empowered ? ' ✦' : ''}<div class="sub">${
      empowered ? 'Cường hóa! · ' : ''
    }Thả chuột phải để thi triển</div>`;
    this.markHit = empowered;
  }

  flash(text: string, color = '#ffffff'): void {
    const el = this.el.flash!;
    el.textContent = text;
    el.style.color = color;
    el.classList.add('show');
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => el.classList.remove('show'), 900);
  }

  /** Shows what the player just said for 2 seconds, and which spell (if any) it matched. */
  subtitle(heard: string, matchedPhrase: string | null): void {
    const el = this.el.subtitle!;
    const said = heard ? `«${escapeHtml(heard)}»` : '<i>(không nghe thấy gì)</i>';
    const result = matchedPhrase
      ? ` → <span class="ok">${escapeHtml(matchedPhrase)}</span>`
      : ` → <span class="no">không khớp câu chú</span>`;
    el.innerHTML = said + result;
    el.classList.add('show');
    clearTimeout(this.subTimer);
    this.subTimer = window.setTimeout(() => el.classList.remove('show'), SUBTITLE_MS);
  }

  flashBar(which: 'mana' | 'stamina'): void {
    const bar = this.el[`${which}Bar`]!;
    bar.classList.remove('flash');
    void bar.offsetWidth;
    bar.classList.add('flash');
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}
