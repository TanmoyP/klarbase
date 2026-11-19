// @klar/core — Sky Atlas: walking the overworld. Pure.
//
// The overworld obeys rule 1 of the isles — and obeys it by CALLING rules.js's own heightStep
// (same level, hop down exactly one, climb only along a ramp's slope), not by copying it.
// Rock, tree, water and sky block; bridges and shrines are plain walkable floor.
import { MOVE_DIRS } from '../isle/format.js';
import { heightStep } from '../isle/rules.js';
import { CHUNK, ATLAS_SEED, WALKABLE, chunkAt, spawnOf } from './chunk.js';

// A small LRU of chunks, so walking and drawing across a seam stays cheap.
const LRU = new Map(), LRU_MAX = 64;
export function chunkCached(seed, cx, cz){
  const key = seed + '/' + cx + '/' + cz;
  let c = LRU.get(key);
  if(c){ LRU.delete(key); LRU.set(key, c); return c; }
  c = chunkAt(seed, cx, cz);
  LRU.set(key, c);
  if(LRU.size > LRU_MAX) LRU.delete(LRU.keys().next().value);
  return c;
}

// The cell at map tile (x, z): { kind, h, ch, dir?, flora?, theme } (see chunk.js).
export function cellAt(seed, x, z){
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  return chunkCached(seed, cx, cz).cells[(z - cz * CHUNK) * CHUNK + (x - cx * CHUNK)];
}

export const isWalkable = cell => WALKABLE.has(cell.kind);

// One step from {x, z} in 'U' (north, z-1) | 'D' | 'L' | 'R'.
// -> { ok:true, to:{x, z, h}, kind:'flat'|'ramp'|'down'|'bridge' } | { ok:false }
//    h = the height of the tile stepped onto (a ramp's own base level); kind 'bridge' = a flat
//    step on or off a bridge span.
export function canStep(seed, from, dir){
  const d = MOVE_DIRS[dir];
  if(!d) return { ok:false };
  const a = cellAt(seed, from.x, from.z);
  const x = from.x + d[0], z = from.z + d[1], b = cellAt(seed, x, z);
  if(!isWalkable(a) || !isWalkable(b)) return { ok:false };
  const k = heightStep({ cells:[a, b] }, 0, 1, dir, 0);
  if(!k) return { ok:false };
  return { ok:true, to:{ x, z, h:b.h }, kind:k === 'flat' && (a.kind === 'bridge' || b.kind === 'bridge') ? 'bridge' : k };
}

// Where Pip starts on a fresh atlas (a jungle isle, hub tile of quadrant (0,0)).
export { spawnOf };
export const SPAWN = spawnOf(ATLAS_SEED);
