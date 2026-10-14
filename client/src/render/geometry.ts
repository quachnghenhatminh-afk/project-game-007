import * as THREE from 'three';

// Geometry helpers whose UVs are in meters / `tile`, so a tiling texture keeps
// the same real-world size on every piece (a 1.6m wall block and a 17m tower
// show stone blocks of the same size).

/** Box with world-scaled UVs on every face. */
export function boxGeo(w: number, h: number, d: number, tile: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; 4 vertices each (1 segment).
  const faceSize: Array<[number, number]> = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = faceSize[f]!;
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
    }
  }
  return geo;
}

/** Cylinder with world-scaled UVs on the side (u around, v up). */
export function cylGeo(rTop: number, rBottom: number, h: number, segments: number, tile: number): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, segments);
  const circumference = Math.PI * (rTop + rBottom);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circumference) / tile, (uv.getY(i) * h) / tile);
  return geo;
}

/** Scales existing UVs (e.g. ExtrudeGeometry, whose UVs are already in meters). */
export function scaleUv<T extends THREE.BufferGeometry>(geo: T, su: number, sv = su): T {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}
