// Trees per theme (biome art). makeTree(T, r, kit) -> THREE.Group standing on
// the tile surface at the origin; userData.sway = the crown World sways.
// r = this cell's own seeded rng; kit = the storey's shared materials (softkit).
// Soft-chunky: a tree is a static trunk mesh + a crown mesh pivoting at the
// trunk top (+ a glow mesh riding the crown, night only) — 2–3 draw calls.
// Shapes grow once per theme · variant · seed and are cached; cells differ by
// size and turn only.
import * as THREE from 'three';
import { rng, hashStr } from './props.js';
import { kitMesh, soften, tint, bake, blob, trunk, frond } from './softkit.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// Colours a theme palette doesn't carry.
const TINTS = {
  jungle:  { trunk:'#7a5333', vine:'#4f9a3c', fern:'#8fcf5a', fernAlt:'#6fb84c' },
  oasis:   { frond:'#7ea457', frondAlt:'#a0bd62', dry:'#c49a5e', date:'#e3863a', bark:'#a87a4c' },
  tropical:{ frondAlt:'#79d462', nut:'#7a5432', nutGreen:'#a3c24a', stem:'#8cb64c', paddle:'#5fcf63', bud:'#a03f6a' },
  urban:   { pot:'#c06d45', rim:'#9a4f31', soil:'#4a3424' },
  mountain:{ snow:'#f4f8fc' },
  night:   { trunk:'#6e5444', leaf:'#3a7a63', leafAlt:'#4a8d74', willow:'#5a9c86', vine:'#4a8d74' },
};

/* ---------------- growing ---------------- */
// Grade parts over their shared height, then bake: [geometry, colour, opts?].
// opts.k = soften (1 smooth … 0 faceted); lo/hi = foot/top light.
function grow(parts){
  let a = Infinity, b = -Infinity;
  for(const [g] of parts){ g.computeBoundingBox(); a = Math.min(a, g.boundingBox.min.y); b = Math.max(b, g.boundingBox.max.y); }
  return bake(parts.map(([g, hex, o = {}]) => tint(soften(g, o.k ?? 1), hex, { y0:a, y1:b, lo:o.lo ?? 0.7, hi:o.hi ?? 1.06 })));
}
// Soft rings of light and shade up a trunk — the old leaf bases of a palm.
function bands(geo, n, h){
  const p = geo.attributes.position, c = geo.attributes.color;
  for(let i = 0; i < p.count; i++){ const f = 0.9 + 0.1 * Math.cos(p.getY(i) / h * n * TAU); c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f); }
  return geo;
}
// A frond turned out of the crown: roll about its rib, pitch up, then swing round.
const leaf = (len, w, o, pitch, az, roll = 0) => frond(len, w, o).rotateX(roll).rotateZ(pitch).rotateY(az);
const at = (g, x, y, z) => g.translate(x, y, z);
const bend = (h, lean) => new THREE.CubicBezierCurve3(P(0, 0, 0), P(0, h * 0.35, 0), P(lean * 0.3, h * 0.72, 0), P(lean, h, 0));

