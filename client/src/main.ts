import { createWorld } from './render/world.ts';
import { buildNightEnvironment } from './render/environment.ts';
import { buildCitadel } from './render/citadel.ts';
import { FpArms } from './render/fpArms.ts';
import { FpsController } from './input/fpsController.ts';
import { PlayerStats } from './game/playerStats.ts';
import { Hud } from './ui/hud.ts';

// Phase 1 will grow this into the single-player game. For now: walk around the citadel at night.

const container = document.getElementById('view')!;
const overlay = document.getElementById('overlay')!;

const world = createWorld(container);
const env = buildNightEnvironment(world.scene, world.fpScene);
const citadel = buildCitadel(world.scene);
const player = new FpsController(world.camera, world.renderer.domElement);
const arms = new FpArms(world.fpScene);
const stats = new PlayerStats();
const hud = new Hud(document.body, stats);

overlay.addEventListener('click', () => player.lock());
player.controls.addEventListener('lock', () => overlay.classList.add('hidden'));
player.controls.addEventListener('unlock', () => overlay.classList.remove('hidden'));

world.onUpdate((dt, time) => {
  player.update(dt);
  env.update(dt, time, world.camera);
  citadel.update(dt, time);
  arms.update(dt, time, world.camera, player.speed);
  stats.update(dt);
  hud.update();
});
world.start();
