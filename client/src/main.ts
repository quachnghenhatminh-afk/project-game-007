import { PlayerState } from '@game/shared';
import { createWorld } from './render/world.ts';
import { buildNightEnvironment } from './render/environment.ts';
import { buildCitadel } from './render/citadel.ts';
import { FpArms } from './render/fpArms.ts';
import { FpsController } from './input/fpsController.ts';
import { TouchControls, isTouchDevice } from './input/touchControls.ts';
import { SpellEffects } from './game/spellEffects.ts';
import { SpellCaster } from './game/spellCaster.ts';
import { Hud } from './ui/hud.ts';
import { isWebSpeechSupported } from './voice/webSpeechEngine.ts';
import { defaultVoiceChoice, setupVoice, type VoiceChoice } from './voice/voiceSetup.ts';

// Playable prototype (desktop + mobile): night citadel, voice spellcasting, HUD.
// This is what `pnpm build:itch` packages for itch.io.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const touch = isTouchDevice();
document.body.classList.toggle('touch', touch);

// --- World ----------------------------------------------------------------------
const world = createWorld($('view'), touch);
const env = buildNightEnvironment(world.scene, world.fpScene);
const citadel = buildCitadel(world.scene, touch);
const player = new FpsController(world.camera, world.renderer.domElement, citadel.colliders);
const effects = new SpellEffects(world.scene);
const arms = new FpArms(world.fpScene);
const state = new PlayerState();
const hud = new Hud(document.body, state);
const caster = new SpellCaster(state, arms, effects, hud, world.camera);
player.sprintAllowed = () => state.canSprint;
player.jumpAllowed = () => state.tryJump();
let fogHintAt = 0;
player.onBlockedByFog = () => {
  if (performance.now() - fogHintAt > 4000) hud.flash('Sương mù quá dày, không thể đi tiếp', '#b8c6e0');
  fogHintAt = performance.now();
};

world.onUpdate((dt, time) => {
  player.update(dt);
  caster.update(dt, player.wantsSprint);
  env.update(dt, time, world.camera);
  citadel.update(dt, time);
  effects.update(dt);
  arms.update(dt, time, world.camera, player.speed);
  hud.update();
});
world.start();

// --- Start menu -----------------------------------------------------------------
if (!isWebSpeechSupported()) {
  $('opt-webspeech').classList.add('off');
  $('opt-webspeech').querySelector('input')!.disabled = true;
}
const preferred = defaultVoiceChoice(touch);
document.querySelector<HTMLInputElement>(`input[name="voice"][value="${preferred}"]`)!.checked = true;

let started = false;
$('btn-start').addEventListener('click', () => {
  if (started) return;
  started = true;
  const choice = (document.querySelector<HTMLInputElement>('input[name="voice"]:checked')?.value ?? 'off') as VoiceChoice;
  // Everything that needs the click's user activation happens synchronously here.
  if (touch) {
    void document.documentElement.requestFullscreen?.().then(
      () => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {}),
      () => {},
    );
    new TouchControls(document.body, player, caster);
  } else {
    player.lock();
  }
  $('menu').classList.add('hidden');
  void startVoice(choice);
});

async function startVoice(choice: VoiceChoice): Promise<void> {
  if (choice === 'off') {
    toast(touch ? 'Không dùng giọng nói — chạm nút 1–5 để niệm phép' : 'Không dùng giọng nói — giữ chuột phải + phím 1–5', null, 5000);
    return;
  }
  toast('Đang chuẩn bị giọng nói…', null);
  const res = await setupVoice(choice, (text, f) => toast(text, f));
  caster.voice = res.voice;
  if (res.error) toast(`${res.error} Vẫn chơi được bằng ${touch ? 'nút' : 'phím'} 1–5.`, null, 9000, true);
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
    if (started) pause.classList.remove('hidden');
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousedown', (e) => {
    if (e.button === 2 && player.isLocked) caster.press();
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) caster.release();
  });
  window.addEventListener('keydown', (e) => {
    if (e.repeat || !player.isLocked) return;
    if (e.code === 'KeyV') caster.press();
    else if (/^Digit[1-5]$/.test(e.code)) caster.hotkey(Number(e.code.slice(5)));
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyV') caster.release();
  });
}
window.addEventListener('blur', () => caster.cancel());
if (import.meta.env.DEV) Object.assign(window, { __world: world, __caster: caster, __state: state, __player: player });
