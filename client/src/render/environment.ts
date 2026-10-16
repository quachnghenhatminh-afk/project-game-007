import * as THREE from 'three';
import { CITADEL } from '@game/shared';
import { cloudTexture, glowTexture, verticalFadeTexture } from './textures.ts';

// Sky, lights and fog for a map. Two presets:
//   night – dark sky with stars and moon, moonlight (Thành Pha Lê)
//   day   – tropical afternoon: blue sky, warm sun, light haze (Căn cứ Container)
// Both have a fog wall in the forest that marks the edge of the play area, and drifting mist.

export type EnvironmentPreset = 'night' | 'day';

interface PresetConfig {
  sky: number;
  thickFog: number;
  mist: number;
  baseDensity: number;
  maxDensity: number;
  hemi: [sky: number, ground: number, intensity: number];
  sun: { color: number; intensity: number; pos: [number, number, number] };
  fpHemi: [sky: number, ground: number, intensity: number];
  fpKey: [color: number, intensity: number];
  stars: boolean;
  mistOpacity: [wall: number, ground: number];
}

const PRESETS: Record<EnvironmentPreset, PresetConfig> = {
  night: {
    sky: 0x101a2e,
    thickFog: 0x3a4660,
    mist: 0x6f7f9c,
    baseDensity: 0.012,
    maxDensity: 0.11,
    hemi: [0x3b4f80, 0x0a0c12, 0.9],
    sun: { color: 0xa9bfff, intensity: 0.9, pos: [-50, 80, -30] },
    fpHemi: [0x6f86c0, 0x1a1410, 1.6],
    fpKey: [0xffc690, 1.2],
    stars: true,
    mistOpacity: [0.5, 0.25],
  },
  day: {
    sky: 0x9fd2ee,
    thickFog: 0xe4eef2,
    mist: 0xf2f6f8,
    baseDensity: 0.0065,
    maxDensity: 0.1,
    hemi: [0xd8f0ff, 0x6f7a3a, 1.5],
    sun: { color: 0xfff0d2, intensity: 2.6, pos: [55, 85, 35] },
    fpHemi: [0xe6f4ff, 0x6a5a40, 2.2],
    fpKey: [0xfff0d2, 1.6],
    stars: false,
    mistOpacity: [0.55, 0.18],
  },
};

/** Kept for code that refers to the night sky color. */
export const NIGHT_FOG_COLOR = PRESETS.night.sky;

export interface Environment {
  update(dt: number, time: number, camera: THREE.Camera): void;
}

