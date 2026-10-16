import { CASTING, type PlayerState } from '@game/shared';

// In-game HUD overlay (DOM).
//   Mana  – the main bar, big, bottom-center, with the gold "perfect" zone.
//   Máu   – secondary, bottom-left.
//   Thể lực – thin bar under Máu (dimmed while stamina is unused).
// Casting feedback sits around the crosshair; a 2s subtitle shows what was said.

const SUBTITLE_MS = 2000;

const CSS = `
.hud { position: absolute; inset: 0; pointer-events: none; font-family: system-ui, sans-serif; color: #fff;
  text-shadow: 0 1px 3px #000; overflow: hidden; container-type: size; }
.hud-bar { position: relative; border-radius: 6px; background: rgba(8, 10, 18, 0.75); }
.hud-bar .clip { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; }
.hud-bar .fill, .hud-bar .ghost { position: absolute; inset: 0; transform-origin: left; }
.hud-bar .ghost { background: rgba(255,255,255,0.3); transition: transform 600ms ease-out 150ms; }
.hud-bar .label { position: absolute; left: 10px; right: 10px; top: 50%; transform: translateY(-50%);
  display: flex; justify-content: space-between; align-items: center; }

/* --- Mana: primary ------------------------------------------------------- */
.hud-mana-wrap { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); width: min(460px, 62%); }
.hud-mana-title { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;
  font: 800 14px system-ui; letter-spacing: 2px; color: #bfe3ff; }
.hud-bar.mana { height: 28px; border-radius: 999px; border: 2px solid rgba(140, 200, 255, 0.85);
  box-shadow: 0 0 12px rgba(80, 160, 255, 0.45), inset 0 0 8px rgba(0,0,0,0.6); }
.hud-bar.mana .fill { background: linear-gradient(#8ad4ff, #2f6fe0 55%, #1d3f9a); }
.hud-bar.mana .label { font: 800 14px system-ui; left: 16px; right: 18px; }
.hud-bar.mana .fill { border-radius: 999px; }
.hud-bar.mana.casting { animation: hud-glow 0.6s infinite alternate; }
@keyframes hud-glow { to { box-shadow: 0 0 22px rgba(120, 190, 255, 0.95), inset 0 0 8px rgba(0,0,0,0.6); } }
.hud-zone { position: absolute; top: 0; bottom: 0; right: 0; border-radius: 0 999px 999px 0; border-left: 2px dashed rgba(255, 215, 90, 0.9);
  background: repeating-linear-gradient(135deg, rgba(255,215,90,0.16) 0 8px, rgba(255,215,90,0.06) 8px 16px); }
.hud-zone .tag { position: absolute; right: 6px; top: -17px; font: 800 10px system-ui; letter-spacing: 1px; color: #ffd75a; }
.hud-zone.open { background: repeating-linear-gradient(135deg, rgba(255,215,90,0.38) 0 8px, rgba(255,215,90,0.18) 8px 16px);
  box-shadow: inset 0 0 12px rgba(255, 215, 90, 0.8); }
.hud-zone.missed { opacity: 0.35; }
.hud-mark { position: absolute; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%;
  border: 3px solid #fff6c8; background: rgba(30, 25, 10, 0.9); transition: all 120ms; z-index: 2; }
.hud-mark.open { background: #ffd75a; box-shadow: 0 0 12px #ffd75a; }
.hud-mark.missed { border-color: rgba(255,255,255,0.35); background: rgba(60,60,70,0.9); }
.hud-mark.hit { background: #ffd75a; border-color: #fff; box-shadow: 0 0 20px 6px #ffd75a; transform: scale(1.35); }

/* --- HP + stamina: secondary, bottom-left -------------------------------- */
.hud-side { position: absolute; left: 18px; bottom: 22px; width: 230px; }
.hud-bar.hp { height: 16px; border-radius: 999px; margin-top: 4px; border: 1px solid rgba(255, 140, 140, 0.6); font: 700 11px system-ui; }
.hud-bar.hp .fill { background: linear-gradient(#ff7a7a, #b5222b); }
.hud-bar.stamina { height: 8px; margin-top: 6px; border-radius: 999px; border: 1px solid rgba(200, 240, 120, 0.4); }
.hud-bar.stamina .fill { background: linear-gradient(#c8f07a, #5f9e2a); }
.hud-bar.stamina.unused { opacity: 0.45; }
.hud-bar.stamina.low .fill { background: linear-gradient(#ffb347, #c0392b); animation: hud-pulse 0.5s infinite alternate; }
.hud-stam-label { display: flex; justify-content: space-between; margin-top: 2px; font: 600 10px system-ui; opacity: 0.75; }
.hud-bar.flash { animation: hud-flash 0.45s; }
@keyframes hud-flash { 30% { border-color: #ff8080; box-shadow: 0 0 14px #ff5050; } }
@keyframes hud-pulse { to { opacity: 0.55; } }
.hud-tag { display: inline-block; padding: 2px 6px; border-radius: 3px; background: rgba(255, 210, 80, 0.85);
  color: #3a2800; text-shadow: none; font: 700 10px system-ui; }

/* --- Center feedback ------------------------------------------------------- */
.hud-listen { position: absolute; left: 50%; top: 57%; transform: translateX(-50%); text-align: center; white-space: nowrap; }
.hud-listen .rec { color: #ff6b6b; font: 700 15px system-ui; }
.hud-listen .live { font: 700 28px system-ui; min-height: 1.2em; }
.hud-listen .live:empty::before { content: '…'; opacity: 0.5; }
.hud-charged { position: absolute; left: 50%; top: 40%; transform: translateX(-50%); text-align: center; white-space: nowrap;
  font: 800 30px system-ui; text-transform: uppercase; letter-spacing: 1px; }
.hud-charged .sub { font: 600 13px system-ui; text-transform: none; letter-spacing: 0; opacity: 0.85; }
.hud-charged.emp { color: #ffd75a; }
.hud-flash { position: absolute; left: 50%; top: 30%; transform: translateX(-50%); white-space: nowrap;
  font: 800 32px system-ui; text-transform: uppercase; opacity: 0; transition: opacity 0.6s; }
.hud-flash.show { opacity: 1; transition: none; }
.hud-subtitle { position: absolute; left: 50%; bottom: 168px; transform: translateX(-50%); max-width: 80%;
  background: rgba(0,0,0,0.6); border-radius: 6px; padding: 6px 14px; text-align: center; font: 500 17px system-ui;
  opacity: 0; transition: opacity 0.4s; white-space: nowrap; }
.hud-subtitle.show { opacity: 1; transition: none; }
.hud-subtitle .ok { color: #7dff9a; font-weight: 700; }
.hud-subtitle .no { color: #ff8a8a; }

/* Phones (body.touch): mana goes top-center, clear of the touch buttons; HP/stamina stay bottom-left. */
.touch .hud-mana-wrap { top: 8px; bottom: auto; width: min(380px, 52%); }
.touch .hud-side { width: 180px; }
.touch .hud-subtitle { bottom: 120px; font-size: 14px; }
.touch .hud-listen .live { font-size: 18px; }
.touch .hud-flash { font-size: 22px; top: 26%; }

/* Narrow view: HP/stamina move up so they never overlap the centered mana bar (keep last: overrides above). */
@container (max-width: 1000px) {
  :not(.touch) > .hud .hud-side { bottom: 150px; }
  :not(.touch) > .hud .hud-subtitle { bottom: 215px; }
}
`;

