// @klar/core — Sky Atlas: chunks. Pure and stateless: chunkAt(seed, cx, cz) is a function of
// those three integers ONLY — a chunk never looks at another chunk's output, and still the seams agree.
//
// THE LATTICE. The map is cut into 11×11 QUADRANTS; each holds one isle inside its inner 9×9
// (local tiles 1–9), shaped by a domain-warped noise mask (organic outlines, 30–80 tiles; 100+ where a land neck fuses two), so a
// 16×16 chunk meets 2–4 isles and two neighbouring isles are always ≥ 2 tiles of open sky apart.
// A quadrant is a pure function of (seed, qx, qz) — chunks simply sample the quadrants they overlap.
//
// LINKS (the seam rule). An edge between two adjacent quadrants is on or off by a pure hash of the
// two quadrant coordinates, so BOTH sides compute the same answer without seeing each other:
//   • a binary-tree spanning forest INSIDE each block of 8×8 quadrants (every quadrant links north or
//     east — the classic maze trick) plus one hash-chosen link east and one south between blocks is a
//     spanning tree of the whole infinite lattice ⇒ the world is ONE connected walkable graph and a
//     road can never dead-end at a seam; ~30% of the other edges are on too (loops);
//   • an active link is a short BRIDGE span of 2–4 tiles over open sky (the isles are cleared back from
//     the span, so a bridge never crosses land), or — about one in four — a 3-wide LAND NECK that fuses two
//     isles into a larger "continent" crossing the quadrant seam.
// The socket line of a link, and the span length, are pure hashes of the edge.
//
// HEIGHTS (walkable by construction). Each isle has a base PLATEAU level 0–3 (a biome-ranged hashed
// level, then the rounded mean of a 3×3 neighbourhood — adjacent plateaus differ by ≤ 1). A bridge lies
// at the LOWER plateau's height; the higher isle ends in a STAIR (a `ramp` tile at the lower height,
// facing inland). On top of its plateau an isle has RELIEF from layered global noise, quantised with
// per-biome character (mountain: steep, up to +3, cliffs; jungle: rolling +2; urban: 1-level plateaus;
// oasis: dunes; tropical: nearly flat, lagoons). Every pair of adjacent terraces that differ by 1 gets a
// ramp facing up; a terrace the stairs cannot reach is merged into its neighbour; a drop of 2 or more is
// a cliff. Props (trees, rocks, flora, water) are placed one at a time and kept only if the isle stays
// STRONGLY connected under rules.js's own heightStep — so nothing ever strands Pip.
//
// Cell shape = what parseIsle makes, + overworld-only kinds: { kind, h, ch, dir?, flora?, theme }
// where kind ∈ ground | ramp(dir) | rock | tree | water | void (sky) | bridge | shrine.
import { hash2, vnoise } from './rng.js';
import { biomeAt } from './biome.js';
import { heightStep } from '../isle/rules.js';
import { MOVE_DIRS } from '../isle/format.js';

export const CHUNK = 16, ATLAS_SEED = 1;
export const Q = 11;                      // quadrant (one isle site); the isle lives in local tiles 1–9
const IN = 9;                             // last inner tile
const BQ = 8;                             // quadrants per block of the spanning structure
const EXTRA = 0.3, LAND = 0.28;            // share of non-tree edges that are on; share of links that are land necks
const N = Q * Q;
const RAMP_CH = { U:'^', D:'v', L:'<', R:'>' };
export const WALKABLE = new Set(['ground', 'ramp', 'bridge', 'shrine']);

const fmod = (a, n) => ((a % n) + n) % n;
const D4 = ['U', 'D', 'L', 'R'];

// Small bounded memo (cleared wholesale when full — entries are cheap to rebuild and pure).
const memo = (limit) => { const m = new Map(); return { get:k => m.get(k), set:(k, v) => { if(m.size >= limit) m.clear(); m.set(k, v); return v; } }; };

