import * as THREE from 'three';
import { glowTexture } from './textures.ts';

// The core crystal: floating, rotating, glowing, with 4 orbiting shards. Shared by all maps.

export interface Crystal {
  /** Meshes that move every frame (must not be merged into static geometry). */
  animated: THREE.Object3D[];
  /** World position of the top tip (health bar anchor). */
  top: THREE.Vector3;
  material: THREE.MeshStandardMaterial;
  update(time: number): void;
}

/**
 * @param baseY  height of the crystal's center
 * @param scale  overall size (1 = the citadel's 9m crystal)
 */
export function buildCrystal(root: THREE.Object3D, baseY: number, scale = 1, lightIntensity = 400): Crystal {
  const material = new THREE.MeshStandardMaterial({
    color: 0x7fe9ff,
    emissive: 0x1aa6d9,
    emissiveIntensity: 1.6,
    roughness: 0.15,
    metalness: 0.1,
    flatShading: true,
    transparent: true,
    opacity: 0.92,
  });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(2 * scale, 0), material);
  crystal.scale.set(1, 2.2, 1);
  crystal.castShadow = true;
  crystal.position.y = baseY;
  root.add(crystal);

  const glowSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: 0x5fd8ff, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 }),
  );
  glowSprite.position.y = baseY;
  glowSprite.scale.setScalar(16 * scale);
  root.add(glowSprite);

  const shards: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.45 * scale, 0), material);
    s.scale.set(1, 1.8, 1);
    root.add(s);
    shards.push(s);
  }
  const light = new THREE.PointLight(0x7fe8ff, lightIntensity, 50 * scale, 2);
  light.position.y = baseY;
  root.add(light);

  return {
    animated: [crystal, ...shards],
    top: new THREE.Vector3(0, baseY + 2 * scale * 2.2 + 1, 0),
    material,
    update(time) {
      crystal.rotation.y = time * 0.4;
      crystal.position.y = baseY + Math.sin(time * 1.5) * 0.25 * scale;
      glowSprite.position.y = crystal.position.y;
      light.intensity = lightIntensity * (0.95 + Math.sin(time * 2.3) * 0.15);
      shards.forEach((s, i) => {
        const a = time * 0.8 + (i * Math.PI) / 2;
        s.position.set(Math.sin(a) * 3.6 * scale, baseY + Math.sin(time * 2 + i) * 0.6 * scale, Math.cos(a) * 3.6 * scale);
        s.rotation.y = -time * 1.5;
      });
    },
  };
}
