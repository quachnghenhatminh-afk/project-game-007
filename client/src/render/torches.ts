import * as THREE from 'three';
import { glowTexture } from './textures.ts';
import { mergeStaticMeshes } from './mergeStatic.ts';

// Flickering torches, batched for performance: brackets/posts are merged into a
// few meshes, flames are two InstancedMeshes, glows are two point clouds.
// Only some torches carry a real PointLight (lights are expensive in forward rendering).

export type TorchKind = 'wall' | 'post' | 'brazier';

interface Flame {
  pos: THREE.Vector3;
  size: number;
  phase: number;
  light: THREE.PointLight | null;
  base: number;
}

const LIGHT_INTENSITY = 60;
const LIGHT_DISTANCE = 22;
const GLOW_SIZE = 2.6;

export class Torches {
  private props = new THREE.Group();
  private flames: Flame[] = [];
  private outer: THREE.InstancedMesh | null = null;
  private inner: THREE.InstancedMesh | null = null;
  private ironMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.6, metalness: 0.6 });
  private woodMat = new THREE.MeshStandardMaterial({ color: 0x3e2a1a, roughness: 0.95, flatShading: true });
  private stoneMat = new THREE.MeshStandardMaterial({ color: 0x75706a, roughness: 0.95, flatShading: true });
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {
    scene.add(this.props);
  }

  /**
   * @param pos    where the flame sits (world space)
   * @param facing direction a wall bracket points (radians, same convention as gates); wall torches only
   */
  add(pos: THREE.Vector3, kind: TorchKind, opts: { light?: boolean; facing?: number } = {}): void {
    const size = kind === 'brazier' ? 2.4 : 1;
    const part = (geo: THREE.BufferGeometry, mat: THREE.Material, at: THREE.Vector3, shadow = false) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(at);
      m.castShadow = shadow;
      this.props.add(m);
      return m;
    };
    if (kind === 'wall') {
      const arm = part(new THREE.BoxGeometry(0.08, 0.08, 0.55), this.ironMat, pos.clone().add(new THREE.Vector3(0, -0.35, 0)));
      arm.rotation.y = opts.facing ?? 0;
      arm.translateZ(-0.27);
      part(new THREE.CylinderGeometry(0.05, 0.04, 0.45, 6), this.woodMat, pos.clone().add(new THREE.Vector3(0, -0.2, 0)));
    } else if (kind === 'post') {
      part(new THREE.CylinderGeometry(0.08, 0.12, pos.y, 6), this.woodMat, new THREE.Vector3(pos.x, pos.y / 2, pos.z), true);
      part(new THREE.CylinderGeometry(0.18, 0.1, 0.2, 8), this.ironMat, pos.clone().add(new THREE.Vector3(0, -0.05, 0)));
    } else {
      part(new THREE.CylinderGeometry(0.35, 0.5, pos.y - 0.3, 8), this.stoneMat, new THREE.Vector3(pos.x, (pos.y - 0.3) / 2, pos.z), true);
      part(new THREE.CylinderGeometry(0.8, 0.45, 0.45, 10), this.ironMat, pos.clone().add(new THREE.Vector3(0, -0.15, 0)), true);
    }

    let light: THREE.PointLight | null = null;
    if (opts.light) {
      light = new THREE.PointLight(0xff8c3a, LIGHT_INTENSITY * size, LIGHT_DISTANCE * Math.sqrt(size), 2);
      light.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
      this.scene.add(light);
    }
    this.flames.push({ pos: pos.clone(), size, phase: Math.random() * 100, light, base: light?.intensity ?? 0 });
  }

  /** Call once after all add() calls. */
  finalize(): void {
    mergeStaticMeshes(this.props);
    const flameGeo = new THREE.ConeGeometry(0.16, 0.55, 7).translate(0, 0.27, 0);
    const n = this.flames.length;
    this.outer = new THREE.InstancedMesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xff7a1a }), n);
    this.inner = new THREE.InstancedMesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xffe08a }), n);
    this.scene.add(this.outer, this.inner);

    for (const big of [false, true]) {
      const list = this.flames.filter((f) => f.size > 1 === big);
      if (!list.length) continue;
      const pos = new Float32Array(list.length * 3);
      list.forEach((f, i) => pos.set([f.pos.x, f.pos.y + 0.25 * f.size, f.pos.z], i * 3));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        map: glowTexture(),
        color: 0xff9a40,
        size: GLOW_SIZE * (big ? 2.4 : 1),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });
      this.scene.add(new THREE.Points(geo, mat));
    }
    this.update(0);
  }

  update(time: number): void {
    if (!this.outer || !this.inner) return;
    this.flames.forEach((f, i) => {
      const t = time + f.phase;
      const k = 1 + 0.12 * Math.sin(t * 11) + 0.08 * Math.sin(t * 17.3) + 0.05 * Math.sin(t * 29.1);
      this.outer!.setMatrixAt(i, this.m4.compose(f.pos, this.q, this.s.set(f.size, f.size * k, f.size)));
      const si = f.size * 0.6;
      this.inner!.setMatrixAt(i, this.m4.compose(f.pos, this.q, this.s.set(si, si * (2 - k), si)));
      if (f.light) f.light.intensity = f.base * (0.8 + 0.2 * k);
    });
    this.outer.instanceMatrix.needsUpdate = true;
    this.inner.instanceMatrix.needsUpdate = true;
  }
}