/* ---------------- the lattice of edges ---------------- */
// The tree edge a quadrant carves: north or east (top row: east; right column: north; the block's
// top-right quadrant is the root and carves nothing).
function carve(seed, qx, qz){
  const lx = fmod(qx, BQ), lz = fmod(qz, BQ);
  if(lz === 0) return lx === BQ - 1 ? null : 'E';
  if(lx === BQ - 1) return 'N';
  return hash2(seed, qx, qz, 31) < 0.5 ? 'E' : 'N';
}
// axis 'E': (qx,qz)—(qx+1,qz).  axis 'S': (qx,qz)—(qx,qz+1).
function edgeOn(seed, qx, qz, axis){
  const lx = fmod(qx, BQ), lz = fmod(qz, BQ), bx = Math.floor(qx / BQ), bz = Math.floor(qz / BQ);
  if(axis === 'E'){
    if(lx === BQ - 1 ? lz === Math.floor(hash2(seed, bx, bz, 32) * BQ) : carve(seed, qx, qz) === 'E') return true;
  } else {
    if(lz === BQ - 1 ? lx === Math.floor(hash2(seed, bx, bz, 33) * BQ) : carve(seed, qx, qz + 1) === 'N') return true;
  }
  return hash2(seed, qx, qz, axis === 'E' ? 34 : 35) < EXTRA;
}

// Plateau: a hashed level inside the biome's range (all ranges lie in 0–3), then the rounded mean of
// the 3×3 around it. Neighbouring means differ by ≤ 1.0, so neighbouring plateaus differ by ≤ 1.
const RAW = { mountain:[3, 3], urban:[2, 3], jungle:[1, 2], oasis:[1, 1], tropical:[0, 0], night:[0, 3] };
const rawMemo = memo(8192), plMemo = memo(8192);
function raw(seed, qx, qz){
  const key = seed + '/' + qx + '/' + qz;
  let v = rawMemo.get(key);
  if(v !== undefined) return v;
  const [lo, hi] = RAW[biomeAt(seed, qx * Q + 5, qz * Q + 5)];
  return rawMemo.set(key, lo + Math.floor(hash2(seed, qx, qz, 41) * (hi - lo + 1)));
}
export function plateau(seed, qx, qz){
  const key = seed + '/' + qx + '/' + qz;
  let v = plMemo.get(key);
  if(v !== undefined) return v;
  let s = 0;
  for(let j = -1; j <= 1; j++) for(let i = -1; i <= 1; i++) s += raw(seed, qx + i, qz + j);
  return plMemo.set(key, Math.round(s / 9));
}

// -> null | { axis, qa, qb, h, land, k, a:[x,z], b:[x,z], gap:[[x,z]…], neck:[[x,z]…] } — global tiles.
// a / b are the two socket tiles (on the isles), gap the 2–4 tiles between them, h the span's height
// (the lower plateau). A land neck's `neck` is the 3-wide strip of ground that fills the gap.
export function edgeInfo(seed, qx, qz, axis){
  if(!edgeOn(seed, qx, qz, axis)) return null;
  const E = axis === 'E', c = E ? 0 : 1;
  const k = 2 + Math.floor(hash2(seed, qx, qz, 36 + c) * 7);                 // socket line 2..8 of the quadrant
  const land = hash2(seed, qx, qz, 38 + c) < LAND;
  const ga = !land && hash2(seed, qx, qz, 40 + c) < 0.4 ? 1 : 0, gb = !land && hash2(seed, qx, qz, 42 + c) < 0.4 ? 1 : 0;
  const sa = IN - ga, sb = 1 + gb;                                           // socket column/row in A (east/south end) and in B (west/north end)
  const qb = E ? [qx + 1, qz] : [qx, qz + 1];
  const h = Math.min(plateau(seed, qx, qz), plateau(seed, qb[0], qb[1]));
  const line = E ? qz * Q + k : qx * Q + k;
  const at = (m, u) => E ? [m, u] : [u, m];
  const a0 = (E ? qx : qz) * Q + sa, b0 = (E ? qb[0] : qb[1]) * Q + sb;
  const gap = [], neck = [];
  for(let m = a0 + 1; m < b0; m++){ gap.push(at(m, line)); if(land) for(const o of [-1, 0, 1]) neck.push(at(m, line + o)); }
  return { axis, qa:[qx, qz], qb, h, land, k, a:at(a0, line), b:at(b0, line), gap, neck };
}

