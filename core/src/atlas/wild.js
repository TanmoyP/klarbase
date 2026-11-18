// @klar/core — Sky Atlas: WILD isles. wildIsle(seed, x, z) builds a real, solver-verified isle for
// the shrine at map tile (x, z) from that tile alone — the same isle in every browser, forever.
//
// HOW. The isle is a CHAIN OF BARRIERS between a start on the west and a goal on the east (then
// flipped / transposed by hash). Each barrier is a full-height wall that only one mechanic can pass,
// so every mechanic in the chain is load-bearing by construction:
//     sink    a water moat — push 1–2 crates in (jungle also: hop down a ledge, climb stairs to a ledge)
//     arch    a rock wall with an arch pair — the arch is walled in and a crate stands on its doorstep
//     bridge  a moat with one sunk bridge — find the lever, press X
//     door    a rock wall with a door — fetch the key
//     gate    a rock wall with a gate — push a crate onto the plate
//     ice     two walls with a sheet of ice between — slide, using stoppers, to the far gap
//     dark    (night) a wall pierced by a boulder lane — time the crossing, wait a beat
// The theme picks the family (jungle sink, oasis arch, tropical bridge+door, urban gate, mountain
// ice, night dark); farther from spawn adds a second, crate-based barrier (crates are what make a
// puzzle punish a wrong move), and a sprinkle of theme decor keeps the floor connected but winding.
//
// ACCEPTANCE (up to 40 deterministic attempts, attempt i seeds mulberry32(hash2(seed,x,z,1000+i))):
//   parse ok · solvable (solveIsle, 60 000 states) · par ≥ 6 · every barrier's mechanic appears in
//   the shortest solution (contrib.js mechanicsUsed) · auditIsle tier inside the distance band:
//   < 64 tiles from spawn breeze/easy, < 160 easy/tricky, beyond tricky — never above tricky.
//   (provisionalTier already makes 'tricky' mean: ≥ 300 states, ≥ 2 traps, ≤ 6 routes and greedy fails.)
// Night uses a v6 single-storey map (hazards are map-only): schemaVersion 6, one storey at [0,0,0],
// and its boulder is placed at the lane position that makes the solution WAIT a beat.
// Returns null when no attempt passes (the shrine is then "quiet"; measured: well under 1%).
import { hash2, hashInt, mulberry32 } from './rng.js';
import { biomeAt } from './biome.js';
import { spawnOf } from './chunk.js';
import { parseIsle, isleHash } from '../isle/format.js';
import { solveIsle } from '../isle/solve.js';
import { initialState, step } from '../isle/rules.js';
import { mechanicsUsed } from '../isle/contrib.js';
import { auditIsle, provisionalTier } from '../isle/difficulty.js';

export const WILD = { ATTEMPTS:40, MAX_STATES:6000, AUDIT_STATES:3000, MIN_PAR:6 };

const NAMES = {
  jungle:   [['Mossy', 'Fern', 'Dewy', 'Tangled', 'Sunlit', 'Leafy', 'Hidden', 'Quiet'], ['Hollow', 'Glade', 'Canopy', 'Thicket', 'Brook', 'Clearing', 'Perch', 'Root']],
  oasis:    [['Golden', 'Shimmering', 'Dusty', 'Amber', 'Sleepy', 'Warm', 'Distant', 'Palmy'], ['Well', 'Dune', 'Spring', 'Mirage', 'Caravan', 'Pool', 'Arch', 'Wadi']],
  tropical: [['Sandy', 'Coral', 'Breezy', 'Salty', 'Turquoise', 'Lazy', 'Sunny', 'Shell'], ['Cove', 'Lagoon', 'Shoal', 'Reef', 'Tide', 'Key', 'Inlet', 'Drift']],
  urban:    [['Lantern', 'Brick', 'Quiet', 'Chimney', 'Clock', 'Paper', 'Copper', 'Rainy'], ['Alley', 'Rooftop', 'Courtyard', 'Terrace', 'Crossing', 'Market', 'Stair', 'Yard']],
  mountain: [['Frosty', 'Snowy', 'Windy', 'Crystal', 'Silent', 'Glassy', 'Pale', 'Icy'], ['Ridge', 'Slide', 'Pass', 'Col', 'Ledge', 'Peak', 'Drift', 'Shelf']],
  night:    [['Moonlit', 'Starry', 'Hushed', 'Glowing', 'Drowsy', 'Velvet', 'Silver', 'Dim'], ['Meadow', 'Lantern', 'Path', 'Hollow', 'Garden', 'Crossing', 'Owl', 'Glade']],
};

