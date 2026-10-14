import * as THREE from 'three';

export interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  /** Rendered after `scene` with a cleared depth buffer: first-person arms never clip into walls. */
  fpScene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Registers a per-frame callback; dt is in seconds (clamped). */
  onUpdate(fn: (dt: number, time: number) => void): void;
  start(): void;
}

/** Renderer + scenes + camera, sized to fill `container`. Lighting lives in environment.ts. */
export function createWorld(container: HTMLElement): World {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  const fpScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 500);
  camera.rotation.order = 'YXZ';

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  const callbacks: Array<(dt: number, time: number) => void> = [];
  let last = performance.now();

  return {
    renderer,
    scene,
    fpScene,
    camera,
    onUpdate: (fn) => callbacks.push(fn),
    start() {
      renderer.setAnimationLoop(() => {
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        for (const fn of callbacks) fn(dt, now / 1000);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.clearDepth();
        renderer.render(fpScene, camera);
      });
    },
  };
}
