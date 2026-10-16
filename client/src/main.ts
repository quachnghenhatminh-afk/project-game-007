import { CORE, PlayerState, SPELLS } from '@game/shared';
import { createWorld } from './render/world.ts';
import { buildEnvironment } from './render/environment.ts';
import { buildCitadel } from './render/citadel.ts';
import { buildVnBase } from './render/vnBase.ts';
import { MAP_NAMES, type GameMap } from './render/gameMap.ts';
import { FpArms } from './render/fpArms.ts';
import { FpsController } from './input/fpsController.ts';
import { TouchControls, isTouchDevice } from './input/touchControls.ts';
import { SpellEffects } from './game/spellEffects.ts';
import { SpellCaster } from './game/spellCaster.ts';
import { Destructibles } from './game/destructibles.ts';
import { MeleeAttack } from './game/melee.ts';
import { Hud } from './ui/hud.ts';
import { CoreBar } from './ui/coreBar.ts';
import { Settings, applySavedVolume, chosenMap, switchMap } from './ui/settings.ts';
import { Sfx } from './audio/sfx.ts';
import { Loadout } from './game/loadout.ts';
import { Spellbook } from './ui/spellbook.ts';
import { Hotbar } from './ui/hotbar.ts';
import { isWebSpeechSupported } from './voice/webSpeechEngine.ts';
import { defaultVoiceChoice, setupVoice, type VoiceChoice } from './voice/voiceSetup.ts';

// Playable prototype (desktop + mobile): two maps, voice spellcasting, wand melee,
// destructible trees/props, HUD. This is what `pnpm build:itch` packages for itch.io.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const touch = isTouchDevice();
document.body.classList.toggle('touch', touch);
const mapId = chosenMap();
applySavedVolume();

// --- World ----------------------------------------------------------------------
const world = createWorld($('view'), touch);
const destructibles = new Destructibles(world.scene);
const map: GameMap =
  mapId === 'vn-base'
    ? buildVnBase(world.scene, { lowQuality: touch, destructibles })
    : buildCitadel(world.scene, { lowQuality: touch, destructibles });
const env = buildEnvironment(world.scene, world.fpScene, map.environment);
const player = new FpsController(world.camera, world.renderer.domElement, map, map.spawn);
const effects = new SpellEffects(world.scene);
const arms = new FpArms(world.fpScene);
const state = new PlayerState();
const hud = new Hud(document.body, state);
const caster = new SpellCaster(state, arms, effects, hud, world.camera);
const melee = new MeleeAttack(state, arms, effects, destructibles, caster, world.camera);

// Loadout: spell slots 1–7 + weapon, edited in the spellbook (J), shown in the slot bar.
const loadout = new Loadout();
const syncWeapon = () => arms.setWeapon(loadout.weapon !== null);
syncWeapon();
loadout.onChange(syncWeapon);
caster.spellForKey = (n) => loadout.spellAt(n);
caster.activeSpell = () => loadout.activeSpell;
melee.hasWeapon = () => loadout.weapon !== null;
new Hotbar(document.body, loadout);
const spellbook = new Spellbook(loadout);
const core = { hp: CORE.maxHp, max: CORE.maxHp };
const coreBar = new CoreBar(document.body, world.camera, map.coreTop, () => core, touch ? 112 : 30);
player.sprintAllowed = () => state.canSprint;
player.jumpAllowed = () => state.tryJump();
let fogHintAt = 0;
player.onBlockedByFog = () => {
  if (performance.now() - fogHintAt > 4000) hud.flash('Sương mù quá dày, không thể đi tiếp', '#b8c6e0');
  fogHintAt = performance.now();
};

// Guardian spirit: float 3m up, move a bit slower.
caster.onSpirit = (active) => {
  player.lift = active ? SPELLS.spiritLiftM : 0;
  player.speedScale = active ? 0.7 : 1;
};
// Spells landing: break props / fell trees, explosion sounds by distance.
effects.onImpact = (id, point, radius) => {
  const dist = world.camera.position.distanceTo(point);
  if (radius > 0) destructibles.damageSphere(point, radius, 3);
  if (id === 'sound-blast') Sfx.sonicImpact(dist);
  else Sfx.explosion(Math.max(radius, 2), dist);
};
destructibles.onEvent = (e) => {
  const dist = world.camera.position.distanceTo(e.pos);
  if (e.type === 'tree-fall') Sfx.treeFall(dist);
  else if (e.type === 'prop-break') Sfx.breakProp(dist);
};

world.onUpdate((dt, time) => {
  player.update(dt);
  caster.update(dt, player.wantsSprint);
  melee.update(dt);
  env.update(dt, time, world.camera);
  map.update(dt, time);
  effects.update(dt);
  destructibles.update(dt, [world.camera.position]);
  arms.update(dt, time, world.camera, player.speed);
  hud.update();
  coreBar.update();
});
world.start();

// --- Settings (gear, top-right) ------------------------------------------------------
const settings = new Settings(mapId);
settings.onToggle = (open) => {
  if (open) {
    caster.cancel();
    if (!touch && player.isLocked) player.controls.unlock();
  }
};

