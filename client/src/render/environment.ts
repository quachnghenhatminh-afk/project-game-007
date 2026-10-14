import * as THREE from 'three';
import { CITADEL } from '@game/shared';
import { cloudTexture, glowTexture, verticalFadeTexture } from './textures.ts';

// Night setting: dark sky with stars and moon, moonlight, distance fog,
// a fog wall in the forest that marks the edge of the play area, and drifting mist.

export const NIGHT_FOG_COLOR = 0x101a2e;
const MIST_COLOR = 0x6f7f9c;

export interface Environment {
  update(dt: number, time: number, camera: THREE.Camera): void;
}

export function buildNightEnvironment(scene: THREE.Scene, fpScene: THREE.Scene): Environment {
  scene.background = new THREE.Color(NIGHT_FOG_COLOR);
  scene.fog = new THREE.FogExp2(NIGHT_FOG_COLOR, BASE_FOG_DENSITY);

  // --- Lights ---------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0x3b4f80, 0x0a0c12, 0.9));
  const moon = new THREE.DirectionalLight(0xa9bfff, 0.9);
  moon.position.set(-50, 80, -30);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 220 });
  moon.shadow.bias = -0.0005;
  scene.add(moon);

  // First-person arms have their own (simple) lighting.
  fpScene.add(new THREE.HemisphereLight(0x6f86c0, 0x1a1410, 1.6));
  const key = new THREE.DirectionalLight(0xffc690, 1.2);
  key.position.set(1, 2, 1);
  fpScene.add(key);

  // --- Sky: stars + moon (follow the camera so they stay "infinitely" far) ----
  const sky = new THREE.Group();
  scene.add(sky);
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

  const moonDir = moon.position.clone().normalize();
  const moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xeef3ff, fog: false, depthWrite: false }));
  moonDisc.position.copy(moonDir).multiplyScalar(380);
  moonDisc.scale.setScalar(40);
  const moonHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: 0x6f86c0, fog: false, depthWrite: false, opacity: 0.5, blending: THREE.AdditiveBlending }),
  );
  moonHalo.position.copy(moonDisc.position);
  moonHalo.scale.setScalar(140);
  sky.add(moonHalo, moonDisc);

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
        color: MIST_COLOR,
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

  // --- Drifting mist puffs (one point cloud per layer = one draw call each) ---
  const mists = [
    makeMist(scene, 90, CITADEL.fogStartRadius, 18, 1, 6, 20, 0.5), // dense band where the fog wall is
    makeMist(scene, 50, CITADEL.wallRadius + 6, 34, 0.8, 1.2, 12, 0.25), // light ground mist in the forest
  ];

  // Walking into the fog band: distance fog thickens until vision is a few meters.
  const fog = scene.fog as THREE.FogExp2;
  const bg = scene.background as THREE.Color;
  const clearColor = new THREE.Color(NIGHT_FOG_COLOR);
  const thickColor = new THREE.Color(0x3a4660);

  return {
    update(dt, time, camera) {
      sky.position.copy(camera.position);
      for (const m of mists) m.update(dt, time);
      fogLayers.forEach((m, i) => (m.rotation.y = time * 0.01 * (i % 2 ? 1 : -1)));
      const k = fogDepth(Math.hypot(camera.position.x, camera.position.z));
      fog.density = BASE_FOG_DENSITY + k * k * (MAX_FOG_DENSITY - BASE_FOG_DENSITY);
      fog.color.lerpColors(clearColor, thickColor, k);
      bg.copy(fog.color);
    },
  };
}

const BASE_FOG_DENSITY = 0.012;
const MAX_FOG_DENSITY = 0.11;

/** 0 outside the fog band, rising to 1 at the edge of the play area. */
export function fogDepth(radius: number): number {
  const t = (radius - CITADEL.fogStartRadius) / (CITADEL.playAreaRadius - CITADEL.fogStartRadius);
  return Math.min(1, Math.max(0, t));
}

function makeMist(
  scene: THREE.Scene,
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
    new THREE.PointsMaterial({ map: cloudTexture(), color: MIST_COLOR, size, transparent: true, opacity, depthWrite: false }),
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
