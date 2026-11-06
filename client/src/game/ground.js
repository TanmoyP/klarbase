// Ground-level biome art per theme: rocks, flora tiles and the scatter sprinkled
// over open ground. Soft-chunky (softkit.js): each variant bakes into one solid
// geometry (+ one glow geometry where the biome glows), cached by theme, drawn on
// the storey's kit materials. Per-cell variety is only a turn and a scale, so the
// cache stays a few variants per theme. r = the cell's seeded rng; kit = the
// storey's shared materials.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { LV, rng, hashStr } from './props.js';
import { cached, kitMesh, soften, tint, bake, blob, frond } from './softkit.js';

const TAU = Math.PI * 2, CA = new THREE.Color(), CB = new THREE.Color(), CC = new THREE.Color();
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Colours the theme palette doesn't carry (T stays presentation-only).
const X = {
  jungle:{ moss:'#6fae58', cap:'#e2483d', capAlt:'#f2e3c6', stem:'#f3ead6', spot:'#fff6e8' },
  oasis:{ cactus:'#7ea65a', agave:'#86b39e', dry:'#dcb35e', band:'#eebf8a', bloom:'#ff7fae' },
  tropical:{ sand:'#d8c8ad', coral:'#ff7f8e', coralAlt:'#ffa64d', lilac:'#b99bff', star:'#ff9150', shell:'#fff1e2', torch:'#ff4f6f' },
  urban:{ pot:'#c9774f', box:'#6e4f39', awning:'#e2617c', brick:'#a5583f', slate:'#5d566a', tank:'#8b6a4e', unlit:'#2f2a3a' },
  mountain:{ snow:'#fbfdff', granite:'#6c7788', shrub:'#2f6a4f', felt:'#f4f6ee', heather:'#c4b6ff' },
  night:{ stem:'#cfd6ee', moon:'#f2efff' },
};
const themeKey = T => (X[T.id] ? T.id : 'jungle');

/* ---------------- painting ---------------- */
// By facing: `base` on the sides, `top` where the surface looks up (moss, snow,
// sun-bleached rims) with a mottled edge; darker toward the foot. Needs normals.
function capTint(geo, base, top, { from = 0.3, to = 0.65, lo = 0.68, hi = 1.05, y0 = 0, y1 = 0.8, mottle = 0.14 } = {}){
  const pos = geo.attributes.position, nor = geo.attributes.normal, out = new Float32Array(pos.count * 3);
  CA.set(base); CB.set(top);
  for(let i = 0; i < pos.count; i++){
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = nor.getY(i) + Math.sin(x * 23.1 + z * 7.3) * Math.cos(z * 19.7 - x * 5.1) * mottle;
    const f = lo + (hi - lo) * Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    CC.copy(CA).lerp(CB, sstep(from, to, n)).multiplyScalar(f);
    out[i*3] = CC.r; out[i*3+1] = CC.g; out[i*3+2] = CC.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return geo;
}
// Wavy horizontal strata (sandstone); flat tops lighten to `top`.
function bandTint(geo, cols, top, { band = 0.115, lo = 0.74, hi = 1.04, y1 = 0.7 } = {}){
  const pos = geo.attributes.position, nor = geo.attributes.normal, out = new Float32Array(pos.count * 3);
  CB.set(top);
  for(let i = 0; i < pos.count; i++){
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = Math.floor(y / band + Math.sin(Math.atan2(z, x) * 2 + 1.3) * 0.22);
    CC.set(cols[((k % cols.length) + cols.length) % cols.length]).lerp(CB, sstep(0.65, 0.9, nor.getY(i)));
    CC.multiplyScalar(lo + (hi - lo) * Math.min(1, Math.max(0, y / y1)));
    out[i*3] = CC.r; out[i*3+1] = CC.g; out[i*3+2] = CC.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return geo;
}

/* ---------------- parts ---------------- */
// scale, tilt (x then z), turn, then move into place
function at(g, x = 0, y = 0, z = 0, { s = 1, sy = s, rx = 0, rz = 0, ry = 0 } = {}){
  if(s !== 1 || sy !== 1) g.scale(s, sy, s);
  if(rx) g.rotateX(rx); if(rz) g.rotateZ(rz); if(ry) g.rotateY(ry);
  return g.translate(x, y, z);
}
const lump = (rad, r, x, y, z, o = {}, k = 0.6) => soften(at(blob(rad, r, { detail:o.detail ?? 1, wobble:o.wobble ?? 0.13, squash:o.squash ?? 0.78 }), x, y, z), k);
const ball = (rad, w = 7, h = 5) => new THREE.SphereGeometry(rad, w, h);
const rbox = (w, h, d, rad = 0.04) => new RoundedBoxGeometry(w, h, d, 2, rad);
const lathe = (pts, segs = 10) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), segs);
// a frond rooted at (x,y,z) heading out along angle `ry`, tilted up by `rz`
const leaf = (len, w, x, y, z, ry, o = {}, rz = 0) => soften(at(frond(len, w, o), x, y, z, { rz, ry }), 1);

