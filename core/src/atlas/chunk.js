// @klar/core — Sky Atlas: chunks. Pure and stateless: chunkAt(seed, cx, cz) is a function of
// those three integers ONLY — a chunk never looks at another chunk, and still the seams agree.
//
// THE LATTICE. The map is cut into 8×8 QUADRANTS; each quadrant holds exactly one isle inside
// its inner 6×6 (local tiles 1–6), so a 16×16 chunk holds four isles and two neighbouring isles
// are always ≥ 2 tiles of open sky apart. Isle sizes run 5–40 tiles (a noisy disc plus the
// corridors out to its bridges).
//
// BRIDGES (the seam rule). An edge between two adjacent quadrants is on or off by a pure hash
// of the two quadrant coordinates, so BOTH sides compute the same answer without seeing each
// other (papertrails' "stateless socket fields", in a lattice):
//   • a binary-tree spanning forest INSIDE each block of 8×8 quadrants (every quadrant links
//     north or east — the classic maze trick), plus one hash-chosen link east and one south
//     between neighbouring blocks. That is a spanning tree of the whole infinite lattice, so
//     the world is ONE connected walkable graph and a road can never dead-end at a seam;
//   • ~30% of the remaining edges are on too (loops, so the sky is not a tree).
// The socket row/column of an edge, and both plateau heights, are also pure hashes of the edge.
//
// HEIGHTS (walkable by construction). Each isle has a base PLATEAU level 0–3 = the rounded mean
// of a 3×3 neighbourhood of hashed levels — adjacent plateaus therefore differ by at most 1.
// A bridge lies at the LOWER plateau's height; the higher isle ends its corridor in a STAIR
// (a `ramp` tile at the lower height, facing inland), so every bridge is traversable both ways
// under rule 1 (same level, hop down one, climb only by stairs). Hills add +1/+2 terraces; every
// pair of terraces gets a stair where one fits, else the isle is flattened. Props (trees, rocks,
// water) are placed one at a time and kept only if the isle stays STRONGLY connected under
// rules.js's own heightStep — so nothing ever strands Pip.
//
// Cell shape = what parseIsle makes, + overworld-only kinds: { kind, h, ch, dir?, flora?, theme }
// where kind ∈ ground | ramp(dir) | rock | tree | water | void (sky) | bridge | shrine.
import { hash2 } from './rng.js';
import { biomeAt } from './biome.js';
import { heightStep } from '../isle/rules.js';
import { MOVE_DIRS } from '../isle/format.js';

export const CHUNK = 16, ATLAS_SEED = 1;
export const Q = 8;                       // quadrant (one isle site)
const BQ = 8;                             // quadrants per block of the spanning structure
const EXTRA = 0.3;                        // share of non-tree edges that are on
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

// Raw level of a quadrant 0–3 (mountains run high, the oasis and lagoon low), and the plateau:
// the rounded mean of the 3×3 around it. Neighbouring means differ by ≤ 1.0, so plateaus by ≤ 1.
const rawMemo = memo(8192), plMemo = memo(8192);
function raw(seed, qx, qz){
  const key = seed + '/' + qx + '/' + qz;
  let v = rawMemo.get(key);
  if(v !== undefined) return v;
  const t = biomeAt(seed, qx * Q + 4, qz * Q + 4);
  const bias = t === 'mountain' ? 1 : t === 'oasis' || t === 'tropical' ? -1 : 0;
  return rawMemo.set(key, Math.max(0, Math.min(3, Math.floor(hash2(seed, qx, qz, 41) * 4) + bias)));
}
export function plateau(seed, qx, qz){
  const key = seed + '/' + qx + '/' + qz;
  let v = plMemo.get(key);
  if(v !== undefined) return v;
  let s = 0;
  for(let j = -1; j <= 1; j++) for(let i = -1; i <= 1; i++) s += raw(seed, qx + i, qz + j);
  return plMemo.set(key, Math.round(s / 9));
}

