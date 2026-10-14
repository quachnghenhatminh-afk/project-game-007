import { commandsForClass } from '@game/shared';
import type { FpsController } from './fpsController.ts';
import type { SpellCaster } from '../game/spellCaster.ts';

// On-screen controls for phones/tablets:
//   left half  – floating joystick (push to the edge = run)
//   right half – drag to look
//   NIỆM       – hold to channel (same as right mouse), speak the spell
//   ⤒          – jump
//   1–5        – spell buttons: tap while holding NIỆM, or tap alone to cast at once

const CSS = `
.tc { position: absolute; inset: 0; z-index: 5; touch-action: none; user-select: none; -webkit-user-select: none; }
.tc-left { position: absolute; left: 0; top: 0; bottom: 0; width: 45%; touch-action: none; }
.tc-right { position: absolute; right: 0; top: 0; bottom: 0; width: 55%; touch-action: none; }
.tc-stick { position: absolute; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.45); background: rgba(10,15,30,0.25); display: none; pointer-events: none; }
.tc-knob { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%;
  background: rgba(255,255,255,0.55); }
.tc-stick.run { border-color: #c8f07a; }
.tc-stick.run .tc-knob { background: rgba(200,240,122,0.85); }
.tc-btn { position: absolute; border-radius: 50%; border: 2px solid rgba(255,255,255,0.6); background: rgba(15,25,50,0.55);
  color: #fff; font: 800 14px system-ui; display: flex; align-items: center; justify-content: center; touch-action: none;
  text-shadow: 0 1px 2px #000; -webkit-tap-highlight-color: transparent; }
.tc-btn.down { background: rgba(90,160,255,0.65); border-color: #bfe3ff; }
.tc-cast { right: 16px; bottom: 16px; width: 84px; height: 84px; font-size: 15px; border-color: #8cc8ff;
  box-shadow: 0 0 14px rgba(80,160,255,0.6); }
.tc-jump { right: 236px; bottom: 16px; width: 58px; height: 58px; font-size: 24px; }
.tc-spell { width: 46px; height: 46px; font-size: 9px; line-height: 1.05; text-align: center; padding: 2px; box-sizing: border-box; flex-direction: column; }
.tc-spell b { display: block; font-size: 14px; }
`;

export class TouchControls {
  constructor(container: HTMLElement, player: FpsController, caster: SpellCaster) {
    if (!document.getElementById('tc-style')) {
      const style = document.createElement('style');
      style.id = 'tc-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const root = document.createElement('div');
    root.className = 'tc';
    root.innerHTML = `<div class="tc-left"></div><div class="tc-right"></div>
      <div class="tc-stick"><div class="tc-knob"></div></div>
      <div class="tc-btn tc-cast">NIỆM</div><div class="tc-btn tc-jump">⤒</div>`;
    container.appendChild(root);
    player.touch.active = true;

    const q = (s: string) => root.querySelector<HTMLElement>(s)!;
    const stick = q('.tc-stick');
    const knob = q('.tc-knob');

    // --- Joystick (left half) -------------------------------------------------
    const RADIUS = 60;
    let stickId: number | null = null;
    let ox = 0;
    let oy = 0;
    const left = q('.tc-left');
    left.addEventListener('pointerdown', (e) => {
      if (stickId !== null) return;
      stickId = e.pointerId;
      left.setPointerCapture(e.pointerId);
      ox = e.clientX;
      oy = e.clientY;
      const r = root.getBoundingClientRect();
      stick.style.left = `${ox - r.left}px`;
      stick.style.top = `${oy - r.top}px`;
      stick.style.display = 'block';
    });
    left.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      let dx = e.clientX - ox;
      let dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > RADIUS) {
        dx = (dx / d) * RADIUS;
        dy = (dy / d) * RADIUS;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      player.touch.x = dx / RADIUS;
      player.touch.y = -dy / RADIUS;
      player.touch.sprint = d > RADIUS * 0.95;
      stick.classList.toggle('run', player.touch.sprint);
    });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      stick.style.display = 'none';
      knob.style.transform = '';
      player.touch.x = player.touch.y = 0;
      player.touch.sprint = false;
    };
    left.addEventListener('pointerup', endStick);
    left.addEventListener('pointercancel', endStick);

    // --- Look (right half) ----------------------------------------------------
    const right = q('.tc-right');
    const lookers = new Map<number, { x: number; y: number }>();
    right.addEventListener('pointerdown', (e) => {
      right.setPointerCapture(e.pointerId);
      lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    right.addEventListener('pointermove', (e) => {
      const last = lookers.get(e.pointerId);
      if (!last) return;
      player.look(e.clientX - last.x, e.clientY - last.y, 0.006);
      last.x = e.clientX;
      last.y = e.clientY;
    });
    const endLook = (e: PointerEvent) => lookers.delete(e.pointerId);
    right.addEventListener('pointerup', endLook);
    right.addEventListener('pointercancel', endLook);

    // --- Buttons ----------------------------------------------------------------
    const hold = (el: HTMLElement, down: () => void, up: () => void = () => {}) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('down');
        down();
      });
      const release = () => {
        if (!el.classList.contains('down')) return;
        el.classList.remove('down');
        up();
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    };
    let castHeld = false;
    hold(
      q('.tc-cast'),
      () => {
        castHeld = true;
        caster.press();
      },
      () => {
        castHeld = false;
        caster.release();
      },
    );
    hold(q('.tc-jump'), () => (player.touch.jump = true));

    // Spell buttons in an arc above NIỆM.
    commandsForClass('mage', false).forEach((c, i, all) => {
      const btn = document.createElement('div');
      btn.className = 'tc-btn tc-spell';
      btn.innerHTML = `<b>${c.hotkey}</b>${c.phrases[0]}`;
      // Arc around NIỆM from straight up (90°) to almost left (170°), radius 128px.
      const a = Math.PI * (0.5 + (i / Math.max(1, all.length - 1)) * 0.44);
      const castCenter = 16 + 42; // NIỆM: 16px from the edges, 84px wide
      btn.style.right = `${castCenter - 23 - Math.cos(a) * 128}px`;
      btn.style.bottom = `${castCenter - 23 + Math.sin(a) * 128}px`;
      root.appendChild(btn);
      hold(btn, () => {
        if (castHeld) {
          caster.hotkey(c.hotkey ?? 0);
        } else {
          // Tap alone: channel, cast, and end in one go.
          caster.press();
          caster.hotkey(c.hotkey ?? 0);
          caster.release();
        }
      });
    });

    // Never let the page scroll/zoom under the game.
    root.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }
}

/** Phones/tablets (finger is the main pointer, no hover). Touch-screen laptops keep mouse controls. */
export function isTouchDevice(): boolean {
  return matchMedia('(pointer: coarse) and (hover: none)').matches;
}