// A five-petal bloom facing up at (x,y,z), plus its stem down to the ground.
function bloom(T, x, y, z, petal, size, { centre = '#ffd25e', stem = T.leaf, n = 5, cup = 0.35 } = {}){
  const out = [];
  for(let k = 0; k < n; k++){
    const p = at(ball(size, 6, 4), 0, 0, 0, { s:1 }); p.scale(1.3, 0.38, 0.85);
    p.translate(size * 0.95, 0, 0); p.rotateZ(cup); p.rotateY(k * TAU / n); p.translate(x, y, z);
    out.push(tint(soften(p, 1), petal, { lo:0.85, hi:1.08 }));
  }
  out.push(tint(soften(at(ball(size * 0.5, 6, 4), x, y + size * 0.15, z), 1), centre, { lo:0.9, hi:1.1 }));
  if(stem && y > 0.04) out.push(tint(soften(at(new THREE.CylinderGeometry(0.008, 0.011, y, 4), x, y / 2, z), 1), stem, { lo:0.6, hi:1 }));
  return out;
}
// A mushroom: pale stem, domed cap (on `capList` — kit.glow at night), optional spots.
function shroom(x, z, h, rc, capHex, stemHex, solid, capList, spots){
  solid.push(tint(soften(at(new THREE.CylinderGeometry(rc * 0.28, rc * 0.38, h, 7), x, h / 2, z), 1), stemHex, { lo:0.7, hi:1 }));
  const cap = at(new THREE.SphereGeometry(rc, 10, 5, 0, TAU, 0, Math.PI / 2), x, h - rc * 0.1, z, { s:1, sy:0.62 });
  capList.push(tint(soften(cap, 1), capHex, { lo:0.78, hi:1.12 }));
  solid.push(tint(soften(at(new THREE.CircleGeometry(rc * 0.92, 10), x, h - rc * 0.1, z, { rx:Math.PI / 2 }), 1), stemHex, { lo:0.85, hi:0.85 }));
  if(spots) for(let k = 0; k < 3; k++){
    const a = k * 2.2 + x * 9, e = 0.8 + k * 0.1;
    solid.push(tint(soften(at(ball(rc * 0.17, 5, 3), x + Math.cos(a) * rc * 0.6 * e, h - rc * 0.1 + rc * 0.5, z + Math.sin(a) * rc * 0.6 * e, { s:1, sy:0.45 }), 1), spots, { lo:1, hi:1 }));
  }
}
// A hexagonal crystal with a short pyramid tip (faceted on purpose — it's a gem).
const crystal = (len, rad, x, y, z, rx, rz, hex) =>
  tint(soften(at(lathe([[0, 0], [rad, 0], [rad * 0.88, len], [0, len + rad * 1.2]], 6), x, y, z, { rx, rz }), 0), hex, { lo:0.7, hi:1.3 });
// Upright grass blades in a little fan.
function blades(n, len, w, hex, x, z, r, { lean = 0.35, lo = 0.55, hi = 1.15 } = {}){
  const out = [];
  for(let k = 0; k < n; k++){
    const b = frond(len * (0.75 + r() * 0.5), w, { lift:0.12, droop:0.3 + r() * 0.3, fold:0.2, segs:4 });
    out.push(tint(soften(at(b, x, 0, z, { rz:Math.PI / 2 - lean * (0.4 + r()), ry:k * TAU / n + r() }), 1), hex, { lo, hi }));
  }
  return out;
}

/* ---------------- variant cache ---------------- */
// One entry = { s: solid geometry, g: glow geometry | null }, built once per theme
// + kind + variant with a seed of its own (never per cell).
const pairs = new Map();
function variant(key, build){
  let p = pairs.get(key);
  if(!p){
    const solid = [], glow = [];
    build(rng(hashStr(key)), solid, glow);
    p = { s:bake(solid), g:glow.length ? bake(glow) : null };
    p.s.userData.keep = true; if(p.g) p.g.userData.keep = true;
    pairs.set(key, p);
  }
  return p;
}
function place(p, kit, shadow = true){
  const g = new THREE.Group();
  g.add(kitMesh(p.s, kit.solid, shadow));
  if(p.g) g.add(kitMesh(p.g, kit.glow, false));
  return g;
}