// primary barrier per theme, and the crate-based second barriers that make a farther isle punish a wrong move
const PRIMARY = { jungle:['sink'], oasis:['arch'], tropical:['bridge', 'door'], urban:['gate'], mountain:['ice'], night:['dark', 'dark', 'sink', 'gate'] };
const SECOND  = { jungle:['gate', 'arch'], oasis:['sink', 'gate'], tropical:['sink', 'gate'], urban:['sink', 'arch'], mountain:['sink', 'gate'], night:['sink', 'gate', 'arch'] };
// decor on the open floor of each region (walkable flowers need no care; the rest must keep it connected)
const DECOR = {
  jungle:['T', 'T', 'T', ',', ',', '#'], oasis:['T', '#', '~', ',', ','], tropical:['T', '~', '~', ',', ',', '#'],
  urban:['#', '#', '#', '#', 'T', ','], mountain:['#', '#', '#', 'T', ','], night:['T', '#', '~', ',', 'T'],
};
const MECH = { sink:['sink', 'push'], arch:['tp', 'push'], bridge:['toggle'], door:['key', 'door'], gate:['gate', 'push'], ice:['slide'], dark:['wait'] };
const NEED = { sink:3, arch:4, bridge:3, door:3, gate:4, ice:2, dark:3 };

/* ---------------- the grid ---------------- */
const SOLID = new Set(['#', 'T', '~', '-', 'D', 'K', 'Y']);
const grid = (W, H) => ({ W, H, g:Array.from({ length:H }, () => Array.from({ length:W }, () => ({ c:'.', h:0 }))), res:new Set() });
const put = (G, x, z, c, h) => { const t = G.g[z][x]; t.c = c; if(h !== undefined) t.h = h; };
const res = (G, ...cells) => { for(const [x, z] of cells) if(x >= 0 && z >= 0 && x < G.W && z < G.H) G.res.add(x + ',' + z); };
const isRes = (G, x, z) => G.res.has(x + ',' + z);

// every non-blocking floor tile of the columns [xl, xr] is one 4-connected piece
function connected(G, xl, xr){
  const solid = (x, z) => SOLID.has(G.g[z][x].c) || G.g[z][x].c === 'C' || G.g[z][x].pit;
  let start = null, n = 0;
  for(let z = 0; z < G.H; z++) for(let x = xl; x <= xr; x++) if(!solid(x, z)){ n++; if(!start) start = [x, z]; }
  if(!start) return true;
  const seen = new Set([start[0] + ',' + start[1]]), st = [start];
  while(st.length){
    const [x, z] = st.pop();
    for(const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
      const a = x + dx, b = z + dz;
      if(a < xl || a > xr || b < 0 || b >= G.H || solid(a, b) || seen.has(a + ',' + b)) continue;
      seen.add(a + ',' + b); st.push([a, b]);
    }
  }
  return seen.size === n;
}

