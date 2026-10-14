import { PlayerState } from '@game/shared';
import { createWorld } from './render/world.ts';
import { buildNightEnvironment } from './render/environment.ts';
import { buildCitadel } from './render/citadel.ts';
import { FpArms } from './render/fpArms.ts';
import { FpsController } from './input/fpsController.ts';
import { SpellEffects } from './game/spellEffects.ts';
import { SpellCaster } from './game/spellCaster.ts';
import { Hud } from './ui/hud.ts';

// Phase 1 will grow this into the single-player game. For now: walk around the
// citadel at night and cast with right mouse + keys 1–5 (voice lives in the voice lab).

const container = document.getElementById('view')!;
const overlay = document.getElementById('overlay')!;

const world = createWorld(container);
const env = buildNightEnvironment(world.scene, world.fpScene);
const citadel = buildCitadel(world.scene);
const player = new FpsController(world.camera, world.renderer.domElement, citadel.colliders);
const effects = new SpellEffects(world.scene);
const arms = new FpArms(world.fpScene);
const state = new PlayerState();
const hud = new Hud(document.body, state);
const caster = new SpellCaster(state, arms, effects, hud, world.camera);
player.sprintAllowed = () => state.canSprint;

overlay.addEventListener('click', () => player.lock());
player.controls.addEventListener('lock', () => overlay.classList.add('hidden'));
player.controls.addEventListener('unlock', () => overlay.classList.remove('hidden'));
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousedown', (e) => {
  if (e.button === 2 && player.isLocked) caster.press();
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 2) caster.release();
});
window.addEventListener('keydown', (e) => {
  if (!e.repeat && /^Digit[1-5]$/.test(e.code)) caster.hotkey(Number(e.code.slice(5)));
});
window.addEventListener('blur', () => caster.cancel());

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