/* ---------------- rocks ---------------- */
// A rock tile blocks movement: it fills the tile (~0.85) and reads as solid.
const ROCKS = {
  jungle:[
    (T, r, S) => {                                  // mossy round boulders
      for(const [rad, x, y, z, sq] of [[0.37, 0, 0.25, 0, 0.8], [0.2, 0.27, 0.1, 0.19, 0.75], [0.14, -0.27, 0.06, -0.2, 0.7]])
        S.push(capTint(lump(rad, r, x, y, z, { squash:sq }), T.rock, X.jungle.moss, { y1:0.55 }));
    },
    (T, r, S) => {                                  // stacked river stones with a fern
      for(const [rad, x, y, z, sq] of [[0.36, 0, 0.1, 0, 0.42], [0.25, 0.04, 0.27, -0.03, 0.5], [0.16, -0.02, 0.41, 0.02, 0.58]])
        S.push(capTint(lump(rad, r, x, y, z, { detail:2, wobble:0.08, squash:sq }, 0.85), T.rock, X.jungle.moss, { from:0.55, to:0.85, y1:0.5 }));
      for(let k = 0; k < 5; k++){ const a = 0.4 + k * 0.5; S.push(tint(leaf(0.27, 0.055, Math.cos(a) * 0.24, 0.03, -Math.sin(a) * 0.24, a, { lift:0.7, droop:1.15, fold:0.3 }), T.leafAlt, { lo:0.6, hi:1.1 })); }
    },
  ],
  oasis:[
    (T, r, S) => {                                  // wind-smoothed layered sandstone mesa
      const g = lathe([[0, 0], [0.43, 0], [0.445, 0.06], [0.42, 0.2], [0.385, 0.245], [0.39, 0.285], [0.365, 0.42], [0.33, 0.465], [0.335, 0.5], [0.3, 0.62], [0.26, 0.675], [0, 0.69]], 11);
      const ph = r() * 6, p = g.attributes.position;
      for(let i = 0; i < p.count; i++){ const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), s = 1 + 0.07 * Math.sin(3 * a + ph) + 0.04 * Math.sin(5 * a); p.setXYZ(i, x * s, p.getY(i), z * s); }
      S.push(bandTint(soften(g, 0.6), [T.rockTop, T.rock, X.oasis.band, T.rock], X.oasis.band));
    },
    (T, r, S) => {                                  // rounded desert boulders
      for(const [rad, x, y, z, sq] of [[0.36, -0.03, 0.22, 0, 0.72], [0.21, 0.26, 0.1, -0.21, 0.7], [0.1, -0.3, 0.04, 0.26, 0.6]])
        S.push(capTint(lump(rad, r, x, y, z, { squash:sq, wobble:0.1 }), T.rock, T.rockTop, { from:0.35, to:0.75, y1:0.5 }));
    },
  ],
  tropical:[
    (T, r, S) => {                                  // smooth beach rocks with a starfish
      for(const [rad, x, y, z, sq] of [[0.38, 0, 0.26, 0, 0.74], [0.22, -0.27, 0.11, 0.21, 0.66], [0.14, 0.3, 0.06, 0.23, 0.62]])
        S.push(capTint(lump(rad, r, x, y, z, { detail:2, wobble:0.09, squash:sq }, 0.9), T.rock, X.tropical.sand, { from:0.35, to:0.8, lo:0.55, y1:0.55 }));
      S.push(...starfish(X.tropical.star, 0.07, 0.53, 0.05, 0.3));
    },
    (T, r, S) => {                                  // coral clump on a sandy stone
      const n0 = S.length;
      S.push(capTint(lump(0.3, r, 0, 0.12, 0, { squash:0.5, wobble:0.12 }), T.rock, X.tropical.sand, { from:0.4, to:0.8, lo:0.55, y1:0.3 }));
      const fingers = (n, x, z, len0, len1, rad, hex) => { for(let k = 0; k < n; k++){       // finger coral, rounded tips
        const a = k * TAU / n + r() * 0.5, len = len0 + r() * (len1 - len0), tilt = 0.12 + r() * 0.45;
        const f = new THREE.CapsuleGeometry(rad, len, 3, 7).translate(0, len / 2, 0).rotateZ(tilt).rotateY(a);
        S.push(tint(soften(f.translate(x + Math.cos(a) * 0.05, 0.16, z - Math.sin(a) * 0.05), 1), hex, { lo:0.75, hi:1.2 }));
      } };
      fingers(8, 0.08, -0.04, 0.26, 0.44, 0.05, X.tropical.coral);
      fingers(4, -0.2, 0.15, 0.14, 0.22, 0.042, X.tropical.coralAlt);
      S.push(capTint(lump(0.12, r, -0.16, 0.26, -0.2, { detail:2, squash:0.85, wobble:0.05 }, 1), X.tropical.lilac, '#e6d2ff', { from:0.2, to:0.9, mottle:0.4, y0:0.15, y1:0.4 }));   // brain coral
      for(let i = n0; i < S.length; i++) S[i].scale(1.3, 1.2, 1.3);            // fill the tile: it blocks
    },
  ],
  urban:[
    (T, r, S, G) => house(T, r, S, G, { h:1.2, body:X.urban.brick, roof:X.urban.slate, rows:4, tower:true }),
    (T, r, S, G) => house(T, r, S, G, { h:0.8, body:T.rock, roof:X.urban.pot, rows:2, shop:true }),
    (T, r, S, G) => house(T, r, S, G, { h:0.95, body:X.urban.slate, roof:T.lip, rows:3, chimneys:true }),
  ],
  mountain:[
    (T, r, S) => {                                  // granite boulder, soft snow cap
      for(const [rad, x, y, z, sq] of [[0.38, 0, 0.26, 0, 0.78], [0.18, 0.28, 0.09, 0.2, 0.75], [0.12, -0.3, 0.05, -0.18, 0.7]])
        S.push(capTint(lump(rad, r, x, y, z, { squash:sq, wobble:0.14 }, 0.55), X.mountain.granite, X.mountain.snow, { from:0.3, to:0.5, lo:0.62, y1:0.55, mottle:0.1 }));
    },
    (T, r, S) => {                                  // tall crag
      for(const [rad, x, y, z, sq] of [[0.3, -0.04, 0.4, -0.02, 1.4], [0.24, 0.19, 0.22, 0.13, 1.05], [0.17, -0.23, 0.1, 0.18, 0.8]])
        S.push(capTint(lump(rad, r, x, y, z, { squash:sq, wobble:0.15 }, 0.5), X.mountain.granite, X.mountain.snow, { from:0.35, to:0.55, lo:0.6, y1:0.8, mottle:0.1 }));
    },
  ],
  night:[
    (T, r, S, G) => {                               // mossy stone with a crystal cluster
      S.push(capTint(lump(0.35, r, 0, 0.22, 0, { squash:0.74 }), T.rock, T.rockTop, { from:0.45, to:0.75, y1:0.5 }));
      S.push(capTint(lump(0.17, r, -0.27, 0.07, 0.2, { squash:0.7 }), T.rock, T.rockTop, { from:0.45, to:0.75, y1:0.5 }));
      for(const [len, rad, x, y, z, rx, rz] of [[0.42, 0.085, 0.08, 0.28, 0.02, 0.2, -0.35], [0.3, 0.07, -0.08, 0.3, -0.1, -0.4, 0.3], [0.22, 0.055, 0.22, 0.16, 0.18, 0.5, -0.6]])
        G.push(crystal(len, rad, x, y, z, rx, rz, T.crystal));
    },
    (T, r, S, G) => {                               // two stones, crystal spires between
      S.push(capTint(lump(0.27, r, -0.19, 0.16, 0.1), T.rock, T.rockTop, { from:0.45, to:0.75, y1:0.45 }));
      S.push(capTint(lump(0.23, r, 0.21, 0.13, -0.12), T.rock, T.rockTop, { from:0.45, to:0.75, y1:0.45 }));
      for(const [len, rad, x, z, rx, rz] of [[0.58, 0.09, 0.02, 0.02, 0.05, -0.1], [0.4, 0.07, -0.1, -0.15, -0.3, 0.2], [0.34, 0.065, 0.13, 0.17, 0.35, -0.3], [0.24, 0.055, -0.13, 0.21, 0.4, 0.45]])
        G.push(crystal(len, rad, x, 0, z, rx, rz, T.crystal));
    },
  ],
};
function starfish(hex, x, y, z, s = 0.3){
  const out = [];
  const u = s / 0.3;
  for(let k = 0; k < 5; k++){
    const arm = new THREE.CapsuleGeometry(0.03 * u, 0.09 * u, 2, 6).rotateZ(Math.PI / 2).translate(0.055 * u, 0, 0).rotateY(k * TAU / 5);
    out.push(tint(soften(arm.scale(1, 0.45, 1).translate(x, y, z), 1), hex, { lo:0.9, hi:1.1 }));
  }
  return out;
}
// A soft little building: rounded body, roof lip, windows (lit ones on kit.glow),
// plus a water tower, a shopfront awning or chimneys. Built facing +Z.
function house(T, r, S, G, { h, body, roof, rows, tower, shop, chimneys }){
  const w = 0.8;
  S.push(tint(at(rbox(w, h, w, 0.06), 0, h / 2, 0), body, { lo:0.72, hi:1.02 }));
  S.push(tint(at(rbox(w + 0.08, 0.08, w + 0.08, 0.035), 0, h + 0.02, 0), roof, { lo:0.9, hi:1.05 }));
  const win = (x, y, face, lit) => {
    const g = new THREE.BoxGeometry(0.13, 0.15, 0.04).translate(x, y, w / 2).rotateY(face * Math.PI / 2);
    (lit ? G : S).push(tint(g, lit ? T.accent : X.urban.unlit, { lo:lit ? 0.95 : 0.8, hi:lit ? 1.15 : 1 }));
  };
  for(let f = 0; f < 4; f++) for(let row = 0; row < rows; row++) for(const c of [-0.2, 0.2]){
    if(shop && f === 0) continue;
    win(c, 0.26 + row * 0.27, f, r() < 0.6);
  }
  if(shop){                                         // door, two lit shop windows, striped awning
    S.push(tint(at(rbox(0.22, 0.4, 0.05, 0.02), 0, 0.2, w / 2), T.woodDark, { lo:0.7, hi:1 }));
    win(-0.26, 0.3, 0, true); win(0.26, 0.3, 0, true);
    const aw = at(rbox(0.74, 0.035, 0.2, 0.015), 0, 0.58, w / 2 + 0.08, { rx:0.38 }), p = aw.attributes.position, out = new Float32Array(p.count * 3);
    for(let i = 0; i < p.count; i++){ CC.set(Math.floor((p.getX(i) + 0.37) / 0.0925) % 2 ? '#fff6ec' : X.urban.awning); out.set([CC.r, CC.g, CC.b], i * 3); }
    aw.setAttribute('color', new THREE.BufferAttribute(out, 3)); S.push(aw);
  }
  if(tower){                                        // water tower on the roof
    for(const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1], [-0.1, 0.1]]) S.push(tint(at(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 4), x + 0.12, h + 0.12, z - 0.1), T.woodDark, { lo:0.8, hi:1 }));
    S.push(tint(soften(at(new THREE.CylinderGeometry(0.14, 0.15, 0.2, 10), 0.12, h + 0.3, -0.1), 0.7), X.urban.tank, { lo:0.75, hi:1.05 }));
    S.push(tint(soften(at(new THREE.SphereGeometry(0.16, 10, 4, 0, TAU, 0, Math.PI / 2), 0.12, h + 0.4, -0.1, { s:1, sy:0.5 }), 1), X.urban.slate, { lo:0.9, hi:1.1 }));
  }
  if(chimneys) for(const [x, z, ch] of [[-0.2, -0.18, 0.28], [0.16, 0.2, 0.2]]){
    S.push(tint(at(rbox(0.13, ch, 0.13, 0.03), x, h + ch / 2, z), X.urban.brick, { lo:0.8, hi:1.05 }));
    S.push(tint(at(rbox(0.16, 0.04, 0.16, 0.015), x, h + ch, z), '#3a3340', { lo:1, hi:1 }));
  }
}

