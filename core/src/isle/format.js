// @klar/core — Isle format (schemaVersion 5, and 6 for archipelago maps). Pure. No DOM, no I/O.
//
// An isle is a small grid written as rows of space-separated TOKENS. Each token
// is one tile character plus an optional height digit (0-5, default 0):
//
//     "rows": [ "-  ,2 G2 ,2 -",
//               "T  .1 ^1 .1 T",
//               ".  S  .  >  .1" ]
//
// Row 0 is NORTH (far from the camera); column 0 is WEST. That one rule, plus
// the tile table below, is the whole language — small enough that a person or
// a builder bot can write an isle from a sentence, and the solver checks it.
//
// ARCHIPELAGO MAPS (schemaVersion 6, decision K4). Up to 3 isles ("storeys"),
// each its own grid, placed on one map at [x, z, altitude]:
//
//     "storeys": [ { "rows":[…], "at":[0, 0, 0]  },
//                  { "rows":[…], "at":[2, 1, 10] } ]      // floats above the first
//
// x / z are map tiles, altitude is in height levels (the unit of the height
// digit). Inside a storey every rule is unchanged. Storeys are flattened into
// ONE indexed cell list (side by side, a void column between them), and
// movement never crosses a storey edge — only a GATEWAY does: an arch pair
// whose two arches sit on different storeys. v5 files stay valid forever and
// keep their exact hash; the new tiles (pans a/b, arch C r) are v6-only.
import { sha256hex, stableStringify } from '../schema.js';

export const ISLE_SCHEMA = 5;                  // one isle: { rows }
export const MAP_SCHEMA = 6;                   // archipelago map: { storeys:[{ rows, at }] }
export const SCHEMAS = [ISLE_SCHEMA, MAP_SCHEMA];
export const MAX_W = 14, MAX_H = 14, MAX_LEVEL = 5, MAX_CRATES = 8;
export const MAX_STOREYS = 3, MAX_AT = 40, MAX_ALT = 24, STOREY_GAP = 8;
export const THEMES = ['jungle', 'oasis', 'tropical', 'urban', 'mountain'];

// Which schema a document is written in: a map has "storeys", an isle has "rows".
export const schemaOf = doc => doc && doc.storeys !== undefined ? MAP_SCHEMA : ISLE_SCHEMA;

// kind: what the rules see.  solid: walkable floor (before state is applied).
// v6: only allowed in archipelago maps (schemaVersion 6).
export const TILES = {
  '.': { kind:'ground', label:'Ground' },
  ',': { kind:'ground', flora:true, label:'Flowers' },
  'S': { kind:'ground', start:true, label:'Start' },
  'G': { kind:'goal',   label:'Goal' },
  '#': { kind:'rock',   label:'Rock' },
  'T': { kind:'tree',   label:'Tree' },
  '~': { kind:'water',  label:'Water' },
  '*': { kind:'ice',    label:'Ice' },
  '^': { kind:'ramp', dir:'U', label:'Ramp ↑' },
  'v': { kind:'ramp', dir:'D', label:'Ramp ↓' },
  '<': { kind:'ramp', dir:'L', label:'Ramp ←' },
  '>': { kind:'ramp', dir:'R', label:'Ramp →' },
  'C': { kind:'ground', crate:true, label:'Crate' },
  'o': { kind:'plate',  label:'Plate' },
  'D': { kind:'gate',   label:'Gate' },
  'L': { kind:'lever',  label:'Lever' },
  '=': { kind:'bridge', on:true,  label:'Bridge (up)' },
  '_': { kind:'bridge', on:false, label:'Bridge (down)' },
  'k': { kind:'ground', key:true, label:'Key' },
  'K': { kind:'door',   label:'Door' },
  'p': { kind:'portal', pair:'p', label:'Portal A' },
  'q': { kind:'portal', pair:'q', label:'Portal B' },
  'r': { kind:'portal', pair:'r', label:'Portal C', v6:true },
  'a': { kind:'pan', pan:'a', label:'Pan A', v6:true },     // Sky Scales (K1): two pans on one vine
  'b': { kind:'pan', pan:'b', label:'Pan B', v6:true },
  '-': { kind:'void',   label:'Empty' },
};

export const MOVE_DIRS = { U:[0,-1], D:[0,1], L:[-1,0], R:[1,0] };
export const OPP  = { U:'D', D:'U', L:'R', R:'L' };
export const MOVES = ['U','D','L','R','X'];   // X = use (pull a lever you stand on)

