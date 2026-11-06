// Soft-chunky shape kit (art pass 2026-11). Big simple volumes, rounded
// silhouettes, low-poly but softly shaded, vertex-colour gradients for a fake
// ambient occlusion. Every builder returns a plain BufferGeometry; `bake` merges
// a whole prop into ONE geometry with a `color` attribute, drawn with the
// storey's shared kit material — one draw call per prop, not one per primitive.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const C = new THREE.Color(), V = new THREE.Vector3(), S = new THREE.Vector3();

/* ---------------- cache ---------------- */
// Geometry is cached across loads (the builder reloads the world on every
// stroke); `keep` tells World.disposeGroup to leave it alone. Key it by theme +
// kind + variant — never by cell, or the cache grows without bound.
const cache = new Map();
export function cached(key, build){
  let g = cache.get(key);
  if(!g){ g = build(); g.userData.keep = true; cache.set(key, g); }
  return g;
}

/* ---------------- materials ---------------- */
// One kit per storey: storeys fade on their own (World.fadeStorey mutates
// materials), so a kit is never shared between storeys. Double-sided so leaf
// ribbons read from below; closed shapes hide their backs behind the depth test.
export function makeKit(){
  return {
    solid:new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.86, side:THREE.DoubleSide }),
    glow:new THREE.MeshBasicMaterial({ vertexColors:true }),        // fruit, caps, windows: unlit = glowing
  };
}
export const kitMesh = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; return m; };

/* ---------------- shading ---------------- */
// Blend faceted and smooth normals: k = 0 crisp facets, 1 fully smooth. Around
// 0.6 keeps the chunky planes but rounds every edge. Returns non-indexed geometry.
export function soften(geo, k = 1){
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.deleteAttribute('normal'); geo.computeVertexNormals();          // faceted on a non-indexed mesh
  if(k <= 0) return geo;
  const pos = geo.attributes.position, nor = geo.attributes.normal, acc = new Map();
  const key = i => `${Math.round(pos.getX(i) * 1e3)},${Math.round(pos.getY(i) * 1e3)},${Math.round(pos.getZ(i) * 1e3)}`;
  for(let i = 0; i < pos.count; i++){
    const id = key(i); let a = acc.get(id); if(!a) acc.set(id, a = new THREE.Vector3());
    a.x += nor.getX(i); a.y += nor.getY(i); a.z += nor.getZ(i);
  }
  for(let i = 0; i < pos.count; i++){
    S.copy(acc.get(key(i))).normalize();
    V.fromBufferAttribute(nor, i).lerp(S, k).normalize(); nor.setXYZ(i, V.x, V.y, V.z);
  }
  return geo;
}

// Paint a colour graded by height: `lo` at the foot (contact shadow), `hi` at the
// top (sky light). y0/y1 default to the geometry's own span; pass the whole
// prop's span to grade several parts as one. `jitter` = small hue/light wobble.
export function tint(geo, hex, { lo = 0.72, hi = 1.06, y0, y1, jitter = 0 } = {}, r = Math.random){
  geo.computeBoundingBox();
  const a = y0 ?? geo.boundingBox.min.y, b = y1 ?? geo.boundingBox.max.y, span = Math.max(1e-4, b - a);
  const base = new THREE.Color(hex);
  if(jitter) base.offsetHSL((r() - 0.5) * jitter * 0.3, 0, (r() - 0.5) * jitter);
  const pos = geo.attributes.position, out = new Float32Array(pos.count * 3);
  for(let i = 0; i < pos.count; i++){
    const f = lo + (hi - lo) * Math.min(1, Math.max(0, (pos.getY(i) - a) / span));
    C.copy(base).multiplyScalar(f); out[i*3] = C.r; out[i*3+1] = C.g; out[i*3+2] = C.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return geo;
}

// Merge parts (each with position + normal + color) into one geometry.
export function bake(parts){
  return mergeGeometries(parts.map(g => {
    g = g.index ? g.toNonIndexed() : g;
    for(const k of Object.keys(g.attributes)) if(k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    return g;
  }));
}

/* ---------------- shapes ---------------- */
// A rounded lump: an icosahedron nudged by seeded noise. detail 1 = chunky,
// 2 = pebble-smooth. The same nudge is applied to every copy of a vertex, so
// seams never split.
export function blob(rad, r, { detail = 1, wobble = 0.12, squash = 1 } = {}){
  const g = new THREE.IcosahedronGeometry(rad, detail), p = g.attributes.position, seen = new Map();
  for(let i = 0; i < p.count; i++){
    V.fromBufferAttribute(p, i);
    const id = `${Math.round(V.x * 1e3)},${Math.round(V.y * 1e3)},${Math.round(V.z * 1e3)}`;
    let s = seen.get(id); if(s === undefined) seen.set(id, s = 1 + (r() - 0.5) * 2 * wobble);
    p.setXYZ(i, V.x * s, V.y * s * squash, V.z * s);
  }
  return g;
}

// A trunk swept along a curve, radius easing r0 (foot) → r1 (top). `rings` > 0
// adds the soft banded bulges of a palm trunk. Open ended: a crown or the
// ground covers the ends.
export function trunk(curve, r0, r1, { segs = 10, radial = 7, rings = 0 } = {}){
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false), p = g.attributes.position;
  for(let i = 0; i <= segs; i++){
    const t = i / segs, c = curve.getPointAt(t);
    const rad = (r0 + (r1 - r0) * t) * (rings ? 1 + 0.14 * Math.max(0, Math.sin(t * rings * Math.PI * 2)) : 1);
    for(let j = 0; j <= radial; j++){
      const k = i * (radial + 1) + j;
      V.fromBufferAttribute(p, k).sub(c).multiplyScalar(rad).add(c); p.setXYZ(k, V.x, V.y, V.z);
    }
  }
  return g;
}

// A leaf ribbon from the origin out along +X: it lifts, then arches over and
// droops. Folded along the midrib (Λ) so it has body from any angle; widest a
// little past the middle with a rounded tip — no knife points.
export function frond(len, width, { lift = 0.3, droop = 0.7, fold = 0.35, segs = 8 } = {}){
  const pos = [], idx = [];
  for(let i = 0; i <= segs; i++){
    const t = i / segs, x = t * len;
    const y = len * (lift * Math.sin(t * Math.PI) * 0.6 + lift * t - droop * t * t);
    const w = width * Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * t)), 0.55);
    pos.push(x, y - fold * w, -w,  x, y, 0,  x, y - fold * w, w);
  }
  for(let i = 0; i < segs; i++){
    const a = i * 3, b = a + 3;
    idx.push(a, a + 1, b,  a + 1, b + 1, b,  a + 1, a + 2, b + 1,  a + 2, b + 2, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
}