export function makeRock(T, r, kit){
  const id = themeKey(T), list = ROCKS[id], v = r() * list.length | 0;
  const g = place(variant(`${id}:rock:${v}`, (rr, S, G) => list[v](T, rr, S, G)), kit);
  if(id === 'urban') g.rotation.y = (r() * 4 | 0) * Math.PI / 2;            // buildings stay square to the grid
  else { g.rotation.y = r() * TAU; g.scale.set(0.94 + r() * 0.1, 0.9 + r() * 0.2, 0.94 + r() * 0.1); }
  return g;
}

/* ---------------- flora tiles ---------------- */
// Walkable decoration: low (≲ 0.3) and gathered off-centre, so Pip stays visible.
const FLORA = {
  jungle:[
    (T, r, S) => {                                  // ferns and a pair of mushrooms
      for(let k = 0; k < 6; k++){ const a = k * TAU / 6 + r() * 0.4; S.push(tint(leaf(0.26, 0.05, -0.12, 0.01, 0.08, a, { lift:0.75, droop:1.25, fold:0.3 }), k % 2 ? T.leaf : T.leafAlt, { lo:0.55, hi:1.1 })); }
      shroom(0.2, -0.14, 0.09, 0.07, X.jungle.cap, X.jungle.stem, S, S, X.jungle.spot);
      shroom(0.26, 0.06, 0.06, 0.045, X.jungle.capAlt, X.jungle.stem, S, S);
    },
    (T, r, S) => {                                  // a leafy mound in bloom
      for(const [rad, x, z] of [[0.13, -0.16, 0.1], [0.11, 0.14, -0.16], [0.09, 0.2, 0.16]])
        S.push(tint(lump(rad, r, x, rad * 0.4, z, { squash:0.6 }, 1), T.leaf, { lo:0.6, hi:1.1 }));
      for(const [x, y, z, c] of [[-0.18, 0.15, 0.06, 0], [-0.08, 0.13, 0.16, 1], [0.14, 0.13, -0.12, 2], [0.22, 0.11, 0.18, 0]])
        S.push(...bloom(T, x, y, z, T.flora[c], 0.03));
    },
    (T, r, S) => {                                  // a mushroom ring and a little fern
      for(const [x, z, h, rc, red] of [[-0.2, -0.1, 0.12, 0.07, 1], [-0.1, -0.24, 0.07, 0.045, 0], [0.2, -0.16, 0.09, 0.055, 1], [0.18, 0.2, 0.06, 0.04, 0]])
        shroom(x, z, h, rc, red ? X.jungle.cap : X.jungle.capAlt, X.jungle.stem, S, S, red ? X.jungle.spot : null);
      for(let k = 0; k < 4; k++) S.push(tint(leaf(0.2, 0.045, -0.16, 0.01, 0.16, k * 1.6 + 0.3, { lift:0.8, droop:1.3, fold:0.3 }), T.leafAlt, { lo:0.55, hi:1.1 }));
    },
  ],
  oasis:[
    (T, r, S) => {                                  // barrel cacti, one in flower
      for(const [rad, x, z, fl] of [[0.11, -0.12, 0.08, 1], [0.065, 0.12, 0.16, 0], [0.05, 0.16, -0.16, 0]]){
        const g = new THREE.SphereGeometry(rad, 14, 9), p = g.attributes.position;
        for(let i = 0; i < p.count; i++){ const x0 = p.getX(i), z0 = p.getZ(i), s = 1 + 0.09 * Math.cos(10 * Math.atan2(z0, x0)); p.setXYZ(i, x0 * s, p.getY(i) * 1.15, z0 * s); }
        S.push(tint(soften(g.translate(x, rad * 1.0, z), 1), X.oasis.cactus, { lo:0.65, hi:1.1 }));
        if(fl) S.push(...bloom(T, x, rad * 2.1, z, X.oasis.bloom, 0.026, { cup:0.6 }));
      }
      for(const [x, z] of [[0.02, -0.22], [-0.26, -0.12]]) S.push(tint(lump(0.035, r, x, 0.012, z, { squash:0.6 }, 0.6), T.rockTop, { lo:0.8, hi:1 }));
    },
    (T, r, S) => {                                  // agave rosette
      for(let k = 0; k < 7; k++) S.push(tint(leaf(0.22, 0.042, 0.04, 0.01, -0.02, k * TAU / 7 + 0.2, { lift:1.1, droop:1.0, fold:0.6 }), X.oasis.agave, { lo:0.6, hi:1.12 }));
      for(let k = 0; k < 4; k++) S.push(tint(leaf(0.15, 0.036, 0.04, 0.02, -0.02, k * TAU / 4 + 0.9, { lift:1.7, droop:1.1, fold:0.6 }), X.oasis.agave, { lo:0.7, hi:1.15 }));
    },
    (T, r, S) => {                                  // golden dry grass and pebbles
      for(const [x, z, n] of [[-0.18, 0.1, 8], [0.16, -0.14, 7], [0.2, 0.2, 5]]) S.push(...blades(n, 0.22, 0.016, X.oasis.dry, x, z, r, { lean:0.55, lo:0.6, hi:1.15 }));
      for(const [x, z] of [[0.0, -0.24], [-0.24, -0.16], [0.02, 0.24]]) S.push(tint(lump(0.035, r, x, 0.012, z, { squash:0.6 }, 0.6), T.rock, { lo:0.8, hi:1.05 }));
    },
  ],
  tropical:[
    (T, r, S) => {                                  // hibiscus bush
      for(const [rad, x, y, z] of [[0.13, -0.12, 0.09, 0.05], [0.1, 0.06, 0.07, -0.13], [0.09, 0.14, 0.06, 0.12]])
        S.push(tint(lump(rad, r, x, y, z, { squash:0.72 }, 1), T.leaf, { lo:0.55, hi:1.1 }));
      for(const [x, y, z, c] of [[-0.14, 0.21, 0.1, 0], [0.08, 0.16, -0.16, 1], [0.18, 0.14, 0.15, 0]]){
        S.push(...bloom(T, x, y, z, T.flora[c], 0.045, { centre:'#ffe36b', cup:0.55, stem:T.leaf }));
        S.push(tint(at(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 4), x, y + 0.04, z, { rz:0.4 }), '#ffe36b', { lo:1, hi:1 }));
      }
    },
    (T, r, S) => {                                  // bird-of-paradise
      for(let k = 0; k < 5; k++) S.push(tint(leaf(0.28, 0.05, -0.05, 0.01, 0.05, k * TAU / 5 + 0.3, { lift:1.0, droop:0.95, fold:0.25 }, 0.25), k % 2 ? T.leaf : T.leafAlt, { lo:0.55, hi:1.1 }));
      for(const [x, z, a] of [[-0.06, 0.08, 0.4], [0.06, -0.04, 2.6]]){
        S.push(tint(soften(at(new THREE.CylinderGeometry(0.009, 0.012, 0.2, 4), x, 0.1, z), 1), T.leafAlt, { lo:0.6, hi:1 }));
        S.push(tint(leaf(0.1, 0.018, x, 0.2, z, a, { lift:0.05, droop:0.05, fold:0.3, segs:4 }), '#5f8a6a', { lo:0.8, hi:1 }));          // the beak
        for(let k = 0; k < 3; k++) S.push(tint(leaf(0.1, 0.016, x, 0.205, z, a + 0.25 * (k - 1), { lift:1.4, droop:0.5, fold:0.2, segs:4 }), k === 1 ? '#4a6fe0' : T.flora[1], { lo:0.9, hi:1.15 }));
      }
    },
    (T, r, S) => {                                  // torch ginger
      for(let k = 0; k < 5; k++) S.push(tint(leaf(0.26, 0.045, 0, 0.01, 0, k * TAU / 5, { lift:0.55, droop:0.9, fold:0.25 }), T.leafAlt, { lo:0.55, hi:1.1 }));
      for(const [x, z, h] of [[-0.12, 0.1, 0.18], [0.14, -0.08, 0.14]]){
        S.push(tint(soften(at(new THREE.CylinderGeometry(0.008, 0.011, h, 4), x, h / 2, z), 1), T.leaf, { lo:0.6, hi:1 }));
        for(let ring = 0; ring < 4; ring++) for(let k = 0; k < 5; k++){
          const a = k * TAU / 5 + ring * 0.6, rad = 0.045 * (1 - ring * 0.2);
          S.push(tint(soften(at(ball(0.026 * (1 - ring * 0.15), 6, 4), x + Math.cos(a) * rad, h + ring * 0.025, z + Math.sin(a) * rad, { s:1, sy:0.7 }), 1), X.tropical.torch, { lo:0.85, hi:1.15 }));
        }
      }
    },
  ],
  urban:[
    (T, r, S) => {                                  // terracotta pots
      for(const [x, z, s, fl] of [[-0.2, 0.14, 1.15, -1], [0.17, -0.17, 1, 0], [0.22, 0.18, 0.8, 1]]){
        S.push(tint(soften(at(lathe([[0, 0], [0.06, 0], [0.074, 0.1], [0.086, 0.104], [0.086, 0.122], [0.07, 0.122], [0, 0.112]], 10), x, 0, z, { s }), 0.8), X.urban.pot, { lo:0.7, hi:1.05 }));
        S.push(tint(lump(0.075 * s, r, x, 0.17 * s, z, { squash:0.9 }, 1), T.leafAlt, { lo:0.6, hi:1.1 }));
        if(fl >= 0) S.push(...bloom(T, x + 0.02, 0.22 * s, z, T.flora[fl], 0.024));
      }
    },
    (T, r, S) => {                                  // a flower box along one edge
      S.push(tint(at(rbox(0.66, 0.12, 0.18, 0.025), 0, 0.06, -0.3), X.urban.box, { lo:0.7, hi:1 }));
      for(let k = 0; k < 4; k++) S.push(tint(lump(0.06, r, -0.24 + k * 0.16, 0.14, -0.3, { squash:0.8 }, 1), T.leaf, { lo:0.6, hi:1.05 }));
      for(let k = 0; k < 5; k++) S.push(...bloom(T, -0.27 + k * 0.135, 0.18, -0.28 + (k % 2) * 0.03, T.flora[k % T.flora.length], 0.024));
    },
  ],
  mountain:[
    (T, r, S) => {                                  // heather tufts
      for(const [x, z] of [[-0.2, 0.1], [-0.06, 0.24], [0.18, -0.16], [0.22, 0.12], [-0.12, -0.2]]){
        S.push(tint(lump(0.06, r, x, 0.03, z, { squash:0.6 }, 1), T.leaf, { lo:0.6, hi:1 }));
        for(let k = 0; k < 4; k++){ const a = k * 1.7 + x * 10; S.push(tint(lump(0.032, r, x + Math.cos(a) * 0.03, 0.07 + k * 0.014, z + Math.sin(a) * 0.03, { squash:1.2 }, 1), k % 2 ? T.flora[0] : X.mountain.heather, { lo:0.85, hi:1.1 })); }
      }
    },
    (T, r, S) => {                                  // edelweiss on a felt rosette, a snowy pebble
      for(let k = 0; k < 7; k++) S.push(tint(leaf(0.12, 0.03, -0.1, 0.01, 0.05, k * TAU / 7, { lift:0.4, droop:0.6, fold:0.2, segs:5 }), '#8fa39a', { lo:0.75, hi:1.05 }));
      for(const [x, y, z] of [[-0.12, 0.07, 0.04], [-0.04, 0.09, 0.12], [0.16, 0.06, -0.14]]) S.push(...bloom(T, x, y, z, X.mountain.felt, 0.022, { n:7, centre:'#ffd76b', cup:0.15, stem:'#8fa39a' }));
      S.push(capTint(lump(0.07, r, 0.2, 0.04, 0.17, { squash:0.7 }, 0.6), T.rock, X.mountain.snow, { from:0.4, to:0.6, y1:0.1 }));
    },
    (T, r, S) => {                                  // snowy shrubs
      for(const [rad, x, z] of [[0.12, -0.15, 0.1], [0.09, 0.16, -0.12], [0.06, 0.18, 0.18]])
        S.push(capTint(lump(rad, r, x, rad * 0.65, z, { squash:0.85 }, 1), X.mountain.shrub, X.mountain.snow, { from:0.5, to:0.75, lo:0.7, y1:0.25, mottle:0.12 }));
      S.push(tint(lump(0.08, r, -0.02, 0.005, -0.18, { squash:0.35 }, 1), X.mountain.snow, { lo:0.85, hi:1.02 }));
    },
  ],
  night:[
    (T, r, S, G) => {                               // glowing mushrooms
      for(const [x, z, h, rc, c] of [[-0.18, 0.08, 0.16, 0.075, 2], [-0.06, 0.2, 0.09, 0.05, 1], [0.18, -0.14, 0.12, 0.06, 0], [0.22, 0.12, 0.07, 0.04, 2]])
        shroom(x, z, h, rc, T.flora[c], X.night.stem, S, G);
      for(let k = 0; k < 4; k++) S.push(tint(leaf(0.16, 0.035, 0.0, 0.01, -0.05, k * 1.6, { lift:0.6, droop:1.2, fold:0.3 }), T.leafAlt, { lo:0.5, hi:1 }));
    },
    (T, r, S, G) => {                               // moonflowers
      for(let k = 0; k < 6; k++) S.push(tint(leaf(0.22, 0.055, -0.04, 0.01, 0.02, k * TAU / 6 + 0.2, { lift:0.6, droop:1.1, fold:0.25 }), k % 2 ? T.leaf : T.leafAlt, { lo:0.5, hi:1 }));
      for(const [x, y, z] of [[-0.14, 0.16, 0.08], [0.1, 0.13, -0.14], [0.16, 0.1, 0.16]]){
        G.push(...bloom(T, x, y, z, X.night.moon, 0.035, { centre:T.flora[1], cup:0.5, stem:null }));
        S.push(tint(soften(at(new THREE.CylinderGeometry(0.008, 0.011, y, 4), x, y / 2, z), 1), T.leafAlt, { lo:0.5, hi:1 }));
      }
    },
  ],
};
export function makeFlora(T, r, kit){
  const id = themeKey(T), list = FLORA[id], v = r() * list.length | 0;
  // ankle-high decor: its shadow is barely visible, so skip the shadow pass (halves its cost)
  const g = place(variant(`${id}:flora:${v}`, (rr, S, G) => list[v](T, rr, S, G)), kit, false);
  g.rotation.y = id === 'urban' ? (r() * 4 | 0) * Math.PI / 2 : r() * TAU;
  g.scale.setScalar(1.25 + r() * 0.2);
  return g;
}

