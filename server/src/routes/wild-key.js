// Sky Atlas wild-isle keys: `w/<x>,<z>` — a shrine tile of the endless overworld (core/src/atlas).
// Pure (no DB, no Express): the key parse, and "does a wild isle stand there?" by regenerating it with
// the SAME @klar/core function the client uses (wildIsle) — one code path, nothing stored per isle.
// The tile must be a shrine slot (cellAt) — otherwise anyone could mint a row per coordinate — and
// a small LRU keeps repeated stat posts for popular shrines off the generator (p95 ≈ 65 ms a miss).
import { ATLAS_SEED, wildIsle, cellAt } from '@klar/core';

export const WILD_LIMIT = 1e6;                       // |x|, |z| ≤ 1 000 000: well inside float-exact territory
const WILD_KEY = /^w\/(-?\d{1,7}),(-?\d{1,7})$/;

// 'w/12,-7' -> { x:12, z:-7 } | null  (canonical form only: no '+', no leading zeros, no '-0')
export function parseWildKey(key){
  if(typeof key !== 'string' || key.length > 20) return null;
  const m = WILD_KEY.exec(key);
  if(!m) return null;
  const x = +m[1], z = +m[2];
  if(Math.abs(x) > WILD_LIMIT || Math.abs(z) > WILD_LIMIT) return null;
  if(key !== `w/${x},${z}`) return null;             // '007', '-0' and friends are not canonical keys
  return { x, z };
}

// A bounded memo: least recently used key goes first.
export function lruMemo(max, fn){
  const m = new Map();
  const get = k => {
    if(m.has(k)){ const v = m.get(k); m.delete(k); m.set(k, v); return v; }
    const v = fn(k); m.set(k, v);
    if(m.size > max) m.delete(m.keys().next().value);
    return v;
  };
  get.size = () => m.size;
  return get;
}

function check(key){
  const p = parseWildKey(key);
  if(!p) return false;
  try { return cellAt(ATLAS_SEED, p.x, p.z).kind === 'shrine' && wildIsle(ATLAS_SEED, p.x, p.z) !== null; } catch { return false; }
}
// true iff a shrine stands at the tile AND a puzzle is generated there (wildIsle is null for the rare empty slot)
export const wildExists = lruMemo(1000, check);