/* ---------------- one isle: layout (mask, terraces, stairs, shrine slots) ---------------- */
const idx = (x, z) => z * Q + x;
const inQ = (x, z) => x >= 0 && z >= 0 && x < Q && z < Q;
const nb = (i, d) => { const x = i % Q + MOVE_DIRS[d][0], z = ((i / Q) | 0) + MOVE_DIRS[d][1]; return inQ(x, z) ? idx(x, z) : -1; };

// forward and reverse step graphs of the isle for the tiles in `mask`, by rules.js's heightStep
function stepGraph(mask, h, ramp){
  const cell = i => ramp[i] ? { kind:'ramp', h:h[i], dir:ramp[i] } : { kind:'ground', h:h[i] };
  const fwd = Array.from({ length:N }, () => []), rev = Array.from({ length:N }, () => []);
  for(let i = 0; i < N; i++){
    if(!mask[i]) continue;
    for(const d of D4){
      const j = nb(i, d); if(j < 0 || !mask[j]) continue;
      if(heightStep({ cells:[cell(i), cell(j)] }, 0, 1, d, 0)){ fwd[i].push(j); rev[j].push(i); }
    }
  }
  return { fwd, rev };
}
// strongly connected (every unblocked tile reaches the hub and is reached from it), ignoring `blocked`
function strong(mask, g, hub, blocked){
  let total = 0;
  for(let i = 0; i < N; i++) if(mask[i] && !blocked[i]) total++;
  for(const adj of [g.fwd, g.rev]){
    const seen = new Uint8Array(N), st = [hub]; seen[hub] = 1; let n = 1;
    while(st.length){ const i = st.pop(); for(const j of adj[i]) if(!seen[j] && !blocked[j]){ seen[j] = 1; n++; st.push(j); } }
    if(n !== total) return false;
  }
  return true;
}

const layMemo = memo(4000);
export function isleLayout(seed, qx, qz){
  const key = seed + '/' + qx + '/' + qz;
  return layMemo.get(key) || layMemo.set(key, buildLayout(seed, qx, qz));
}

// Relief thresholds per biome: relief = how many of them the (0–1) terrain value exceeds. Close
// thresholds make cliffs (mountain), far ones gentle single steps.
const RELIEF = {
  mountain:[0.26, 0.36, 0.47, 0.60], jungle:[0.40, 0.62], urban:[0.50], oasis:[0.58], tropical:[0.70], night:[0.38, 0.60, 0.80],
};