/* ---------------- scatter ---------------- */
// Little things sprinkled over open ground ('.' tiles only), two or three kinds per
// theme. Kept low (< 0.12) and in a ring off the tile centre, where Pip and the
// pieces stand. `rim` kinds only grow on tiles at the isle edge. Each kind's
// geometry is cached white-ish; a palette tints every copy as it is baked.
const SCAT = {
  grass:(T, r) => bake(blades(3, 0.11, 0.013, '#ffffff', 0, 0, r, { lean:0.4, lo:0.55, hi:1.1 })),
  clover:(T, r) => bake([0, 1, 2].map(k => tint(soften(at(ball(0.022, 6, 3), 0.02, 0.008, 0, { s:1, sy:0.35, ry:k * TAU / 3 }), 1), '#ffffff', { lo:0.85, hi:1.05 }))),
  shroom:() => { const S = []; shroom(0, 0, 0.045, 0.026, '#ffffff', '#f3ead6', S, S); return bake(S); },
  pebble:(T, r) => bake([tint(lump(0.034, r, 0, 0.008, 0, { squash:0.55, wobble:0.18 }, 0.55), '#ffffff', { lo:0.75, hi:1.05 })]),
  dry:(T, r) => bake(blades(4, 0.12, 0.012, '#ffffff', 0, 0, r, { lean:0.6, lo:0.6, hi:1.1 })),
  cactus:() => bake([tint(soften(at(new THREE.CapsuleGeometry(0.018, 0.045, 3, 8), 0, 0.04, 0), 1), '#ffffff', { lo:0.7, hi:1.1 }),
    tint(soften(at(new THREE.CapsuleGeometry(0.01, 0.02, 2, 6), 0.022, 0.05, 0, { rz:-0.5 }), 1), '#ffffff', { lo:0.8, hi:1.1 })]),
  shell:() => bake([tint(soften(at(new THREE.SphereGeometry(0.03, 8, 3, 0, Math.PI, 0, Math.PI / 2), 0, 0, 0, { s:1, sy:0.45 }), 1), '#ffffff', { lo:0.8, hi:1.08 })]),
  star:() => bake(starfish('#ffffff', 0, 0.006, 0, 0.12)),
  leafy:() => bake([tint(soften(at(frond(0.06, 0.018, { lift:0.06, droop:0.12, fold:0.15, segs:3 }), -0.03, 0.006, 0), 1), '#ffffff', { lo:0.85, hi:1.05 })]),
  weed:(T, r) => bake(blades(3, 0.07, 0.011, '#ffffff', 0, 0, r, { lean:0.5, lo:0.6, hi:1.1 })),
  snow:(T, r) => bake([tint(lump(0.075, r, 0, 0, 0, { squash:0.38, wobble:0.1 }, 1), '#ffffff', { lo:0.86, hi:1.02 })]),
  frost:(T, r) => bake(blades(3, 0.08, 0.012, '#ffffff', 0, 0, r, { lean:0.4, lo:0.6, hi:1.1 })),
  speck:() => bake([tint(at(ball(0.012, 5, 4), 0, 0.02, 0), '#ffffff', { lo:1, hi:1 })]),
};
// per theme: [type, per-tile density, palette, glow?, rim-only?]
const SCATTER = {
  jungle:[['grass', 2.2, ['leafAlt', 'leaf', 'topAlt']], ['clover', 0.5, ['leafAlt', 'leaf']], ['shroom', 0.12, ['#e2483d', '#f2e3c6']]],
  oasis:[['pebble', 1.0, ['lip', 'rock', 'rockTop']], ['dry', 0.7, ['#dcb35e', '#c99a4a', '#e8c878']], ['cactus', 0.08, ['#7ea65a', '#6a9450']]],
  tropical:[['grass', 2.0, ['leafAlt', 'leaf', 'topAlt']], ['shell', 0.9, ['#fff1e2', '#ffc4c4', '#ffd9a8'], false, true], ['star', 0.35, ['#ff9150', '#ff6f8a', '#ffb04a'], false, true]],
  urban:[['pebble', 0.8, ['lip', 'rock', '#b5b9c4']], ['leafy', 0.7, ['#e8873a', '#f0c24a', '#c9543a', '#7a9a4a']], ['weed', 0.35, ['leafAlt', 'leaf']]],
  mountain:[['snow', 1.3, ['#ffffff', '#eef5fc']], ['pebble', 0.6, ['rock', 'strata']], ['frost', 0.35, ['#cfe3d6', '#b9d3c4']]],
  night:[['grass', 1.8, ['leafAlt', 'leaf']], ['clover', 0.4, ['leafAlt', 'leaf']], ['speck', 0.7, ['flora'], true]],
};
const hexOf = (T, name, r) => name === 'flora' ? T.flora[r() * T.flora.length | 0] : name === 'strata' ? T.strata[0] : name.startsWith('#') ? name : T[name];