/* ---------------- palms ---------------- */
// A banded trunk along a lean, and a crown of arched fronds: an outer ring that
// droops, an inner ring standing up, optional dry skirt and fruit hanging under.
function palm(sr, c, o){
  const top = P(o.lean, o.h, 0), curve = bend(o.h, o.lean);
  const stem = grow([[trunk(curve, o.r0, o.r1, { segs:16, radial:8, rings:o.rings }), c.bark, { k:0.85, lo:0.62, hi:1.02 }],
    [at(blob(o.r0 * (o.flare ?? 1.45), sr, { wobble:0.08, squash:0.4 }), 0, 0.01, 0), c.bark, { lo:0.62, hi:0.9 }]]);
  if(o.rings) bands(stem, o.rings, o.h);
  const parts = [];
  for(let i = 0; i < o.fronds; i++){
    const az = i / o.fronds * TAU + (sr() - 0.5) * 0.5, l = o.len * (0.85 + sr() * 0.3);
    parts.push([leaf(l, o.w, { lift:o.lift, droop:o.droop * (0.85 + sr() * 0.3), fold:0.42, segs:9 }, o.pitch + (sr() - 0.5) * 0.3, az, (sr() - 0.5) * 0.35), i % 2 ? c.leaf : c.leafAlt]);
  }
  for(let i = 0; i < o.inner; i++){
    const az = (i + 0.5) / o.inner * TAU + sr() * 0.4;
    parts.push([leaf(o.len * 0.6, o.w * 0.85, { lift:0.35, droop:0.55, fold:0.42 }, 1.0 + sr() * 0.25, az), c.leafAlt]);
  }
  for(let i = 0; i < o.skirt; i++){                       // last year's fronds, hanging dry
    const az = i / o.skirt * TAU + sr();
    parts.push([at(leaf(o.len * 0.55, o.w * 0.75, { lift:0, droop:0.15, fold:0.3 }, -1.15 - sr() * 0.25, az), 0, -0.04, 0), c.dry, { lo:0.8, hi:1.0 }]);
  }
  parts.push([blob(o.r1 * 1.5, sr, { wobble:0.1 }), o.heart || c.bark, { lo:0.8, hi:0.95 }]);      // the heart the fronds spring from
  for(let i = 0; i < o.fruit; i++){
    const a = i / o.fruit * TAU + sr(), d = o.r1 * 1.25;
    parts.push([at(blob(o.fruitR * (0.85 + sr() * 0.3), sr, { wobble:0.08 }), Math.cos(a) * d, -0.06 - sr() * 0.05, Math.sin(a) * d), i % 3 ? c.fruit : c.fruitAlt, { lo:0.8, hi:1.1 }]);
  }
  return { stem, crown:grow(parts), top };
}

/* ---------------- canopy trees ---------------- */
// Soft blob cloud canopy: [x, y, z, radius, colour, squash]. Vines hang under it.
function canopy(sr, spots, vines = [], vineCol){
  const parts = spots.map(([x, y, z, rad, hex, sq = 0.85, clipped]) => [at(blob(rad, sr, clipped ? { detail:2, wobble:0.025, squash:sq } : { detail:2, wobble:0.07, squash:sq }), x, y, z), hex]);
  for(const [x, z, len] of vines){
    const v = new THREE.CatmullRomCurve3([P(x, 0, z), P(x * 1.1, -len * 0.5, z * 1.1 + 0.02), P(x * 1.05, -len, z * 1.05)]);
    parts.push([trunk(v, 0.016, 0.011, { segs:5, radial:4 }), vineCol, { lo:0.85, hi:1.0 }]);
    parts.push([at(blob(0.03, sr, { detail:0, wobble:0.1 }), x * 1.05, -len, z * 1.05), vineCol]);
  }
  return grow(parts);
}
// A trunk that splays into roots at its foot (n roots, reach out from the base).
function rootedTrunk(sr, hex, h, lean, r0, r1, n, reach, rh){
  const parts = [[trunk(bend(h, lean), r0, r1, { segs:10, radial:8 }), hex, { k:0.75, lo:0.78, hi:1.15 }]];
  for(let i = 0; i < n; i++){
    const a = i / n * TAU + sr() * 0.6, ca = Math.cos(a), sa = Math.sin(a), d = reach * (0.8 + sr() * 0.4);
    const c = new THREE.QuadraticBezierCurve3(P(ca * r0 * 0.3, rh, sa * r0 * 0.3), P(ca * d * 0.55, rh * 0.25, sa * d * 0.55), P(ca * d, -0.02, sa * d));
    parts.push([trunk(c, r0 * 0.55, r0 * 0.22, { segs:6, radial:5 }), hex, { k:0.75, lo:0.78, hi:1.15 }]);
  }
  return grow(parts);
}

/* ---------------- conifers ---------------- */
// A gumdrop tier: a soft cone with a rolled rim. Snow drapes its shoulders.
const tierProfile = (R, h) => [P(0, -0.01, 0), P(R * 0.8, 0.0, 0), P(R, 0.04, 0), P(R * 0.92, 0.1, 0), P(R * 0.76, h * 0.3, 0), P(R * 0.55, h * 0.55, 0), P(R * 0.3, h * 0.8, 0), P(R * 0.14, h * 0.94, 0), P(0, h, 0)];
function tier(R, h, y){ return new THREE.LatheGeometry(tierProfile(R, h), 10).translate(0, y, 0); }
function snowCap(R, h, y, from){
  const pts = tierProfile(R, h).filter(p => p.y >= h * from).map(p => P(p.x * 1.06 + 0.004, p.y + 0.012, 0));
  pts.unshift(P(pts[0].x * 1.02, pts[0].y - 0.03, 0));                  // a soft lip where the snow ends
  return new THREE.LatheGeometry(pts, 10).translate(0, y, 0);
}
function conifer(sr, c, tiers, snow){
  const parts = [];
  tiers.forEach(([R, h, y], i) => {
    parts.push([tier(R, h, y), i % 2 ? c.leafAlt : c.leaf, { lo:0.62, hi:1.0 }]);
    if(snow != null) parts.push([snowCap(R, h, y, i === tiers.length - 1 ? Math.min(snow, 0.3) : snow), c.snow, { lo:0.92, hi:1.04 }]);
  });
  return grow(parts);
}

