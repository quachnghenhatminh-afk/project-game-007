import * as THREE from 'three';

export interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Registers a per-frame callback; dt is in seconds (clamped). */
  onUpdate(fn: (dt: number, time: number) => void): void;
  start(): void;
}

const SKY_COLOR = 0xa9cde8;

/** Renderer + scene + camera + lights, sized to fill `container`. */
export function createWorld(container: HTMLElement): World {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, 70, 230);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
  camera.rotation.order = 'YXZ';

  scene.add(new THREE.HemisphereLight(0xdcefff, 0x4a5a3a, 1.4));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(40, 70, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -70;
  s.right = 70;
  s.top = 70;
  s.bottom = -70;
  s.near = 1;
  s.far = 200;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

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
    camera,
    onUpdate: (fn) => callbacks.push(fn),
    start() {
      renderer.setAnimationLoop(() => {
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        for (const fn of callbacks) fn(dt, now / 1000);
        renderer.render(scene, camera);
      });
    },
  };
}
