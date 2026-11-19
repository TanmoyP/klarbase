// @klar/core — Progress save (cloud sync). The one place that decides how two
// saves of the same player combine, so the browser (on sign-in) and the server
// (on PUT /api/progress) can never disagree. Pure, zero deps, no I/O.
//
// A save is plain JSON:
//   { v:1,
//     progress:{ <isle key>: { stars:0..3, moves, time?, seeds? } },   // per-isle bests
//     dailies:{ 'YYYY-MM-DD': stars },
//     map?:{ pos:{ x, z, t }, explored:[chunk keys], lit:[isle keys] } }
// Only PROGRESS is in a save. Settings, sound, timer, builder draft, effort and
// the GitHub name are per-device and never leave the browser.
//
// Merge rules (never lose a clear):  stars/seeds = max · moves/time = min (missing
// or invalid ignored) · dailies = per-date max · map.explored/lit = union ·
// map.pos = the one with the larger t · unknown keys kept (prefer b).
// Sanitize is the trust boundary for what a client sends: it drops anything
// malformed and refuses a save over MAX_BYTES.

export const MAX_BYTES = 64 * 1024;     // JSON size of a whole save
export const MAX_ISLES = 5000;          // per-isle entries
export const MAX_SET   = 2000;          // explored / lit entries each

const BAD_KEY = new Set(['__proto__', 'constructor', 'prototype']);
const ISLE_KEY = /^[\w:/.,\-]{1,80}$/;   // the comma is for Sky Atlas wild isles: 'w:<x>,<z>'
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const SET_KEY = /^[\w:/.,\-]{1,80}$/;   // chunk keys "cx,cz" and isle keys (i:<64 hex> is 66)
const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const num = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;

// ---- lenient cleaners (shared by merge and sanitize) -----------------------
function cleanEntry(e){
  if(!isObj(e)) return null;
  const o = {};
  if(int(e.stars, 0, 3)) o.stars = e.stars;
  if(int(e.moves, 1, 100000)) o.moves = e.moves;
  if(num(e.time, 0.001, 1e6)) o.time = e.time;
  if(int(e.seeds, 0, 1000)) o.seeds = e.seeds;
  return Object.keys(o).length ? o : null;
}
function cleanIsles(p){
  const out = {};
  if(!isObj(p)) return out;
  let n = 0;
  for(const k of Object.keys(p).sort()){
    if(BAD_KEY.has(k) || !ISLE_KEY.test(k) || k.includes('..')) continue;
    const e = cleanEntry(p[k]);
    if(e && n < MAX_ISLES){ out[k] = e; n++; }
  }
  return out;
}
function cleanDailies(d){
  const out = {};
  if(!isObj(d)) return out;
  for(const k of Object.keys(d).sort()) if(DAY_KEY.test(k) && int(d[k], 0, 3)) out[k] = d[k];
  return out;
}
function cleanSet(a){
  if(!Array.isArray(a)) return [];
  return [...new Set(a.filter(s => typeof s === 'string' && !BAD_KEY.has(s) && SET_KEY.test(s)))].sort().slice(0, MAX_SET);
}
function cleanPos(p){
  return isObj(p) && num(p.x, -1e9, 1e9) && num(p.z, -1e9, 1e9) && num(p.t, 0, 1e15) ? { x:p.x, z:p.z, t:p.t } : null;
}
function cleanMap(m){
  if(!isObj(m)) return null;
  const map = { explored:cleanSet(m.explored), lit:cleanSet(m.lit) }, pos = cleanPos(m.pos);
  if(pos) map.pos = pos;
  return map;
}

// ---- merge -----------------------------------------------------------------
const best = (x, y, pick) => x === undefined ? y : y === undefined ? x : pick(x, y);
function mergeEntry(x, y){
  const o = {};
  for(const [k, pick] of [['stars', Math.max], ['moves', Math.min], ['time', Math.min], ['seeds', Math.max]]){
    const v = best(x && x[k], y && y[k], pick);
    if(v !== undefined) o[k] = v;
  }
  return o;
}
// the later position wins; a tie is broken by value so merge stays commutative
const laterPos = (p, q) => !p ? q : !q ? p : p.t !== q.t ? (p.t > q.t ? p : q) : p.x !== q.x ? (p.x > q.x ? p : q) : (p.z >= q.z ? p : q);
const KNOWN = new Set(['v', 'progress', 'dailies', 'map']);

export function mergeProgress(a, b){
  a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
  const out = { v:1, progress:{}, dailies:{} };
  const pa = cleanIsles(a.progress), pb = cleanIsles(b.progress);
  for(const k of [...new Set([...Object.keys(pa), ...Object.keys(pb)])].sort()) out.progress[k] = mergeEntry(pa[k], pb[k]);
  const da = cleanDailies(a.dailies), db = cleanDailies(b.dailies);
  for(const k of [...new Set([...Object.keys(da), ...Object.keys(db)])].sort()) out.dailies[k] = Math.max(da[k] ?? 0, db[k] ?? 0);
  const ma = cleanMap(a.map), mb = cleanMap(b.map);
  if(ma || mb){
    out.map = { explored:cleanSet([...(ma?.explored || []), ...(mb?.explored || [])]), lit:cleanSet([...(ma?.lit || []), ...(mb?.lit || [])]) };
    const pos = laterPos(ma?.pos, mb?.pos);
    if(pos) out.map.pos = pos;
  }
  // forward compatibility: keys this version doesn't know ride along, b over a
  for(const src of [a, b]) for(const k of Object.keys(src)) if(!KNOWN.has(k) && !BAD_KEY.has(k)) out[k] = src[k];
  return out;
}

// ---- sanitize (the trust boundary) -----------------------------------------
// -> a clean save, or null when it is not a save at all / too big. Unknown keys are dropped.
export function sanitizeProgress(x){
  if(!isObj(x)) return null;
  // absurd input is refused, not truncated
  if(isObj(x.progress) && Object.keys(x.progress).length > MAX_ISLES) return null;
  const out = { v:1, progress:cleanIsles(x.progress), dailies:cleanDailies(x.dailies) };
  const map = cleanMap(x.map);
  if(map) out.map = map;
  return JSON.stringify(out).length > MAX_BYTES ? null : out;
}
