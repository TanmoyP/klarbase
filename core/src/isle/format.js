// @klar/core — Isle format (schemaVersion 5). Pure. No DOM, no I/O.
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
import { sha256hex, stableStringify } from '../schema.js';

export const ISLE_SCHEMA = 5;
export const MAX_W = 14, MAX_H = 14, MAX_LEVEL = 5, MAX_CRATES = 8;
export const THEMES = ['jungle', 'oasis', 'tropical', 'urban', 'mountain'];

// kind: what the rules see.  solid: walkable floor (before state is applied).
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
  '-': { kind:'void',   label:'Empty' },
};

export const MOVE_DIRS = { U:[0,-1], D:[0,1], L:[-1,0], R:[1,0] };
export const OPP  = { U:'D', D:'U', L:'R', R:'L' };
export const MOVES = ['U','D','L','R','X'];   // X = use (pull a lever you stand on)

const TOKEN = /^([.,SG#T~*^v<>CoDL=_kKpq-])([0-5])?$/;

export const ERR = {
  E_ROWS:'rows must be a non-empty list of strings',
  E_SIZE:`isle must be at most ${MAX_W} wide and ${MAX_H} tall`,
  E_RAGGED:'every row needs the same number of tiles',
  E_TOKEN:'unknown tile',
  E_START:'needs exactly one start (S)',
  E_GOAL:'needs at least one goal (G)',
  E_PORTAL:'portals come in pairs — each of p / q appears 0 or 2 times',
  E_GATE:'a gate (D) needs at least one plate (o) to open it',
  E_CRATES:`at most ${MAX_CRATES} crates`,
  E_THEME:'unknown theme',
};

// doc -> { ok, errors:[{code,text,at?}], level }
// level is the normalized, rule-ready form the engine and renderer consume.
export function parseIsle(doc){
  const errors = [];
  const fail = (code, at) => errors.push(at ? { code, text:ERR[code], at } : { code, text:ERR[code] });
  const rows = doc && doc.rows;
  if(!Array.isArray(rows) || !rows.length || rows.some(r => typeof r !== 'string')){
    fail('E_ROWS'); return { ok:false, errors, level:null };
  }
  const grid = rows.map(r => r.trim().split(/\s+/));
  const h = grid.length, w = grid[0].length;
  if(w > MAX_W || h > MAX_H) fail('E_SIZE');
  if(grid.some(r => r.length !== w)) { fail('E_RAGGED'); return { ok:false, errors, level:null }; }

  const theme = doc.theme || 'jungle';
  if(!THEMES.includes(theme)) fail('E_THEME');

  const cells = [], start = [], goals = [], crates = [], keys = [], plates = [],
        gates = [], doors = [], levers = [], bridges = [], portals = { p:[], q:[] };
  for(let z=0; z<h; z++) for(let x=0; x<w; x++){
    const m = TOKEN.exec(grid[z][x]);
    const i = z*w + x;
    if(!m){ fail('E_TOKEN', [x,z]); cells.push({ kind:'void', h:0, ch:'-' }); continue; }
    const t = TILES[m[1]];
    const cell = { kind:t.kind, h:m[2] ? +m[2] : 0, ch:m[1] };
    if(t.dir) cell.dir = t.dir;
    if(t.kind === 'bridge') cell.on = t.on;
    if(t.flora) cell.flora = true;
    cells.push(cell);
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
  }
  if(start.length !== 1) fail('E_START');
  if(!goals.length) fail('E_GOAL');
  if(portals.p.length % 2 || portals.p.length > 2 || portals.q.length % 2 || portals.q.length > 2) fail('E_PORTAL');
  if(gates.length && !plates.length) fail('E_GATE');
  if(crates.length > MAX_CRATES) fail('E_CRATES');

  const twin = {};
  for(const pr of ['p','q']) if(portals[pr].length === 2){
    twin[portals[pr][0]] = portals[pr][1]; twin[portals[pr][1]] = portals[pr][0];
  }
  const level = { w, h, theme, cells, start:start[0], goals, crates, keys, plates,
                  gates, doors, levers, bridges, twin,
                  name: String(doc.name || 'Untitled isle').slice(0, 60) };
  return { ok: errors.length === 0, errors, level };
}

// Canonical identity of an isle: geometry + theme. Name, author, par, hints and
// solutions are presentation/provenance and never change the content hash.
export function canonicalIsle(doc){
  const rows = (doc.rows || []).map(r => String(r).trim().split(/\s+/).join(' '));
  return { schemaVersion:ISLE_SCHEMA, theme: doc.theme || 'jungle', rows };
}

// The isle's content address (hex SHA-256 of the canonical form). Same isle,
// same hash, in browser and Node — it is the share-link id and the DB key.
export const isleHash = doc => sha256hex(stableStringify(canonicalIsle(doc)));