// -> null | { axis, a:[x,z], b:[x,z], gap:[[x,z],[x,z]], qa, qb, h }  — global tiles. a / b are the
// two socket tiles (on the isles), gap the two bridge tiles between them, h the bridge's height.
export function edgeInfo(seed, qx, qz, axis){
  if(!edgeOn(seed, qx, qz, axis)) return null;
  const k = Math.floor(hash2(seed, qx, qz, axis === 'E' ? 36 : 37) * 4) + 2;      // socket line 2..5 of the quadrant
  const qb = axis === 'E' ? [qx + 1, qz] : [qx, qz + 1];
  const h = Math.min(plateau(seed, qx, qz), plateau(seed, qb[0], qb[1]));
  return axis === 'E'
    ? { axis, qa:[qx, qz], qb, h, a:[qx * Q + 6, qz * Q + k], b:[qx * Q + 9, qz * Q + k], gap:[[qx * Q + 7, qz * Q + k], [qx * Q + 8, qz * Q + k]] }
    : { axis, qa:[qx, qz], qb, h, a:[qx * Q + k, qz * Q + 6], b:[qx * Q + k, qz * Q + 9], gap:[[qx * Q + k, qz * Q + 7], [qx * Q + k, qz * Q + 8]] };
}

/* ---------------- one isle: layout (mask, terraces, stairs, shrine slot) ---------------- */
const idx = (x, z) => z * Q + x;
const inQ = (x, z) => x >= 0 && z >= 0 && x < Q && z < Q;