function buildLayout(seed, qx, qz){
  const ox = qx * Q, oz = qz * Q, H = k => hash2(seed, qx, qz, k);
  const cx = 4 + Math.floor(H(1) * 3), cz = 4 + Math.floor(H(2) * 3), hub = idx(cx, cz);
  const pl = plateau(seed, qx, qz), theme = biomeAt(seed, ox + cx, oz + cz);
  const R = 3.3 + 2.3 * Math.pow(H(3), 0.8), ax = 0.85 + 0.35 * H(4), az = 2 - ax - 0.1;

  // 1. an organic disc: an ellipse whose rim is wobbled by two octaves of domain-warped global noise
  let mask = new Uint8Array(N);
  for(let z = 1; z <= IN; z++) for(let x = 1; x <= IN; x++){
    const gx = ox + x, gz = oz + z;
    const wx = gx + (vnoise(seed, gx, gz, 6, 82) - 0.5) * 3.2, wz = gz + (vnoise(seed, gx, gz, 6, 83) - 0.5) * 3.2;
    const d = Math.hypot((wx - ox - cx) / (R * ax), (wz - oz - cz) / (R * az));
    if(d < 1 + (vnoise(seed, gx, gz, 4.5, 80) - 0.5) * 0.7 + (vnoise(seed, gx, gz, 2.2, 81) - 0.5) * 0.3) mask[idx(x, z)] = 1;
  }
  mask[hub] = 1; for(const d of D4) mask[nb(hub, d)] = 1;

  // 2. links: clear the sky lane in front of each socket (a bridge never crosses land), then carve a corridor
  //    from the hub to the socket so it is always reachable
  const sides = [
    ['E', edgeInfo(seed, qx, qz, 'E'), i => ({ sx:i.a[0] - ox, sz:i.k }), [qx + 1, qz], 'L'],
    ['W', edgeInfo(seed, qx - 1, qz, 'E'), i => ({ sx:i.b[0] - ox, sz:i.k }), [qx - 1, qz], 'R'],
    ['S', edgeInfo(seed, qx, qz, 'S'), i => ({ sx:i.k, sz:i.a[1] - oz }), [qx, qz + 1], 'U'],
    ['N', edgeInfo(seed, qx, qz - 1, 'S'), i => ({ sx:i.k, sz:i.b[1] - oz }), [qx, qz - 1], 'D'],
  ];
  const links = [];
  for(const [side, info, sock, other, inward] of sides){
    if(!info) continue;
    const { sx, sz } = sock(info);
    for(let z = 1; z <= IN; z++) for(let x = 1; x <= IN; x++){
      const along = side === 'E' ? x > sx : side === 'W' ? x < sx : side === 'S' ? z > sz : z < sz;
      const across = side === 'E' || side === 'W' ? Math.abs(z - sz) <= 1 : Math.abs(x - sx) <= 1;
      if(along && across) mask[idx(x, z)] = 0;
    }
    links.push({ side, sx, sz, s:idx(sx, sz), inward, drop:pl > plateau(seed, other[0], other[1]) });
  }
  for(let pass = 0; pass < 2; pass++) for(let i = 0; i < N; i++){          // no slivers: drop one-neighbour spurs
    if(!mask[i] || i === hub) continue;
    let n = 0; for(const d of D4){ const j = nb(i, d); if(j >= 0 && mask[j]) n++; }
    if(n <= 1) mask[i] = 0;
  }
  const keep = new Uint8Array(N), pin = new Uint8Array(N);                // keep: props never go here · pin: flat, no stair
  keep[hub] = 1;
  for(const L of links){
    const { sx, sz, side } = L, horiz = side === 'E' || side === 'W', path = [];
    if(horiz){ for(let z = Math.min(cz, sz); z <= Math.max(cz, sz); z++) path.push([cx, z]); for(let x = Math.min(cx, sx); x <= Math.max(cx, sx); x++) path.push([x, sz]); }
    else { for(let x = Math.min(cx, sx); x <= Math.max(cx, sx); x++) path.push([x, cz]); for(let z = Math.min(cz, sz); z <= Math.max(cz, sz); z++) path.push([sx, z]); }
    for(const [x, z] of path){ mask[idx(x, z)] = 1; keep[idx(x, z)] = 1; }
    L.i = nb(L.s, L.inward); pin[L.s] = 1; pin[L.i] = 1; keep[L.s] = keep[L.i] = 1;
  }
  { const seen = new Uint8Array(N), st = [hub]; seen[hub] = 1;              // keep only the hub's piece
    while(st.length){ const i = st.pop(); for(const d of D4){ const j = nb(i, d); if(j >= 0 && mask[j] && !seen[j]){ seen[j] = 1; st.push(j); } } }
    mask = seen; }

  // 3. relief on top of the plateau: layered global noise, a gentle dome, quantised by the biome
  const rel = new Int8Array(N);
  for(let i = 0; i < N; i++){
    if(!mask[i] || pin[i]) continue;
    const gx = ox + i % Q, gz = oz + ((i / Q) | 0), bt = biomeAt(seed, gx, gz), T = RELIEF[bt];
    const n = 0.60 * vnoise(seed, gx, gz, 17, 90) + 0.30 * vnoise(seed, gx, gz, 8.5, 91) + 0.10 * vnoise(seed, gx, gz, 4.2, 92);
    const dome = Math.max(0, 1 - Math.hypot((i % Q - cx) / (R * ax), (((i / Q) | 0) - cz) / (R * az)) ** 2);
    const v = (n - 0.5) * 1.7 + 0.5 + dome * 0.22 + (bt === 'mountain' ? 0.1 : 0);
    let r = 0; for(const t of T) if(v > t) r++;
    rel[i] = r;
  }
  // near a pinned tile the ground eases down to the plateau, one level a tile
  const pins = []; for(let i = 0; i < N; i++) if(pin[i]) pins.push(i);
  const dist = i => { let b = 99; for(const p of pins) b = Math.min(b, Math.abs(i % Q - p % Q) + Math.abs(((i / Q) | 0) - ((p / Q) | 0))); return b; };
  const near = new Int8Array(N); for(let i = 0; i < N; i++) near[i] = mask[i] ? dist(i) : 99;
  for(let i = 0; i < N; i++) if(mask[i] && !pin[i]) rel[i] = Math.min(rel[i], Math.floor(near[i] / 3));      // terraces ≥ 3 tiles wide near a link
  for(let pass = 0; pass < 6; pass++) for(let i = 0; i < N; i++) if(mask[i]) for(const d of ['R', 'D']){
    const j = nb(i, d); if(j < 0 || !mask[j] || (near[i] > 4 && near[j] > 4)) continue;
    const a = rel[i], b = rel[j];
    if(Math.abs(a - b) <= 1) continue;
    if(a > b ? !pin[i] : !pin[j]){ if(a > b) rel[i] = b + 1; else rel[j] = a + 1; }
  }

  for(let pass = 0; pass < 3; pass++) for(let i = 0; i < N; i++){          // despeckle: a tile alone at its level joins its neighbours
    if(!mask[i] || pin[i]) continue;
    const ns = []; for(const d of D4){ const j = nb(i, d); if(j >= 0 && mask[j]) ns.push(rel[j]); }
    if(ns.length && !ns.includes(rel[i])){ ns.sort((a, b) => a - b); rel[i] = ns[ns.length >> 1]; }
  }
  // 4. stairs between terraces; repair what they cannot reach; flatten as the last resort
  const h = new Int8Array(N), ramp = new Array(N).fill(null);
  const setH = () => { for(let i = 0; i < N; i++) h[i] = mask[i] ? Math.min(5, pl + rel[i]) : 0; };
  let graph = null, ok = false;
  for(let cut = 0; cut <= 4 && !ok; cut++){
    if(cut) for(let i = 0; i < N; i++) rel[i] = pin[i] ? 0 : Math.max(0, rel[i] - 1);
    for(let it = 0; it < 14 && !ok; it++){
      setH();
      const P = planStairs(seed, ox, oz, mask, h, pin, hub);
      if(P.fix){ for(const i of P.fix.tiles) rel[i] = Math.max(0, P.fix.h - pl); continue; }
      ramp.fill(null); for(const [i, d] of P.ramps) ramp[i] = d;
      for(const L of links) if(L.drop){ ramp[L.s] = L.inward; h[L.s] = pl - 1; }
      graph = stepGraph(mask, h, ramp);
      ok = strong(mask, graph, hub, new Uint8Array(N));
      if(!ok) break;
    }
  }
  if(!ok){                                                                 // a flat isle at the plateau is always valid
    rel.fill(0); setH(); ramp.fill(null);
    for(const L of links) if(L.drop){ ramp[L.s] = L.inward; h[L.s] = pl - 1; }
    graph = stepGraph(mask, h, ramp);
  }

  // 5. shrine slots: a clear 3×3 of open flat ground in the inner 5×5 of the quadrant (so two shrines are always ≥ 4 apart)
  let area = 0; for(let i = 0; i < N; i++) area += mask[i];
  const open = i => {
    const x = i % Q, z = (i / Q) | 0;
    if(x < 3 || x > 7 || z < 3 || z > 7 || pin[i] || ramp[i]) return false;
    for(let dz = -1; dz <= 1; dz++) for(let dx = -1; dx <= 1; dx++){
      const j = idx(x + dx, z + dz);
      if(!mask[j] || ramp[j] || h[j] !== h[i]) return false;
    }
    return true;
  };
  const slots = [];
  const best = (skip) => { let bi = -1, bv = -1; for(let i = 0; i < N; i++){ if(!mask[i] || !open(i) || (skip && Math.max(Math.abs(i % Q - skip % Q), Math.abs(((i / Q) | 0) - ((skip / Q) | 0))) < 5)) continue; const v = hash2(seed, ox + i % Q, oz + ((i / Q) | 0), 61); if(v > bv){ bv = v; bi = i; } } return bi; };
  if(area >= 20 && H(60) < 0.9){
    const s1 = best(null);
    if(s1 >= 0){ slots.push(s1); if(area >= 36 && H(62) < 0.55){ const s2 = best(s1); if(s2 >= 0) slots.push(s2); } }
  }
  for(const s of slots) for(let dz = -1; dz <= 1; dz++) for(let dx = -1; dx <= 1; dx++) keep[idx(s % Q + dx, ((s / Q) | 0) + dz)] = 1;
  return { qx, qz, ox, oz, theme, pl, mask, h, ramp, keep, pin, hub, slots, graph, area };
}