// --- Start menu -----------------------------------------------------------------
if (!isWebSpeechSupported()) {
  $('opt-webspeech').classList.add('off');
  $('opt-webspeech').querySelector('input')!.disabled = true;
}
const preferred = defaultVoiceChoice(touch);
document.querySelector<HTMLInputElement>(`input[name="voice"][value="${preferred}"]`)!.checked = true;
$('map-select').innerHTML = (Object.keys(MAP_NAMES) as Array<keyof typeof MAP_NAMES>)
  .map((id) => `<option value="${id}" ${id === mapId ? 'selected' : ''}>${MAP_NAMES[id]}</option>`)
  .join('');
$('map-select').addEventListener('change', (e) => switchMap((e.target as HTMLSelectElement).value as keyof typeof MAP_NAMES));

let started = false;
$('btn-start').addEventListener('click', () => {
  if (started) return;
  started = true;
  Sfx.unlock(); // browsers only allow audio after a click
  const choice = (document.querySelector<HTMLInputElement>('input[name="voice"]:checked')?.value ?? 'off') as VoiceChoice;
  // Everything that needs the click's user activation happens synchronously here.
  if (touch) {
    void document.documentElement.requestFullscreen?.().then(
      () => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {}),
      () => {},
    );
    new TouchControls(document.body, player, caster, () => melee.attack(), loadout, () => spellbook.toggle());
  } else {
    player.lock();
  }
  $('menu').classList.add('hidden');
  void startVoice(choice);
});

async function startVoice(choice: VoiceChoice): Promise<void> {
  if (choice === 'off') {
    toast(touch ? 'Không dùng giọng nói — chạm nút 1–7 để niệm phép · 📖 đổi thần chú' : 'Không dùng giọng nói — giữ chuột phải rồi thả để niệm phép ở ô đang chọn · J: sách phép', null, 6000);
    return;
  }
  toast('Đang chuẩn bị giọng nói…', null);
  const res = await setupVoice(choice, (text, f) => toast(text, f));
  caster.voice = res.voice;
  if (res.error) toast(`${res.error} Vẫn chơi được bằng ${touch ? 'nút' : 'phím'} 1–7.`, null, 9000, true);
  else toast(`Giọng nói sẵn sàng! ${touch ? 'Giữ NIỆM' : 'Giữ chuột phải'} rồi đọc thần chú.`, null, 4000);
}

let toastTimer = 0;
function toast(text: string, fraction: number | null, hideAfterMs = 0, isError = false): void {
  const el = $('toast');
  el.classList.remove('hidden');
  el.classList.toggle('err', isError);
  $('toast-text').textContent = text;
  const bar = el.querySelector<HTMLElement>('.bar')!;
  bar.style.display = fraction === null ? 'none' : '';
  if (fraction !== null) $('toast-bar').style.width = `${Math.round(fraction * 100)}%`;
  clearTimeout(toastTimer);
  if (hideAfterMs) toastTimer = window.setTimeout(() => el.classList.add('hidden'), hideAfterMs);
}

// --- Desktop input ------------------------------------------------------------------
if (!touch) {
  const pause = $('pause');
  pause.addEventListener('click', () => player.lock());
  player.controls.addEventListener('lock', () => pause.classList.add('hidden'));
  player.controls.addEventListener('unlock', () => {
    caster.cancel();
    if (started && !settings.isOpen && !spellbook.isOpen) pause.classList.remove('hidden');
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousedown', (e) => {
    if (!player.isLocked) return;
    if (e.button === 0) melee.attack();
    else if (e.button === 2) caster.press();
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) caster.release();
  });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyJ' && started && !settings.isOpen) {
      spellbook.toggle();
      return;
    }
    if (e.code === 'Escape' && spellbook.isOpen) {
      spellbook.close();
      return;
    }
    if (!player.isLocked) return;
    if (e.code === 'KeyV') caster.press();
    else if (/^Digit[1-7]$/.test(e.code)) {
      const n = Number(e.code.slice(5));
      loadout.select(n - 1); // choose the active slot…
      caster.hotkey(n); // …and, while channeling, cast it right away
    }
  });
  // Mouse wheel cycles the active slot.
  window.addEventListener('wheel', (e) => {
    if (player.isLocked) loadout.select(loadout.active + (e.deltaY > 0 ? 1 : -1));
  });
  spellbook.onToggle = (open) => {
    if (open) {
      caster.cancel();
      if (player.isLocked) player.controls.unlock(); // free the mouse for dragging
    } else {
      player.lock();
      setTimeout(() => {
        if (!player.isLocked) pause.classList.remove('hidden'); // lock needs a click (e.g. closed with Esc)
      }, 200);
    }
  };
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyV') caster.release();
  });
}
window.addEventListener('blur', () => caster.cancel());
if (import.meta.env.DEV) {
  Object.assign(window, { __world: world, __caster: caster, __state: state, __player: player, __melee: melee, __destructibles: destructibles, __effects: effects, __arms: arms, __loadout: loadout, __spellbook: spellbook });
}