// forward and reverse step graphs of the isle for the tiles in `mask`, by rules.js's heightStep
function stepGraph(mask, h, ramp){
  const cell = i => ramp[i] ? { kind:'ramp', h:h[i], dir:ramp[i] } : { kind:'ground', h:h[i] };
  const fwd = Array.from({ length:N }, () => []), rev = Array.from({ length:N }, () => []);
  for(let z = 0; z < Q; z++) for(let x = 0; x < Q; x++){
    const i = idx(x, z); if(!mask[i]) continue;
    for(const d of D4){
      const x2 = x + MOVE_DIRS[d][0], z2 = z + MOVE_DIRS[d][1];
      if(!inQ(x2, z2)) continue;
      const j = idx(x2, z2); if(!mask[j]) continue;
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

const layMemo = memo(6000);
export function isleLayout(seed, qx, qz){
  const key = seed + '/' + qx + '/' + qz;
  return layMemo.get(key) || layMemo.set(key, buildLayout(seed, qx, qz));
}

function buildLayout(seed, qx, qz){
  const ox = qx * Q, oz = qz * Q, H = k => hash2(seed, qx, qz, k);
  const cx = 3 + (H(1) < 0.5 ? 0 : 1), cz = 3 + (H(2) < 0.5 ? 0 : 1), hub = idx(cx, cz);
  const pl = plateau(seed, qx, qz), theme = biomeAt(seed, ox + cx, oz + cz);
  const r = 1.3 + 2.0 * Math.pow(H(3), 1.15);

  // 1. a noisy disc, always at least the hub and its four neighbours
  let mask = new Uint8Array(N);
  for(let z = 1; z <= 6; z++) for(let x = 1; x <= 6; x++)
    if(Math.hypot(x - cx, z - cz) < r + (hash2(seed, ox + x, oz + z, 5) - 0.5) * 0.9) mask[idx(x, z)] = 1;
  mask[hub] = 1; for(const d of D4) mask[idx(cx + MOVE_DIRS[d][0], cz + MOVE_DIRS[d][1])] = 1;
  { const keep = new Uint8Array(N), st = [hub]; keep[hub] = 1;           // drop stray islets of the disc
    while(st.length){ const i = st.pop(), x = i % Q, z = (i / Q) | 0; for(const d of D4){ const x2 = x + MOVE_DIRS[d][0], z2 = z + MOVE_DIRS[d][1]; if(inQ(x2, z2) && mask[idx(x2, z2)] && !keep[idx(x2, z2)]){ keep[idx(x2, z2)] = 1; st.push(idx(x2, z2)); } } }
    mask = keep; }

  // 2. corridors out to every active bridge; sockets are their far ends
  const prot = new Uint8Array(N), ramp = new Array(N).fill(null), h = new Int8Array(N).fill(pl);
  prot[hub] = 1;
  const links = [];
  const sides = [
    ['E', edgeInfo(seed, qx, qz, 'E'), i => [6, i.a[1] - oz], [qx + 1, qz], 'L'],
    ['W', edgeInfo(seed, qx - 1, qz, 'E'), i => [1, i.b[1] - oz], [qx - 1, qz], 'R'],
    ['S', edgeInfo(seed, qx, qz, 'S'), i => [i.a[0] - ox, 6], [qx, qz + 1], 'U'],
    ['N', edgeInfo(seed, qx, qz - 1, 'S'), i => [i.b[0] - ox, 1], [qx, qz - 1], 'D'],
  ];
  for(const [side, info, sock, other, inward] of sides){
    if(!info) continue;
    const [sx, sz] = sock(info), horiz = side === 'E' || side === 'W';
    const path = [];
    if(horiz){ for(let z = Math.min(cz, sz); z <= Math.max(cz, sz); z++) path.push([cx, z]); for(let x = Math.min(cx, sx); x <= Math.max(cx, sx); x++) path.push([x, sz]); }
    else { for(let x = Math.min(cx, sx); x <= Math.max(cx, sx); x++) path.push([x, cz]); for(let z = Math.min(cz, sz); z <= Math.max(cz, sz); z++) path.push([sx, z]); }
    for(const [x, z] of path){ mask[idx(x, z)] = 1; prot[idx(x, z)] = 1; }
    links.push({ side, s:idx(sx, sz), inward, drop:pl > plateau(seed, other[0], other[1]) });
  }

  // 3. hills: +1 terraces (mountains: up to two hills, some with a +2 summit)
  const eligible = [];
  for(let i = 0; i < N; i++) if(mask[i] && !prot[i]) eligible.push(i);
  const nHills = eligible.length < 3 ? 0 : theme === 'mountain' ? Math.floor(H(10) * 3) : H(10) < 0.4 ? 1 : 0;
  const lift = new Int8Array(N);
  for(let j = 0; j < nHills; j++){
    let best = -1, bv = -1;
    for(const i of eligible){ const v = hash2(seed, ox + (i % Q), oz + ((i / Q) | 0), 50 + j); if(v > bv){ bv = v; best = i; } }
    const hx = best % Q, hz = (best / Q) | 0, R = 1.1 + H(20 + j) * 1.3;
    for(const i of eligible){
      const d = Math.hypot(i % Q - hx, ((i / Q) | 0) - hz);
      if(d < R) lift[i] = Math.max(lift[i], theme === 'mountain' && R >= 1.8 && d < R - 0.9 ? 2 : 1);
    }
  }
  for(let pass = 0; pass < 4; pass++) for(let i = 0; i < N; i++) if(mask[i]){      // adjacent terraces differ by ≤ 1
    const x = i % Q, z = (i / Q) | 0;
    for(const d of ['R', 'D']){
      const x2 = x + MOVE_DIRS[d][0], z2 = z + MOVE_DIRS[d][1]; if(!inQ(x2, z2) || !mask[idx(x2, z2)]) continue;
      const j = idx(x2, z2), a = lift[i], b = lift[j];
      if(Math.abs(a - b) <= 1) continue;
      const lo = a < b ? i : j, hi = a < b ? j : i;
      if(!prot[lo]) lift[lo] = lift[hi] - 1; else lift[hi] = lift[lo] + 1;      // (a protected tile never moves; the other gives way)
    }
  }
  for(let i = 0; i < N; i++) if(mask[i]) h[i] = Math.min(5, pl + lift[i]);

  // 4. stairs between terraces: one per pair of adjacent terraces, on the lower one, facing up
  const rampMap = planStairs(seed, ox, oz, mask, h, prot);
  const flat = () => { for(let i = 0; i < N; i++){ h[i] = pl; ramp[i] = null; } };
  if(!rampMap) flat(); else for(const [i, d] of rampMap) ramp[i] = d;
  // 5. the stair that carries a higher isle down to a lower neighbour's bridge
  for(const L of links) if(L.drop){ ramp[L.s] = L.inward; h[L.s] = pl - 1; }
  let g = stepGraph(mask, h, ramp);
  if(!strong(mask, g, hub, new Uint8Array(N))){            // a stair left something stranded: flatten the isle
    flat(); for(const L of links) if(L.drop){ ramp[L.s] = L.inward; h[L.s] = pl - 1; }
    g = stepGraph(mask, h, ramp);
  }

  // 6. the shrine slot: a plain tile in the inner 4×4 of the quadrant (so two shrines are always ≥ 4 apart)
  let slot = -1, area = 0;
  for(let i = 0; i < N; i++) area += mask[i];
  if(area >= 8 && H(60) < 0.65){
    let bv = -1;
    for(let i = 0; i < N; i++){
      const x = i % Q, z = (i / Q) | 0;
      if(!mask[i] || prot[i] || ramp[i] || x < 2 || x > 5 || z < 2 || z > 5) continue;
      const v = hash2(seed, ox + x, oz + z, 61); if(v > bv){ bv = v; slot = i; }
    }
  }
  return { qx, qz, ox, oz, theme, pl, mask, h, ramp, prot, hub, slot, graph:g, area };
}

// Stairs for every pair of adjacent terraces. A stair is a tile on the LOWER terrace, facing the
// higher one, with plain floor of its own height behind it. null = some pair has no place for one.
function planStairs(seed, ox, oz, mask, h, prot){
  const comp = new Int16Array(N).fill(-1); let nc = 0;
  for(let s = 0; s < N; s++){
    if(!mask[s] || comp[s] >= 0) continue;
    const st = [s]; comp[s] = nc;
    while(st.length){ const i = st.pop(), x = i % Q, z = (i / Q) | 0;
      for(const d of D4){ const x2 = x + MOVE_DIRS[d][0], z2 = z + MOVE_DIRS[d][1]; if(!inQ(x2, z2)) continue; const j = idx(x2, z2); if(mask[j] && comp[j] < 0 && h[j] === h[i]){ comp[j] = nc; st.push(j); } } }
    nc++;
  }
  const pairs = new Map();
  for(let t = 0; t < N; t++){
    if(!mask[t]) continue;
    const x = t % Q, z = (t / Q) | 0;
    for(const d of D4){
      const x2 = x + MOVE_DIRS[d][0], z2 = z + MOVE_DIRS[d][1]; if(!inQ(x2, z2)) continue;
      const u = idx(x2, z2); if(!mask[u] || h[u] !== h[t] + 1) continue;
      const key = comp[t] + '|' + comp[u]; if(!pairs.has(key)) pairs.set(key, []);
      const bx = x - MOVE_DIRS[d][0], bz = z - MOVE_DIRS[d][1];
      if(!prot[t] && inQ(bx, bz) && mask[idx(bx, bz)] && h[idx(bx, bz)] === h[t])
        pairs.get(key).push({ t, d, behind:idx(bx, bz), w:hash2(seed, ox + x, oz + z, 70 + D4.indexOf(d)) });
    }
  }
  const out = new Map();
  for(const [, cands] of [...pairs].sort((a, b) => a[0] < b[0] ? -1 : 1)){
    cands.sort((a, b) => a.w - b.w);
    const c = cands.find(c => !out.has(c.t) && !out.has(c.behind));
    if(!c) return null;
    out.set(c.t, c.d);
  }
  return out;
}

/* ---------------- one isle: props ---------------- */
// per-tile chances: tree, rock, flowers, a single water tile (ponds are grown separately)
const DENS = {
  jungle:   { T:0.17, '#':0.02, ',':0.10, '~':0.01 },
  oasis:    { T:0.05, '#':0.03, ',':0.05, '~':0.04 },
  tropical: { T:0.07, '#':0.02, ',':0.15, '~':0.05 },
  urban:    { T:0.03, '#':0.22, ',':0.02, '~':0.00 },     // rocks read as buildings
  mountain: { T:0.03, '#':0.14, ',':0.02, '~':0.01 },
  night:    { T:0.08, '#':0.08, ',':0.05, '~':0.05 },
};
const POND = { jungle:0.12, oasis:0.6, tropical:0.5, urban:0, mountain:0.05, night:0.2 };
const KIND = { T:'tree', '#':'rock', '~':'water' };

const isleMemo = memo(3000);
export function isleOf(seed, qx, qz){
  const key = seed + '/' + qx + '/' + qz;
  return isleMemo.get(key) || isleMemo.set(key, buildIsle(seed, qx, qz));
}

function buildIsle(seed, qx, qz){
  const L = isleLayout(seed, qx, qz), { mask, hub, ox, oz, prot, ramp } = L;
  const prop = new Array(N).fill('');                       // '' | ',' | 'T' | '#' | '~'
  const blocked = new Uint8Array(N);
  const floor = []; for(let i = 0; i < N; i++) if(mask[i] && !prot[i] && !ramp[i] && i !== L.slot) floor.push(i);
  const order = floor.slice().sort((a, b) => hash2(seed, ox + (a % Q), oz + ((a / Q) | 0), 71) - hash2(seed, ox + (b % Q), oz + ((b / Q) | 0), 71));
  const cap = Math.floor(floor.length * 0.4);
  let placed = 0;
  const tryBlock = i => {
    if(placed >= cap) return false;
    blocked[i] = 1;
    if(strong(mask, L.graph, hub, blocked)){ placed++; return true; }
    blocked[i] = 0; return false;
  };
  for(const i of order){
    const x = ox + (i % Q), z = oz + ((i / Q) | 0), d = DENS[biomeAt(seed, x, z)], u = hash2(seed, x, z, 72);
    if(u < d.T){ if(tryBlock(i)) prop[i] = 'T'; }
    else if(u < d.T + d['#']){ if(tryBlock(i)) prop[i] = '#'; }
    else if(u < d.T + d['#'] + d['~']){ if(tryBlock(i)) prop[i] = '~'; }
    else if(u < d.T + d['#'] + d['~'] + d[',']) prop[i] = ',';
  }
  // a pool: a seed tile plus a few neighbours, each kept only if the isle stays connected
  if(order.length > 6 && hash2(seed, qx, qz, 73) < POND[L.theme]){
    const s = order.find(i => !prop[i] || prop[i] === ',');
    if(s !== undefined){
      const pool = [s]; let want = 2 + Math.floor(hash2(seed, qx, qz, 74) * 3);
      for(let k = 0; k < pool.length && pool.length < want; k++)
        for(const d of D4){ const x = (pool[k] % Q) + MOVE_DIRS[d][0], z = ((pool[k] / Q) | 0) + MOVE_DIRS[d][1];
          if(inQ(x, z) && order.includes(idx(x, z)) && !pool.includes(idx(x, z)) && pool.length < want && !prop[idx(x, z)]) pool.push(idx(x, z)); }
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
  const put = (x, z, c) => { cells[(z - Z0) * CHUNK + (x - X0)] = { ...c, theme:cells[(z - Z0) * CHUNK + (x - X0)].theme }; };

  for(let qz = cz * 2; qz < cz * 2 + 2; qz++) for(let qx = cx * 2; qx < cx * 2 + 2; qx++){
    const I = isleOf(seed, qx, qz);
    for(let i = 0; i < N; i++){
      if(!I.mask[i]) continue;
      const x = I.ox + (i % Q), z = I.oz + ((i / Q) | 0), p = I.prop[i];
      if(i === I.slot){ put(x, z, { kind:'shrine', h:I.h[i], ch:'.' }); shrines.push({ x, z, key:`w/${x},${z}`, kind:'slot' }); }
      else if(I.ramp[i]) put(x, z, { kind:'ramp', h:I.h[i], ch:RAMP_CH[I.ramp[i]], dir:I.ramp[i] });
      else if(p === 'T' || p === '#' || p === '~') put(x, z, { kind:KIND[p], h:I.h[i], ch:p });
      else if(p === ',') put(x, z, { kind:'ground', h:I.h[i], ch:',', flora:true });
      else put(x, z, { kind:'ground', h:I.h[i], ch:'.' });
    }
  }
  for(let qz = cz * 2 - 1; qz <= cz * 2 + 2; qz++) for(let qx = cx * 2 - 1; qx <= cx * 2 + 2; qx++) for(const axis of ['E', 'S']){
    const e = edgeInfo(seed, qx, qz, axis);
    if(!e) continue;
    for(const [x, z] of e.gap) if(x >= X0 && x < X0 + CHUNK && z >= Z0 && z < Z0 + CHUNK){
      put(x, z, { kind:'bridge', h:e.h, ch:'=' }); bridges.push({ x, z, axis, h:e.h });
    }
  }
  shrines.sort((a, b) => a.z - b.z || a.x - b.x);
  bridges.sort((a, b) => a.z - b.z || a.x - b.x);
  return { cx, cz, cells, bridges, shrines };
}