/* ---------------- variants ---------------- */
// Each returns { stem?, crown, glow?, top } in tree space (foot at the origin).
const VARIANTS = {
  jungle:[
    (sr, c) => ({                                                       // cloud-canopy broadleaf
      stem:rootedTrunk(sr, c.trunk, 0.6, 0.06, 0.1, 0.065, 3, 0.16, 0.12), top:P(0.06, 0.6, 0),
      crown:canopy(sr, [[0, 0.14, 0, 0.32, c.leaf], [0.22, 0.04, 0.1, 0.22, c.leafAlt], [-0.2, 0.06, -0.08, 0.23, c.leafAlt], [0.02, 0.36, -0.05, 0.22, c.leafAlt], [-0.06, 0.08, 0.22, 0.2, c.leaf]],
        [[0.2, 0.12, 0.3], [-0.16, -0.1, 0.24]], c.vine) }),
    (sr, c) => ({                                                       // tall kapok, buttress roots, umbrella crown
      stem:rootedTrunk(sr, c.trunk, 0.95, 0.05, 0.095, 0.06, 4, 0.24, 0.3), top:P(0.05, 0.95, 0),
      crown:canopy(sr, [[0, 0.1, 0, 0.36, c.leaf, 0.5], [0.26, 0.02, 0.06, 0.22, c.leafAlt, 0.6], [-0.24, 0.03, -0.1, 0.22, c.leafAlt, 0.6], [0.04, 0.26, 0.02, 0.24, c.leafAlt, 0.55], [-0.02, 0.0, 0.26, 0.2, c.leaf, 0.6]],
        [[0.26, -0.18, 0.26]], c.vine) }),
    (sr, c) => palm(sr, { bark:c.trunk, leaf:c.fern, leafAlt:c.fernAlt, dry:c.trunk, fruit:c.fern, fruitAlt:c.fern },   // tree fern
      { h:0.58, lean:0.08, r0:0.055, r1:0.045, rings:0, fronds:12, len:0.5, w:0.07, lift:0.3, droop:0.55, pitch:0.12, inner:4, skirt:0, fruit:0, heart:c.fernAlt }),
  ],
  oasis:[
    (sr, c) => palm(sr, { bark:c.bark, leaf:c.frond, leafAlt:c.frondAlt, dry:c.dry, fruit:c.date, fruitAlt:'#c96a2c' },    // date palm
      { h:1.12, lean:0.16, r0:0.085, r1:0.06, rings:8, fronds:10, len:0.66, w:0.085, lift:0.35, droop:1.0, pitch:0.4, inner:4, skirt:4, fruit:6, fruitR:0.042 }),
    (sr, c) => palm(sr, { bark:c.bark, leaf:c.frond, leafAlt:c.frondAlt, dry:c.dry, fruit:c.date, fruitAlt:c.date },        // short fan palm
      { h:0.4, lean:0.05, r0:0.1, r1:0.085, rings:3, flare:1.2, fronds:12, len:0.46, w:0.115, lift:0.45, droop:0.85, pitch:0.6, inner:5, skirt:3, fruit:0, heart:c.frond }),
  ],
  tropical:[
    (sr, c) => palm(sr, { bark:c.trunk, leaf:c.leaf, leafAlt:c.frondAlt, dry:c.trunk, fruit:c.nut, fruitAlt:c.nutGreen },   // leaning coconut palm
      { h:1.38, lean:0.34, r0:0.075, r1:0.05, rings:10, fronds:8, len:0.74, w:0.1, lift:0.32, droop:1.05, pitch:0.32, inner:3, skirt:0, fruit:4, fruitR:0.058 }),
    (sr, c) => {                                                        // banana plant: paddle leaves on soft stems
      const stems = [], parts = [];
      for(const [x, z, h] of [[0, 0, 0.5], [0.13, 0.08, 0.34], [-0.1, 0.11, 0.26]]){
        stems.push([trunk(bend(h, 0.03), 0.05, 0.036, { segs:6, radial:7 }).translate(x, 0, z), c.stem, { lo:0.65, hi:1.0 }]);
        const n = h > 0.4 ? 6 : 3;
        for(let i = 0; i < n; i++) parts.push([at(leaf(0.36 + h * 0.3, 0.17, { lift:0.25, droop:0.6, fold:0.12, segs:8 }, 0.5 + sr() * 0.4, i / n * TAU + sr() * 0.6, (sr() - 0.5) * 1.1), x, h - 0.5, z), i % 2 ? c.paddle : c.frondAlt]);
      }
      parts.push([at(blob(0.05, sr, { wobble:0.1, squash:1.4 }), 0.06, -0.12, 0.02), c.bud]);
      return { stem:grow(stems), crown:grow(parts), top:P(0, 0.5, 0) };
    },
    (sr, c) => palm(sr, { bark:c.trunk, leaf:c.leaf, leafAlt:c.frondAlt, dry:c.trunk, fruit:c.nut, fruitAlt:c.nut },       // bushy young palm
      { h:0.12, lean:0.02, r0:0.06, r1:0.06, rings:0, flare:1.0, fronds:10, len:0.58, w:0.1, lift:0.5, droop:0.8, pitch:0.85, inner:4, skirt:0, fruit:0, heart:c.leaf }),
  ],
  urban:[
    (sr, c) => planterTree(sr, c, 0.5, [[0, 0.06, 0, 0.27, c.leaf, 0.95, 1]]),     // lollipop topiary
    (sr, c) => planterTree(sr, c, 0.3, [[0, 0.04, 0, 0.21, c.leaf, 0.88, 1], [0, 0.32, 0, 0.16, c.leafAlt, 0.92, 1], [0, 0.53, 0, 0.1, c.leaf, 1, 1]]),   // tiered topiary
  ],
  mountain:[
    (sr, c) => ({ stem:grow([[trunk(bend(0.24, 0), 0.065, 0.05, { segs:3, radial:7 }), c.trunk, { k:0.7, lo:0.6, hi:1.0 }]]), top:P(0, 0.16, 0),   // gumdrop pine
      crown:conifer(sr, c, [[0.37, 0.46, 0], [0.29, 0.4, 0.27], [0.2, 0.34, 0.52]], 0.42) }),
    (sr, c) => ({ stem:grow([[trunk(bend(0.2, 0), 0.05, 0.04, { segs:3, radial:7 }), c.trunk, { k:0.7, lo:0.6, hi:1.0 }]]), top:P(0, 0.14, 0),    // slim spruce
      crown:conifer(sr, c, [[0.27, 0.36, 0], [0.23, 0.33, 0.22], [0.18, 0.3, 0.44], [0.13, 0.28, 0.65], [0.08, 0.24, 0.84]], 0.55) }),
    (sr, c) => ({ top:P(0, 0, 0), crown:grow([                          // snowy bush
      [at(blob(0.24, sr, { wobble:0.1, squash:0.75 }), 0, 0.16, 0), c.leaf], [at(blob(0.17, sr, { wobble:0.1, squash:0.8 }), 0.2, 0.12, 0.08), c.leafAlt], [at(blob(0.15, sr, { wobble:0.1, squash:0.8 }), -0.16, 0.1, -0.12), c.leafAlt],
      [at(blob(0.18, sr, { wobble:0.08, squash:0.4 }), 0.01, 0.3, 0.0), c.snow, { lo:0.95, hi:1.04 }], [at(blob(0.1, sr, { wobble:0.08, squash:0.45 }), 0.21, 0.22, 0.08), c.snow, { lo:0.95, hi:1.04 }]]) }),
  ],
  night:[
    (sr, c) => {                                                        // moonlit broadleaf with glowing fruit
      const v = VARIANTS.jungle[0](sr, c), glow = [];
      for(let i = 0; i < 8; i++){ const a = i / 8 * TAU + sr() * 0.5, y = sr() * 0.3, d = 0.33 - y * 0.3; glow.push([at(blob(0.05, sr, { wobble:0.05 }), Math.cos(a) * d, y, Math.sin(a) * d), c.flora[i % 2 ? 0 : 2], { lo:1, hi:1 }]); }
      return { ...v, glow:grow(glow) };
    },
    (sr, c) => {                                                        // drooping willow, fireflies resting in it
      const parts = [[at(blob(0.32, sr, { wobble:0.08, squash:0.6 }), 0, 0.1, 0), c.leafAlt], [at(blob(0.2, sr, { wobble:0.08, squash:0.7 }), 0.04, 0.24, -0.03), c.leaf]], glow = [];
      for(let i = 0; i < 22; i++){                                     // fine strands from the rim, longest at the front
        const a = i / 22 * TAU + sr() * 0.2, d = 0.27 + sr() * 0.04;
        parts.push([at(leaf(0.32 + sr() * 0.22, 0.032, { lift:0.4, droop:0.05, fold:0.2, segs:6 }, -1.42 - sr() * 0.1, a), Math.cos(a) * d, 0.08, -Math.sin(a) * d), c.willow, { lo:0.6, hi:1.05 }]);
      }
      for(let i = 0; i < 4; i++){ const a = sr() * TAU, d = 0.26; glow.push([at(blob(0.025, sr, { detail:0, wobble:0.05 }), Math.cos(a) * d, -0.1 - sr() * 0.25, Math.sin(a) * d), c.flora[0], { lo:1, hi:1 }]); }
      return { stem:rootedTrunk(sr, c.trunk, 0.6, 0.1, 0.085, 0.06, 3, 0.15, 0.1), top:P(0.1, 0.6, 0), crown:grow(parts), glow:grow(glow) };
    },
  ],
};
// A potted topiary: terracotta planter + clean stem (static), clipped crown on top.
function planterTree(sr, c, h, spots){
  const pot = new THREE.CylinderGeometry(0.25, 0.21, 0.24, 10, 1).translate(0, 0.12, 0);
  const rim = new THREE.TorusGeometry(0.245, 0.03, 6, 12).rotateX(Math.PI / 2).translate(0, 0.235, 0);
  const soil = new THREE.CircleGeometry(0.23, 10).rotateX(-Math.PI / 2).translate(0, 0.225, 0);
  const stem = trunk(new THREE.LineCurve3(P(0, 0.2, 0), P(0, 0.22 + h, 0)), 0.03, 0.024, { segs:2, radial:6 });
  return { stem:grow([[pot, c.pot, { k:0.85, lo:0.65, hi:1.0 }], [rim, c.rim, { lo:0.9, hi:1.05 }], [soil, c.soil, { lo:1, hi:1 }], [stem, c.trunk, { lo:0.9, hi:1.0 }]]),
    top:P(0, 0.22 + h, 0), crown:canopy(sr, spots) };
}