// Stairs for every pair of adjacent terraces (levels differing by 1). A stair is a tile on the LOWER terrace,
// facing the higher one, with plain floor of its own height behind it. Returns { ramps:Map(tile -> dir) } or
// { fix:{ tiles, h } } — a terrace to merge into its neighbour's height (no stair fits, or only cliffs reach it).
function planStairs(seed, ox, oz, mask, h, pin, hub){
  const comp = new Int16Array(N).fill(-1), size = []; let nc = 0;
  for(let s = 0; s < N; s++){
    if(!mask[s] || comp[s] >= 0) continue;
    const st = [s]; comp[s] = nc; let n = 0;
    while(st.length){ const i = st.pop(); n++; for(const d of D4){ const j = nb(i, d); if(j >= 0 && mask[j] && comp[j] < 0 && h[j] === h[i]){ comp[j] = nc; st.push(j); } } }
    size.push(n); nc++;
  }
  const hasPin = new Array(nc).fill(false); for(let i = 0; i < N; i++) if(pin[i]) hasPin[comp[i]] = true;
  const pairs = new Map(), touch = new Map();                     // "lo|hi" -> candidates ; "a|b" -> boundary length (any height gap)
  for(let t = 0; t < N; t++){
    if(!mask[t]) continue;
    for(const d of D4){
      const u = nb(t, d); if(u < 0 || !mask[u] || comp[u] === comp[t]) continue;
      touch.set(comp[t] + '|' + comp[u], (touch.get(comp[t] + '|' + comp[u]) || 0) + 1);
      if(h[u] !== h[t] + 1) continue;
      const key = comp[t] + '|' + comp[u]; if(!pairs.has(key)) pairs.set(key, []);
      const back = { U:'D', D:'U', L:'R', R:'L' }[d], bi = nb(t, back);
      if(!pin[t] && bi >= 0 && mask[bi] && !pin[bi] && h[bi] === h[t])
        pairs.get(key).push({ t, d, behind:bi, w:hash2(seed, ox + t % Q, oz + ((t / Q) | 0), 70 + D4.indexOf(d)) });
    }
  }
  const merge = (a, b) => {                                       // lower the smaller (pin-free) terrace to the other's height
    const [x, y] = size[a] <= size[b] ? [a, b] : [b, a], victim = hasPin[x] && !hasPin[y] ? y : x, other = victim === x ? y : x;
    const tiles = []; for(let i = 0; i < N; i++) if(comp[i] === victim && !pin[i]) tiles.push(i);
    return { fix:{ tiles, h:hlevel(other) } };
  };
  const hlevel = c => { for(let i = 0; i < N; i++) if(comp[i] === c) return h[i]; return 0; };
  const out = new Map(), floors = new Set();                     // floors: tiles some stair needs as plain floor behind it
  for(const [key, cands] of [...pairs].sort((a, b) => a[0] < b[0] ? -1 : 1)){
    cands.sort((a, b) => a.w - b.w);
    const c = cands.find(c => !out.has(c.t) && !out.has(c.behind) && !floors.has(c.t));
    if(!c){ const [a, b] = key.split('|').map(Number); return merge(a, b); }
    out.set(c.t, c.d); floors.add(c.behind);
  }
  // every terrace must be reachable from the hub's through stairs (cliffs of 2+ do not connect)
  const adj = Array.from({ length:nc }, () => new Set());
  for(const key of pairs.keys()){ const [a, b] = key.split('|').map(Number); adj[a].add(b); adj[b].add(a); }
  const seen = new Set([comp[hub]]), st = [comp[hub]];
  while(st.length){ const c = st.pop(); for(const n of adj[c]) if(!seen.has(n)){ seen.add(n); st.push(n); } }
  if(seen.size < nc){
    let lost = -1; for(let c = 0; c < nc; c++) if(!seen.has(c) && (lost < 0 || size[c] < size[lost])) lost = c;
    let best = -1, bl = -1;
    for(const [key, len] of touch){ const [a, b] = key.split('|').map(Number); if(a === lost && len > bl){ bl = len; best = b; } }
    if(best < 0) return { fix:{ tiles:[...Array(N).keys()].filter(i => comp[i] === lost && !pin[i]), h:h[hub] } };
    const tiles = []; for(let i = 0; i < N; i++) if(comp[i] === lost && !pin[i]) tiles.push(i);
    return { fix:{ tiles, h:hlevel(best) } };
  }
  return { ramps:out };
}