/* ---------------- planning ---------------- */
// -> { G, bars, mech, dark } | null
function design(theme, rnd, nBar, dense, decoys, lift){
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const kinds = [PRIMARY[theme][ri(0, PRIMARY[theme].length - 1)]];
  const pool = SECOND[theme].slice();
  while(kinds.length < nBar){
    const k = pool.splice(ri(0, pool.length - 1), 1)[0];
    if(k === undefined) break;
    if(rnd() < 0.5) kinds.push(k); else kinds.unshift(k);
  }
  const H = theme === 'night' ? ri(5, 7) : ri(5, 7);
  const bars = kinds.map(kind => {
    const b = { kind, t:1, variant:'flat', wI:3 };
    if(kind === 'sink'){
      if(nBar === 1 && rnd() < 0.4) b.t = 2;
      const u = rnd();
      b.variant = theme === 'jungle' ? (u < 0.3 ? 'flat' : u < 0.6 ? 'hop' : 'ramp') : (u < 0.8 ? 'flat' : 'hop');
      if(b.variant === 'ramp' && H < 5) b.variant = 'flat';
    }
    if(kind === 'ice') b.wI = ri(3, 4);
    b.w = kind === 'sink' ? b.t : kind === 'ice' ? b.wI + 2 : 1;
    b.need = NEED[kind] + (kind === 'sink' ? b.t - 1 + (b.variant === 'ramp' ? 2 : 0) : 0);
    b.rw = b.need;
    b.row = ri(1, H - 2);
    return b;
  });
  let lastW = 2;
  const cap = nBar === 1 ? 10 : 14;
  let W = bars.reduce((s, b) => s + b.rw + b.w, 0) + lastW;
  if(W > cap) return null;
  for(let k = 0; k < bars.length + 1; k++) if(rnd() < 0.5 && W < cap){          // spare columns, spread by chance
    const j = ri(0, bars.length); W++;
    if(j === bars.length) lastW++; else bars[j].rw++;
  }

  // region heights: a 'hop' sink drops the rest of the isle one level
  const hs = []; let hcur = bars.some(b => b.variant === 'hop') ? 1 : 0;
  for(const b of bars){ hs.push(hcur); if(b.variant === 'hop') hcur = Math.max(0, hcur - 1); }
  hs.push(hcur);
  if(lift) for(let i = 0; i < hs.length; i++) hs[i]++;           // the whole isle stands a level up, so pits can be sunk below it

  const G = grid(W, H);
  let x0 = 0; const regions = [];
  bars.forEach((b, i) => { b.xl = x0; b.xr = x0 + b.rw - 1; b.bx = b.xr + 1; x0 = b.bx + b.w; regions.push([b.xl, b.xr, hs[i]]); });
  regions.push([x0, W - 1, hs[bars.length]]);
  for(const [xl, xr, h] of regions) for(let z = 0; z < H; z++) for(let x = xl; x <= xr; x++) G.g[z][x].h = h;

  const free = (xl, xr, tries = 30) => {            // a random unreserved plain floor tile of a region
    for(let k = 0; k < tries; k++){
      const x = ri(xl, xr), z = ri(0, H - 1);
      if(G.g[z][x].c === '.' && !isRes(G, x, z)) return [x, z];
    }
    return null;
  };
  let dark = null;

  for(let i = 0; i < bars.length; i++){
    const b = bars[i], { xl, xr, bx, row:r } = b, hw = hs[i], he = hs[i + 1], xe = bx + b.w;
    const wall = (x, h) => { for(let z = 0; z < H; z++) put(G, x, z, '#', h); };
    if(b.kind === 'sink'){
      const wh = b.variant === 'ramp' ? hw : he;
      for(let x = bx; x < bx + b.t; x++) for(let z = 0; z < H; z++) put(G, x, z, '~', wh);
      let placed = 0;
      if(b.variant === 'ramp'){                        // a ledge by the moat, reached by a stair; the crate stands on it
        const z0 = ri(0, H - 2), zr = ri(z0, z0 + 1), zc = zr;
        for(const z of [z0, z0 + 1]) for(const x of [xr - 1, xr]) put(G, x, z, '.', hw + 1);
        put(G, xr - 2, zr, '>', hw); put(G, xr - 3, zr, '.', hw);
        put(G, xr - 1, zc, 'C', hw + 1);
        res(G, [xr - 2, zr], [xr - 3, zr], [xr - 1, z0], [xr, z0], [xr - 1, z0 + 1], [xr, z0 + 1]);
        placed = 1;
      }
      for(; placed < b.t; placed++){
        const c = free(xl + 1, xr - 1) || free(xl, xr);
        if(!c) return null;
        put(G, c[0], c[1], 'C');
        for(let x = c[0] - 1; x <= xe + 1; x++) res(G, [x, c[1]]);      // a clear straight push: pusher, run, landing
      }
    } else if(b.kind === 'arch'){
      wall(bx, hw);
      put(G, bx - 1, r, 'p', hw); put(G, bx - 1, r - 1, '#', hw); put(G, bx - 1, r + 1, '#', hw);
      put(G, bx - 2, r, 'C', hw);
      res(G, [bx - 2, r - 1], [bx - 2, r], [bx - 2, r + 1], [bx - 1, r]);
      const q = ri(0, H - 1); put(G, xe, q, 'p', he); res(G, [xe, q]);
    } else if(b.kind === 'bridge'){
      for(let z = 0; z < H; z++) put(G, bx, z, '~', hw);
      put(G, bx, r, '_', hw); res(G, [bx - 1, r], [bx + 1, r]);
      const c = free(xl, xr - 1) || free(xl, xr);
      if(!c) return null;
      put(G, c[0], c[1], 'L'); res(G, c);
    } else if(b.kind === 'door'){
      wall(bx, hw); put(G, bx, r, 'K', hw); res(G, [bx - 1, r], [bx + 1, r]);
      const c = free(xl, xr - 1) || free(xl, xr);
      if(!c) return null;
      put(G, c[0], c[1], 'k'); res(G, c);
    } else if(b.kind === 'gate'){
      wall(bx, hw); put(G, bx, r, 'D', hw); res(G, [bx - 1, r], [bx + 1, r]);
      const a = b.rw >= 5 ? ri(1, 2) : 1, px = ri(xl + a + 1, xr - 1), pz = ri(0, H - 1);
      put(G, px, pz, 'o'); put(G, px - a, pz, 'C');
      res(G, [px, pz], [px - a, pz], [px - a - 1, pz]);
      for(let k = 1; k < a; k++) res(G, [px - k, pz]);
      if(rnd() < 0.5){ const c = free(xl, xr); if(c) put(G, c[0], c[1], 'C'); }
    } else if(b.kind === 'ice'){
      // two walls with a gap each, ice between. Entering slides to the far wall; one stopper is placed
      // so a vertical slide halts exactly on the exit row; a few more are scattered clear of that route.
      wall(bx, hw);
      let r2 = ri(0, H - 1); if(r2 === r) r2 = (r + 1 + ri(0, H - 2)) % H;
      const x1 = bx + 1, x2 = bx + b.wI;
      put(G, bx, r, '.', hw);
      for(let x = x1; x <= x2; x++) for(let z = 0; z < H; z++) put(G, x, z, '*', he);
      wall(x2 + 1, he); put(G, x2 + 1, r2, '.', he);
      res(G, [bx - 1, r], [x2 + 2, r2]);
      const below = r2 > r;                              // arriving from the north slides south, and vice versa
      const stop = below ? r2 + 1 : r2 - 1;
      if(stop >= 0 && stop < H) put(G, x2, stop, '#', he);
      for(let k = ri(1, 3), n = 0; n < k; n++){
        const x = ri(x1, x2 - 1), z = ri(0, H - 1);
        if(z !== r) put(G, x, z, '#', he);
      }
    } else if(b.kind === 'dark'){
      // a wall pierced by a boulder lane. West entrance and east exit are different rows of the lane and
      // the other rows are walled off, so Pip must walk along the lane the boulder rolls in — timing, then a wait.
      const opts = [3, 3, 4, 4, 5, 7].filter(n => n <= H), L = opts[ri(0, opts.length - 1)], z0 = ri(0, H - L);
      wall(bx, hw);
      const zx = z0 + ri(1, L - 2);                       // the exit is never at an end of the lane: Pip has to step out before the boulder turns back
      let ze = z0 + ri(0, L - 1); if(ze === zx) ze = z0 + (ze - z0 + 1 + ri(0, L - 2)) % L;
      const lane = [];
      for(let z = z0; z < z0 + L; z++){
        put(G, bx, z, '.', hw); lane.push([bx, z]); res(G, [bx, z]);
        if(z !== ze) put(G, bx - 1, z, '#', hw);
        if(z !== zx) put(G, bx + 1, z, '#', he);
      }
      res(G, [bx - 1, ze], [bx + 1, zx], [bx - 2, ze]);
      dark = { lane };
    }
  }
  // start in the first region, goal in the last
  const [r0, r1] = [regions[0], regions[regions.length - 1]];
  const S = free(r0[0], Math.min(r0[0] + 1, r0[1])) || free(r0[0], r0[1]), Gl = free(Math.max(r1[0], r1[1] - 1), r1[1]) || free(r1[0], r1[1]);
  if(!S || !Gl) return null;
  const [sx, sz] = S, [gx, gz] = Gl;
  put(G, sx, sz, 'S'); put(G, gx, gz, 'G'); res(G, [sx, sz], [gx, gz]);

  // decoy crates: loose pieces a wrong push can wedge — what turns a tricky isle's mistakes into dead ends
  for(let k = 0; k < decoys; k++){
    const [xl, xr] = regions[ri(0, regions.length - 1)], c = free(xl, xr);
    if(!c) continue;
    put(G, c[0], c[1], 'C');
    if(!connected(G, xl, xr)) put(G, c[0], c[1], '.');
  }

  // decor: block floor tiles at random, keeping each region one connected piece
  const palette = DECOR[theme];
  for(const [xl, xr] of regions){
    const cells = [];
    for(let z = 0; z < H; z++) for(let x = xl; x <= xr; x++) if(G.g[z][x].c === '.' && !G.g[z][x].pit && !isRes(G, x, z)) cells.push([x, z]);
    for(let i = cells.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const want = Math.round(cells.length * (0.12 + dense * 0.1 + rnd() * 0.18));
    let n = 0;
    for(const [x, z] of cells){
      if(n >= want) break;
      const c = palette[ri(0, palette.length - 1)];
      if(c === ','){ put(G, x, z, ','); n++; continue; }
      put(G, x, z, c);
      if(connected(G, xl, xr)) n++; else put(G, x, z, '.');
    }
  }
  return { G, bars, dark, regions };
}

// Pits: tiles one level down, put beside the route the solver found. Hopping in is legal and there is no way
// back up — a dead end that every step beside it risks (each one is a "trap" to the audit), and a hole a crate
// can be pushed into (rule 2: off a one-level ledge). Placed where the shortest route passes, never on it.
function addPits(D, doc, rnd, k){
  const p = parseIsle(doc);
  if(!p.ok) return false;
  const r = solveIsle(p.level, { maxStates:WILD.MAX_STATES });
  if(!r.solvable) return false;
  let s = initialState(p.level); const on = new Set([s.p]);
  for(const m of r.solution){ s = step(p.level, s, m).state; on.add(s.p); }
  const { G, regions } = D, W = p.level.w, cand = [], seen = new Set();
  for(const i of on) for(const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
    const x = i % W + dx, z = ((i / W) | 0) + dz;
    if(x < 0 || z < 0 || x >= W || z >= G.H || on.has(z * W + x) || seen.has(z * W + x)) continue;
    seen.add(z * W + x);
    const t = G.g[z][x];
    if(t.c === '.' && !t.pit && !isRes(G, x, z)) cand.push([x, z]);
  }
  for(let i = cand.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  let n = 0;
  for(const [x, z] of cand){
    if(n >= k) break;
    const [xl, xr, h] = regions.find(([a, b]) => x >= a && x <= b) || [];
    if(h === undefined || h < 1) continue;
    const t = G.g[z][x]; t.pit = true; t.h = h - 1;
    if(connected(G, xl, xr)) n++; else { t.pit = false; t.h = h; }
  }
  return n > 0;
}

/* ---------------- output ---------------- */
const FLIP_Z = { '^':'v', v:'^' }, FLIP_X = { '<':'>', '>':'<' }, TRANS = { '^':'<', '<':'^', v:'>', '>':'v', H:'I', I:'H' };
function orient(rows, fx, fz, tr){
  const map = (rows, m) => rows.map(r => r.map(t => m[t.c] ? { c:m[t.c], h:t.h } : t));
  if(fz) rows = map(rows.slice().reverse(), FLIP_Z);
  if(fx) rows = map(rows.map(r => r.slice().reverse()), FLIP_X);
  if(tr) rows = map(rows[0].map((_, x) => rows.map(r => r[x])), TRANS);
  return rows;
}
const rowsOf = g => g.map(r => r.map(t => t.c + (t.h ? t.h : '')).join(' '));

/* ---------------- the verdict ---------------- */
// -> { par, solution, tier, mechanics } | null
function judge(doc, need, tiers){
  const p = parseIsle(doc);
  if(!p.ok) return null;
  const r = solveIsle(p.level, { maxStates:WILD.MAX_STATES });
  if(!r.solvable || r.par < WILD.MIN_PAR) return null;
  const mechanics = mechanicsUsed(p.level, r.solution);
  if(!need.every(m => mechanics.includes(m)) || r.explored > WILD.AUDIT_STATES) return null;
  const a = auditIsle(p.level, { maxStates:WILD.AUDIT_STATES });
  if(a.capped) return null;
  const tier = provisionalTier(a).id;
  return tiers.includes(tier) ? { par:r.par, solution:r.solution, tier, mechanics } : null;
}

const memo = new Map();
export function wildIsle(seed, x, z){
  const key = seed + '/' + x + '/' + z;
  if(memo.has(key)) return memo.get(key);
  const out = build(seed, x, z);
  if(memo.size >= 400) memo.clear();
  memo.set(key, out);
  return out;
}

// Distance bands: 0 = near spawn (< 64 tiles), 1 = mid (< 160), 2 = far.
export const wildBand = d => d < 64 ? 0 : d < 160 ? 1 : 2;
export const WILD_TIERS = [['breeze', 'easy'], ['easy', 'tricky'], ['tricky']];

// Which tiers attempt `at` will take. Early attempts aim at the tier the slot's hash prefers (near:
// easy, rather than a breeze; mid: sometimes tricky); later ones take anything the band allows.
function wanted(band, at, pref){
  if(band === 2) return ['tricky'];
  if(band === 0) return at < 16 ? ['easy'] : WILD_TIERS[0];
  return at < 16 ? [pref] : WILD_TIERS[1];
}

function build(seed, x, z){
  const theme = biomeAt(seed, x, z), sp = spawnOf(seed), band = wildBand(Math.hypot(x - sp.x, z - sp.z));
  const pref = hash2(seed, x, z, 9) < 0.4 ? 'tricky' : 'easy';
  for(let at = 0; at < WILD.ATTEMPTS; at++){
    const rnd = mulberry32(hashInt(seed, x, z, 1000 + at));
    const tiers = wanted(band, at, pref), hard = tiers.length === 1 && tiers[0] === 'tricky';
    // one barrier first (+ pits when tricky is the aim); two (crates make a wrong move cost something) if that
    // does not land; a third only for the stubborn far slot
    const nBar = hard ? (at < 12 ? 1 : at < 32 ? 2 : 3) : at < (band === 0 ? 24 : 16) ? 1 : 2;
    const decoys = (hard && at >= 12) || (theme === 'mountain' && nBar === 1 && at % 2 === 0) ? 1 : 0;   // (mountain: ice slides + a crate to push)
    const D = design(theme, rnd, nBar, at / 20, decoys, hard);
    if(!D) continue;
    if(hard && !D.dark && !addPits(D, { schemaVersion:5, theme, rows:rowsOf(D.G.g) }, rnd, 2 + (at % 3))) continue;
    const fx = rnd() < 0.5, fz = rnd() < 0.5, tr = rnd() < 0.5;
    const need = [...new Set(D.bars.flatMap(b => b.kind === 'dark' && at >= 20 ? ['hazard'] : MECH[b.kind]))];
    // the boulder: try up to three lane positions (from a hashed start); the first that makes a fair isle wins
    const lane = D.dark ? D.dark.lane.length : 1, n = Math.min(3, lane), o = Math.floor(rnd() * lane);
    for(let k = 0; k < n; k++){
      if(D.dark){
        for(const [lx, lz] of D.dark.lane) D.G.g[lz][lx].c = '.';
        const [lx, lz] = D.dark.lane[(o + k) % lane]; D.G.g[lz][lx].c = 'I';
      }
      const rows = rowsOf(orient(D.G.g, fx, fz, tr));
      const map = !!D.dark;                                // hazards are map-only: a night isle with a boulder is a v6 map
      const v = judge(map ? { schemaVersion:6, theme, storeys:[{ rows, at:[0, 0, 0] }] } : { schemaVersion:5, theme, rows }, need, tiers);
      if(!v) continue;
      const nm = NAMES[theme], name = nm[0][Math.floor(hash2(seed, x, z, 5) * nm[0].length)] + ' ' + nm[1][Math.floor(hash2(seed, x, z, 6) * nm[1].length)];
      const doc = map
        ? { schemaVersion:6, name, theme, storeys:[{ rows, at:[0, 0, 0] }], par:v.par, solution:v.solution, tier:v.tier }
        : { schemaVersion:5, name, theme, rows, par:v.par, solution:v.solution, tier:v.tier };
      return { doc, par:v.par, solution:v.solution, tier:v.tier, mechanics:v.mechanics, statKey:`w/${x},${z}`, hash:isleHash(doc) };
    }
  }
  return null;
}