/* ---------------- the tree ---------------- */
// How often each variant grows (the iconic one leads: coconut palms on the lagoon).
const WEIGHTS = { jungle:[0.45, 0.3, 0.25], oasis:[0.65, 0.35], tropical:[0.5, 0.25, 0.25], urban:[0.5, 0.5], mountain:[0.45, 0.35, 0.2], night:[0.6, 0.4] };
const pick = (w, x) => { let i = 0; for(; i < w.length - 1 && x >= w[i]; i++) x -= w[i]; return i; };
const grown = new Map();
function grownOf(T, v, seed){
  const key = `${T.id}:${v}:${seed}`;
  let g = grown.get(key);
  if(!g){
    const c = { ...T, ...TINTS[T.id] };
    g = VARIANTS[T.id][v](rng(hashStr('tree:' + key)), c);
    for(const k of ['stem', 'crown', 'glow']) if(g[k]) g[k].userData.keep = true;   // cached across loads
    grown.set(key, g);
  }
  return g;
}

export function makeTree(T, r, kit){
  if(!VARIANTS[T.id]) T = { ...T, id:'jungle' };
  const v = pick(WEIGHTS[T.id], r());
  const tree = grownOf(T, v, r() < 0.5 ? 0 : 1);
  const g = new THREE.Group();
  if(tree.stem) g.add(kitMesh(tree.stem, kit.solid));
  const crown = kitMesh(tree.crown, kit.solid); crown.position.copy(tree.top); g.add(crown);
  if(tree.glow) crown.add(kitMesh(tree.glow, kit.glow, false));
  g.scale.set(1, 0.94 + r() * 0.12, 1).multiplyScalar(0.88 + r() * 0.24);
  g.rotation.y = r() * TAU;
  g.userData.sway = crown;
  return g;
}