const TOKEN = /^([.,SG#T~*^v<>CoDL=_kKpqrab-])([0-5])?$/;
const PAIRS = ['p', 'q', 'r'];

export const ERR = {
  E_ROWS:'rows must be a non-empty list of strings',
  E_SIZE:`isle must be at most ${MAX_W} wide and ${MAX_H} tall`,
  E_RAGGED:'every row needs the same number of tiles',
  E_TOKEN:'unknown tile',
  E_START:'needs exactly one start (S)',
  E_GOAL:'needs at least one goal (G)',
  E_PORTAL:'arches come in pairs — each of p / q / r appears 0 or 2 times',
  E_GATE:'a gate (D) needs at least one plate (o) to open it',
  E_CRATES:`at most ${MAX_CRATES} crates`,
  E_THEME:'unknown theme',
  E_STOREYS:`storeys must be a list of 1 to ${MAX_STOREYS} isles, each { rows, at:[x, z, altitude] }`,
  E_AT:`each storey needs "at": [x, z, altitude] — whole numbers, x and z 0–${MAX_AT}, altitude 0–${MAX_ALT}`,
  E_OVERLAP:`storeys that overlap on the map must float at least ${STOREY_GAP} levels apart`,
  E_V6:'pans (a, b) and arch C (r) need an archipelago map (schemaVersion 6 with "storeys")',
  E_PANS:'Sky Scales need both pans — at least one a and one b',
  E_PAN_H:'a pan needs a base height from 1 to 4 (it moves one level down and up)',
  E_PAN_PLAIN:'a pan is plain ground — it cannot also be water, ice, a plate, a crate, a start, a goal or a key',
};

const validAt = at => Array.isArray(at) && at.length === 3 && at.every(Number.isInteger)
  && at[0] >= 0 && at[1] >= 0 && at[0] <= MAX_AT && at[1] <= MAX_AT && at[2] >= 0 && at[2] <= MAX_ALT;

// doc -> { ok, errors:[{code,text,at?}], level }
// level is the normalized, rule-ready form the engine and renderer consume.
// level.storeys = [{ w, h, at, x0 }] (x0 = first column in the flattened grid),
// level.sid[i] = storey of cell i (-1 = padding between storeys).
export function parseIsle(doc){
  const errors = [];
  const fail = (code, at) => errors.push(at ? { code, text:ERR[code], at } : { code, text:ERR[code] });
  const none = () => ({ ok:false, errors, level:null });
  const map = schemaOf(doc) === MAP_SCHEMA;
  let parts;
  if(map){
    const st = doc.storeys;
    if(!Array.isArray(st) || !st.length || st.length > MAX_STOREYS || st.some(s => !s || typeof s !== 'object' || Array.isArray(s))){ fail('E_STOREYS'); return none(); }
    parts = st;
  } else parts = [{ rows:doc && doc.rows }];

  const storeys = [];
  for(const s of parts){
    const rows = s.rows;
    if(!Array.isArray(rows) || !rows.length || rows.some(r => typeof r !== 'string')){ fail('E_ROWS'); return none(); }
    const grid = rows.map(r => r.trim().split(/\s+/));
    const h = grid.length, w = grid[0].length;
    if(w > MAX_W || h > MAX_H) fail('E_SIZE');
    if(grid.some(r => r.length !== w)) { fail('E_RAGGED'); return none(); }
    const ok = !map || validAt(s.at);
    if(!ok) fail('E_AT');
    storeys.push({ grid, w, h, at:map && ok ? s.at.slice() : [0, 0, 0] });
  }
  // Storeys that share map tiles must float well apart, so the lower one stays readable.
  for(let a = 0; a < storeys.length; a++) for(let b = a + 1; b < storeys.length; b++){
    const A = storeys[a], B = storeys[b];
    const overlap = A.at[0] < B.at[0] + B.w && B.at[0] < A.at[0] + A.w && A.at[1] < B.at[1] + B.h && B.at[1] < A.at[1] + A.h;
    if(overlap && Math.abs(A.at[2] - B.at[2]) < STOREY_GAP) fail('E_OVERLAP');
  }

  const theme = doc.theme || 'jungle';
  if(!THEMES.includes(theme)) fail('E_THEME');

  // flatten: storeys side by side, one void column between them (a v5 isle is exactly its grid)
  let x0 = 0;
  for(const s of storeys){ s.x0 = x0; x0 += s.w + 1; }
  const W = x0 - 1, H = Math.max(...storeys.map(s => s.h));
  const cells = Array.from({ length:W * H }, () => ({ kind:'void', h:0, ch:'-' }));
  const sid = new Int8Array(W * H).fill(-1);
  storeys.forEach((s, k) => {
    for(let z = 0; z < s.h; z++) for(let x = 0; x < s.w; x++){
      const i = z*W + s.x0 + x, tok = s.grid[z][x], m = TOKEN.exec(tok);
      const at = map ? [x, z, k] : [x, z];
      sid[i] = k;
      if(!m){ fail(/^[ab][^0-5]|^[^ab][ab]$/.test(tok) ? 'E_PAN_PLAIN' : 'E_TOKEN', at); continue; }
      const t = TILES[m[1]];
      if(t.v6 && !map){ fail('E_V6', at); continue; }
      const cell = { kind:t.kind, h:m[2] ? +m[2] : 0, ch:m[1] };
      if(t.dir) cell.dir = t.dir;
      if(t.kind === 'bridge') cell.on = t.on;
      if(t.flora) cell.flora = true;
      if(t.pan){ cell.pan = t.pan; if(cell.h < 1 || cell.h > MAX_LEVEL - 1) fail('E_PAN_H', at); }
      cells[i] = cell;
    }
  });

  const start = [], goals = [], crates = [], keys = [], plates = [],
        gates = [], doors = [], levers = [], bridges = [], portals = { p:[], q:[], r:[] }, pans = { a:[], b:[] };
  for(let i = 0; i < cells.length; i++){
    const c = cells[i], t = TILES[c.ch];
    if(t.start) start.push(i);
    if(t.kind === 'goal') goals.push(i);
    if(t.crate) crates.push(i);
    if(t.key) keys.push(i);
    if(t.kind === 'plate') plates.push(i);
    if(t.kind === 'gate') gates.push(i);
    if(t.kind === 'door') doors.push(i);
    if(t.kind === 'lever') levers.push(i);
    if(t.kind === 'bridge') bridges.push(i);
    if(t.pair) portals[t.pair].push(i);
    if(t.pan) pans[t.pan].push(i);
  }
  if(start.length !== 1) fail('E_START');
  if(!goals.length) fail('E_GOAL');
  if(PAIRS.some(pr => portals[pr].length % 2 || portals[pr].length > 2)) fail('E_PORTAL');
  if(gates.length && !plates.length) fail('E_GATE');
  if(crates.length > MAX_CRATES) fail('E_CRATES');
  if(!pans.a.length !== !pans.b.length) fail('E_PANS');

  // Arch pairs. A pair whose arches sit on different storeys is a GATEWAY.
  const twin = {};
  for(const pr of PAIRS) if(portals[pr].length === 2){
    const [u, v] = portals[pr];
    twin[u] = v; twin[v] = u;
    if(sid[u] !== sid[v]) cells[u].gateway = cells[v].gateway = true;
  }
  const level = { w:W, h:H, theme, cells, start:start[0], goals, crates, keys, plates,
                  gates, doors, levers, bridges, twin,
                  pans: pans.a.length && pans.b.length ? pans : null,
                  storeys: storeys.map(({ w, h, at, x0 }) => ({ w, h, at, x0 })), sid,
                  name: String(doc.name || 'Untitled isle').slice(0, 60) };
  return { ok: errors.length === 0, errors, level };
}

// Map position of cell i: its storey, column and row inside that storey, and
// where it sits on the whole map (x/z in tiles). Renderer and audit tools use it.
export function cellPlace(level, i){
  const k = level.sid[i], s = level.storeys[Math.max(0, k)];
  const x = i % level.w - s.x0, z = (i / level.w) | 0;
  return { storey:k, x, z, mx:s.at[0] + x, mz:s.at[1] + z };
}

// Canonical identity of an isle: geometry + theme. Name, author, par, hints and
// solutions are presentation/provenance and never change the content hash.
// The v5 branch is frozen: every isle published before maps keeps its hash.
export function canonicalIsle(doc){
  const norm = rows => (rows || []).map(r => String(r).trim().split(/\s+/).join(' '));
  if(schemaOf(doc) === MAP_SCHEMA){
    const st = Array.isArray(doc.storeys) ? doc.storeys : [];
    return { schemaVersion:MAP_SCHEMA, theme: doc.theme || 'jungle',
             storeys: st.map(s => ({ rows:norm(s && s.rows), at:(s && Array.isArray(s.at) ? s.at : []).map(Number) })) };
  }
  return { schemaVersion:ISLE_SCHEMA, theme: doc.theme || 'jungle', rows:norm(doc.rows) };
}

// The isle's content address (hex SHA-256 of the canonical form). Same isle,
// same hash, in browser and Node — it is the share-link id and the DB key.
export const isleHash = doc => sha256hex(stableStringify(canonicalIsle(doc)));