export class Hud {
  private el: Record<string, HTMLElement> = {};
  private flashTimer = 0;
  private subTimer = 0;
  private markHit = false;
  private markHitUntil = 0;

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
    const zoneWidth = (1 - state.empowerMark) * 100;
    root.innerHTML = `
      <div class="hud-mana-wrap">
        <div class="hud-mana-title"><span>MANA</span></div>
        <div class="hud-bar mana"><div class="clip"><div class="ghost"></div><div class="fill"></div></div>
          <div class="hud-zone" style="width:${zoneWidth}%"><span class="tag">PERFECT ✦</span></div>
          <div class="hud-mark" style="left:${state.empowerMark * 100}%"></div>
          <div class="label"><span></span><span class="val"></span></div></div>
      </div>
      <div class="hud-side">
        <span class="hud-tag">BẤT TỬ</span>
        ${bar('hp', '❤ Máu')}
        <div class="hud-bar stamina"><div class="clip"><div class="ghost"></div><div class="fill"></div></div></div>
        <div class="hud-stam-label"><span>Thể lực</span><span class="val-stam"></span></div>
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
    }
    this.el.hpVal = q('.hp .val');
    this.el.manaVal = q('.mana .val');
    this.el.staminaVal = q('.val-stam');
    this.el.mark = q('.hud-mark');
    this.el.zone = q('.hud-zone');
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
    set('stamina', s.stamina, s.maxStamina, CASTING.staminaEnabled ? `${Math.floor(s.stamina)}` : 'chưa dùng');
    this.el.tag!.style.display = s.invincible ? '' : 'none';
    this.el.staminaBar!.classList.toggle('unused', !CASTING.staminaEnabled);
    this.el.staminaBar!.classList.toggle('low', s.staminaLow && (s.phase === 'charged' || s.sprinting || s.stamina === 0));

    // Perfect zone + marker: gold while a recognition now would be empowered, grey once passed.
    const channeling = s.phase === 'channeling';
    const hit = this.markHit || performance.now() < this.markHitUntil;
    const open = !hit && channeling && s.empowerWindowOpen;
    const missed = !hit && channeling && !s.empowerWindowOpen;
    this.el.mark!.classList.toggle('hit', hit);
    this.el.mark!.classList.toggle('open', open);
    this.el.mark!.classList.toggle('missed', missed);
    this.el.zone!.classList.toggle('open', open || hit);
    this.el.zone!.classList.toggle('missed', missed);
    this.el.manaBar!.classList.toggle('casting', channeling || s.phase === 'resolving');
    if (s.phase === 'idle') this.markHit = false;
  }

  setListening(on: boolean, live = ''): void {
    this.el.listen!.hidden = !on;
    this.el.live!.textContent = live;
  }

  /** Name of the spell held in hand (null hides it). Used when CASTING.autoCast is off. */
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

  /** Briefly lights up the perfect marker (an empowered spell was cast). */
  pulsePerfect(): void {
    this.markHitUntil = performance.now() + 700;
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