/* ---------------- one isle: props ---------------- */
// per-tile chances: tree, rock, flowers, a single water tile (ponds and lagoons are grown separately)
const DENS = {
  jungle:   { T:0.30, '#':0.03, ',':0.14, '~':0.01 },
  oasis:    { T:0.06, '#':0.04, ',':0.07, '~':0.02 },
  tropical: { T:0.09, '#':0.02, ',':0.20, '~':0.00 },
  urban:    { T:0.04, '#':0.05, ',':0.03, '~':0.00 },     // plus clustered rock "buildings" below
  mountain: { T:0.04, '#':0.18, ',':0.04, '~':0.01 },
  night:    { T:0.12, '#':0.10, ',':0.08, '~':0.04 },
};
const POND = { jungle:0.20, oasis:0.7, tropical:0.2, urban:0, mountain:0.08, night:0.25 };
const KIND = { T:'tree', '#':'rock', '~':'water' };

const isleMemo = memo(2500);
export function isleOf(seed, qx, qz){
  const key = seed + '/' + qx + '/' + qz;
  return isleMemo.get(key) || isleMemo.set(key, buildIsle(seed, qx, qz));
}

function buildIsle(seed, qx, qz){
  const L = isleLayout(seed, qx, qz), { mask, hub, ox, oz, keep, ramp } = L;
  const prop = new Array(N).fill('');                       // '' | ',' | 'T' | '#' | '~'
  const blocked = new Uint8Array(N);
  const floor = []; for(let i = 0; i < N; i++) if(mask[i] && !keep[i] && !ramp[i] && !L.pin[i]) floor.push(i);
  const gx = i => ox + i % Q, gz = i => oz + ((i / Q) | 0);
  const order = floor.slice().sort((a, b) => hash2(seed, gx(a), gz(a), 71) - hash2(seed, gx(b), gz(b), 71));
  const cap = Math.floor(floor.length * 0.5);
  let placed = 0;
  const tryBlock = i => {
    if(placed >= cap) return false;
    blocked[i] = 1;
    if(strong(mask, L.graph, hub, blocked)){ placed++; return true; }
    blocked[i] = 0; return false;
  };
  for(const i of order){
    const x = gx(i), z = gz(i), bt = biomeAt(seed, x, z), d = DENS[bt], u = hash2(seed, x, z, 72);
    if(bt === 'urban' && vnoise(seed, x, z, 3.4, 95) > 0.60 && u < 0.8){ if(tryBlock(i)) prop[i] = '#'; continue; }     // a block of "buildings"
    if(bt === 'tropical' && vnoise(seed, x, z, 5, 96) > 0.66){ if(tryBlock(i)) prop[i] = '~'; continue; }              // a lagoon
    if(u < d.T){ if(tryBlock(i)) prop[i] = 'T'; }
    else if(u < d.T + d['#']){ if(tryBlock(i)) prop[i] = '#'; }
    else if(u < d.T + d['#'] + d['~']){ if(tryBlock(i)) prop[i] = '~'; }
    else if(u < d.T + d['#'] + d['~'] + d[',']) prop[i] = ',';
  }
  // a pool: a seed tile plus a few neighbours, each kept only if the isle stays connected
  if(order.length > 8 && hash2(seed, qx, qz, 73) < POND[L.theme]){
    const s = order.find(i => !prop[i] || prop[i] === ',');
    if(s !== undefined){
      const pool = [s]; const want = 3 + Math.floor(hash2(seed, qx, qz, 74) * 5);
      for(let k = 0; k < pool.length && pool.length < want; k++)
        for(const d of D4){ const j = nb(pool[k], d);
          if(j >= 0 && order.includes(j) && !pool.includes(j) && pool.length < want && !prop[j]) pool.push(j); }
      for(const i of pool) if(tryBlock(i)) prop[i] = '~';
    }
  }
  return { ...L, prop };
}