export function buildEnvironment(scene: THREE.Scene, fpScene: THREE.Scene, preset: EnvironmentPreset = 'night'): Environment {
  const P = PRESETS[preset];
  scene.background = new THREE.Color(P.sky);
  scene.fog = new THREE.FogExp2(P.sky, P.baseDensity);

  // --- Lights ---------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(P.hemi[0], P.hemi[1], P.hemi[2]));
  const sun = new THREE.DirectionalLight(P.sun.color, P.sun.intensity);
  sun.position.set(...P.sun.pos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 220 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // First-person arms have their own (simple) lighting.
  fpScene.add(new THREE.HemisphereLight(P.fpHemi[0], P.fpHemi[1], P.fpHemi[2]));
  const key = new THREE.DirectionalLight(P.fpKey[0], P.fpKey[1]);
  key.position.set(1, 2, 1);
  fpScene.add(key);

  // --- Sky objects follow the camera so they stay "infinitely" far -------------
  const sky = new THREE.Group();
  scene.add(sky);
  const sunDir = sun.position.clone().normalize();
  if (P.stars) {
    const starCount = 1600;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(Math.random() * 0.95); // upper hemisphere
      pos.set([Math.sin(v) * Math.cos(u) * 400, Math.cos(v) * 400, Math.sin(v) * Math.sin(u) * 400], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sky.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, fog: false })));
  }
  // Moon (night) or sun (day) disc with a soft halo.
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: P.stars ? 0xeef3ff : 0xfffbe8, fog: false, depthWrite: false }));
  disc.position.copy(sunDir).multiplyScalar(380);
  disc.scale.setScalar(P.stars ? 40 : 60);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: P.stars ? 0x6f86c0 : 0xfff3c0,
      fog: false,
      depthWrite: false,
      opacity: P.stars ? 0.5 : 0.6,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.position.copy(disc.position);
  halo.scale.setScalar(P.stars ? 140 : 220);
  sky.add(halo, disc);

  // --- Fog wall: layered open cylinders fading upward ------------------------
  const fogLayers: THREE.Mesh[] = [];
  [
    { r: CITADEL.fogWallRadius, h: 22, o: 0.55 },
    { r: CITADEL.fogWallRadius + 6, h: 30, o: 0.7 },
    { r: CITADEL.fogWallRadius + 14, h: 40, o: 0.9 },
  ].forEach(({ r, h, o }) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 64, 1, true),
      new THREE.MeshBasicMaterial({
        color: P.mist,
        alphaMap: verticalFadeTexture(),
        transparent: true,
        opacity: o,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    mesh.position.y = h / 2 - 1;
    scene.add(mesh);
    fogLayers.push(mesh);
  });

  const mists = [
    makeMist(scene, P.mist, 90, CITADEL.fogStartRadius, 18, 1, 6, 20, P.mistOpacity[0]), // dense band at the fog wall
    makeMist(scene, P.mist, 50, CITADEL.wallRadius + 6, 34, 0.8, 1.2, 12, P.mistOpacity[1]), // light ground mist
  ];

  // Walking into the fog band: distance fog thickens until vision is a few meters.
  const fog = scene.fog as THREE.FogExp2;
  const bg = scene.background as THREE.Color;
  const clearColor = new THREE.Color(P.sky);
  const thickColor = new THREE.Color(P.thickFog);

  return {
    update(dt, time, camera) {
      sky.position.copy(camera.position);
      for (const m of mists) m.update(dt, time);
      fogLayers.forEach((m, i) => (m.rotation.y = time * 0.01 * (i % 2 ? 1 : -1)));
      const k = fogDepth(Math.hypot(camera.position.x, camera.position.z));
      fog.density = P.baseDensity + k * k * (P.maxDensity - P.baseDensity);
      fog.color.lerpColors(clearColor, thickColor, k);
      bg.copy(fog.color);
    },
  };
}

/** Night environment (the original map). */
export function buildNightEnvironment(scene: THREE.Scene, fpScene: THREE.Scene): Environment {
  return buildEnvironment(scene, fpScene, 'night');
}

/** 0 outside the fog band, rising to 1 at the edge of the play area. */
export function fogDepth(radius: number): number {
  const t = (radius - CITADEL.fogStartRadius) / (CITADEL.playAreaRadius - CITADEL.fogStartRadius);
  return Math.min(1, Math.max(0, t));
}

function makeMist(
  scene: THREE.Scene,
  color: number,
  count: number,
  r0: number,
  rSpread: number,
  y0: number,
  ySpread: number,
  size: number,
  opacity: number,
): { update(dt: number, time: number): void } {
  const puffs = Array.from({ length: count }, () => ({
    r: r0 + Math.random() * rSpread,
    a: Math.random() * Math.PI * 2,
    y: y0 + Math.random() * ySpread,
    speed: (Math.random() < 0.5 ? -1 : 1) * (0.005 + Math.random() * 0.01),
  }));
  const pos = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pos, 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attr);
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ map: cloudTexture(), color, size, transparent: true, opacity, depthWrite: false }),
  );
  points.frustumCulled = false;
  scene.add(points);
  return {
    update(dt, time) {
      puffs.forEach((p, i) => {
        p.a += p.speed * dt;
        pos[i * 3] = Math.sin(p.a) * p.r;
        pos[i * 3 + 1] = p.y + Math.sin(time * 0.3 + p.r) * 0.4;
        pos[i * 3 + 2] = Math.cos(p.a) * p.r;
      });
      attr.needsUpdate = true;
    },
  };
}