export function makeScatter(level, T, centre, kit){
  const id = themeKey(T), W = level.w, H = level.h;
  const open = (x, z) => x < 0 || z < 0 || x >= W || z >= H || level.cells[z*W + x].kind === 'void';
  const types = SCATTER[id].map(([type, density, palette, glow, rim]) => ({ type, density, palette, glow, rim, pts:[] }));
  for(let z = 0; z < H; z++) for(let x = 0; x < W; x++){
    const c = level.cells[z*W + x];
    if(c.kind !== 'ground' || c.ch !== '.') continue;
    const edge = open(x + 1, z) || open(x - 1, z) || open(x, z + 1) || open(x, z - 1);
    const r = rng(hashStr(`${id}:${x},${z}:${c.h}`));          // per tile: painting one never reshuffles the rest
    for(const t of types){
      if(t.rim && !edge) continue;
      let n = Math.floor(t.density) + (r() < t.density % 1 ? 1 : 0);
      while(n-- > 0){
        const a = r() * TAU, d = 0.2 + r() * 0.26, k = r(), j = r();
        t.pts.push([x - centre[0] + Math.cos(a) * d, c.h * LV, z - centre[1] + Math.sin(a) * d, k, j, hexOf(T, t.palette[(k * 7.3 | 0) % t.palette.length], r)]);
      }
    }
  }
  // Bake every instance into one static mesh per material: one draw call per
  // storey (two at night), cheaper than an InstancedMesh per type.
  const group = new THREE.Group();
  for(const glow of [false, true]){
    const list = types.filter(t => !!t.glow === glow && t.pts.length);
    if(!list.length) continue;
    const geo = bakeScatter(list.map(t => ({ src:cached(`${id}:scatter:${t.type}`, () => SCAT[t.type](T, rng(hashStr(id + t.type)))), pts:t.pts })));
    const m = kitMesh(geo, glow ? kit.glow : kit.solid, false); m.receiveShadow = !glow;
    group.add(m);
  }
  return group.children.length ? group : null;
}
function bakeScatter(list){
  let n = 0; for(const { src, pts } of list) n += src.attributes.position.count * pts.length;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), K = new Float32Array(n * 3);
  const m4 = new THREE.Matrix4(), n3 = new THREE.Matrix3(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), v = new THREE.Vector3(), cl = new THREE.Color();
  let o = 0;
  for(const { src, pts } of list){
    const sp = src.attributes.position, sn = src.attributes.normal, sk = src.attributes.color;
    for(const [x, y, z, k, j, hex] of pts){
      e.set((k - 0.5) * 0.25, k * TAU, (j - 0.5) * 0.25); q.setFromEuler(e);
      sc.setScalar(0.75 + j * 0.55); ps.set(x, y, z); m4.compose(ps, q, sc); n3.getNormalMatrix(m4);
      cl.set(hex).multiplyScalar(0.9 + j * 0.2);
      for(let i = 0; i < sp.count; i++, o += 3){
        v.fromBufferAttribute(sp, i).applyMatrix4(m4); P[o] = v.x; P[o+1] = v.y; P[o+2] = v.z;
        v.fromBufferAttribute(sn, i).applyMatrix3(n3).normalize(); N[o] = v.x; N[o+1] = v.y; N[o+2] = v.z;
        K[o] = sk.getX(i) * cl.r; K[o+1] = sk.getY(i) * cl.g; K[o+2] = sk.getZ(i) * cl.b;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(K, 3));
  return g;
}