/* ---------------- spawn ---------------- */
// The hub tile of quadrant (0,0): always walkable, always jungle (site (0,0) is a fixed jungle).
export function spawnOf(seed){ const L = isleLayout(seed, 0, 0); return { x:L.hub % Q, z:(L.hub / Q) | 0 }; }

/* ---------------- the chunk ---------------- */
// -> { cx, cz, cells:Array(256) row-major (z*16 + x, local), bridges:[{x, z, axis, h}] (global tiles),
//      shrines:[{x, z, key:'w/x,z', kind:'slot'}] (global tiles) }
export function chunkAt(seed, cx, cz){
  const X0 = cx * CHUNK, Z0 = cz * CHUNK;
  const cells = new Array(CHUNK * CHUNK), bridges = [], shrines = [];
  for(let z = 0; z < CHUNK; z++) for(let x = 0; x < CHUNK; x++) cells[z * CHUNK + x] = { kind:'void', h:0, ch:'-', theme:biomeAt(seed, X0 + x, Z0 + z) };
  const inside = (x, z) => x >= X0 && x < X0 + CHUNK && z >= Z0 && z < Z0 + CHUNK;
  const put = (x, z, c) => { const i = (z - Z0) * CHUNK + (x - X0); cells[i] = { ...c, theme:cells[i].theme }; };

  const q0x = Math.floor(X0 / Q), q1x = Math.floor((X0 + CHUNK - 1) / Q), q0z = Math.floor(Z0 / Q), q1z = Math.floor((Z0 + CHUNK - 1) / Q);
  for(let qz = q0z; qz <= q1z; qz++) for(let qx = q0x; qx <= q1x; qx++){
    const I = isleOf(seed, qx, qz);
    for(let i = 0; i < N; i++){
      if(!I.mask[i]) continue;
      const x = I.ox + (i % Q), z = I.oz + ((i / Q) | 0);
      if(!inside(x, z)) continue;
      const p = I.prop[i];
      if(I.slots.includes(i)){ put(x, z, { kind:'shrine', h:I.h[i], ch:'.' }); shrines.push({ x, z, key:`w/${x},${z}`, kind:'slot' }); }
      else if(I.ramp[i]) put(x, z, { kind:'ramp', h:I.h[i], ch:RAMP_CH[I.ramp[i]], dir:I.ramp[i] });
      else if(p === 'T' || p === '#' || p === '~') put(x, z, { kind:KIND[p], h:I.h[i], ch:p });
      else if(p === ',') put(x, z, { kind:'ground', h:I.h[i], ch:',', flora:true });
      else put(x, z, { kind:'ground', h:I.h[i], ch:'.' });
    }
  }
  for(let qz = q0z - 1; qz <= q1z; qz++) for(let qx = q0x - 1; qx <= q1x; qx++) for(const axis of ['E', 'S']){
    const e = edgeInfo(seed, qx, qz, axis);
    if(!e) continue;
    if(e.land){ for(const [x, z] of e.neck) if(inside(x, z)){ const f = hash2(seed, x, z, 75) < 0.25; put(x, z, f ? { kind:'ground', h:e.h, ch:',', flora:true } : { kind:'ground', h:e.h, ch:'.' }); } }
    else for(const [x, z] of e.gap) if(inside(x, z)){ put(x, z, { kind:'bridge', h:e.h, ch:'=' }); bridges.push({ x, z, axis, h:e.h }); }
  }
  shrines.sort((a, b) => a.z - b.z || a.x - b.x);
  bridges.sort((a, b) => a.z - b.z || a.x - b.x);
  return { cx, cz, cells, bridges, shrines };
}
