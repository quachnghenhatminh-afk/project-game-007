import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const KEEP_ATTRIBUTES = new Set(['position', 'normal', 'uv']);

/**
 * Bakes every plain (non-instanced) mesh under `root` into one merged mesh per
 * material, cutting draw calls. Meshes for which `skip` returns true (animated
 * ones) are left alone. `root` must sit at the world origin with no transform.
 */
export function mergeStaticMeshes(root: THREE.Object3D, skip: (m: THREE.Mesh) => boolean = () => false): void {
  root.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
  const sources: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
    if (Array.isArray(o.material) || skip(o)) return;
    const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(geo.attributes)) if (!KEEP_ATTRIBUTES.has(name)) geo.deleteAttribute(name);
    if (!geo.attributes.uv) return; // all built-in geometries have uvs; skip anything unusual
    const g = groups.get(o.material) ?? { geos: [], cast: false, receive: false };
    g.geos.push(geo);
    g.cast ||= o.castShadow;
    g.receive ||= o.receiveShadow;
    groups.set(o.material, g);
    sources.push(o);
  });
  for (const o of sources) o.removeFromParent();
  for (const [material, g] of groups) {
    const merged = mergeGeometries(g.geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    root.add(mesh);
  }
}
