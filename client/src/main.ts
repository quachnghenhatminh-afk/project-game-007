import { createWorld } from './render/world.ts';
import { buildCitadel } from './render/citadel.ts';
import { FpsController } from './input/fpsController.ts';

// Phase 1 will grow this into the single-player game. For now: walk around the citadel.

const container = document.getElementById('view')!;
const overlay = document.getElementById('overlay')!;

const world = createWorld(container);
const citadel = buildCitadel(world.scene);
const player = new FpsController(world.camera, world.renderer.domElement);

overlay.addEventListener('click', () => player.lock());
player.controls.addEventListener('lock', () => overlay.classList.add('hidden'));
player.controls.addEventListener('unlock', () => overlay.classList.remove('hidden'));

world.onUpdate((dt, time) => {
  player.update(dt);
  citadel.update(dt, time);
});
world.start();
