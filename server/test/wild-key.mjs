// Wild-isle key tests (zero deps, no DB): node server/test/wild-key.mjs
// parseWildKey is the one parse for `w/<x>,<z>`; wildExists = "a shrine slot stands there" (cellAt), behind an LRU.
import { parseWildKey, wildExists, lruMemo, WILD_LIMIT } from '../src/routes/wild-key.js';
import { ATLAS_SEED, wildIsle, placeContent, shrineAt, chunkAt } from '@klar/core';

let pass = 0, fail = 0;
const t = (name, cond) => { if(cond) pass++; else { fail++; console.error('FAIL:', name); } };

/* ---- parse ---- */
t('plain', JSON.stringify(parseWildKey('w/12,34')) === '{"x":12,"z":34}');
t('negatives', JSON.stringify(parseWildKey('w/-5,-6')) === '{"x":-5,"z":-6}');
t('zero', JSON.stringify(parseWildKey('w/0,0')) === '{"x":0,"z":0}');
t('limit ok', parseWildKey(`w/${WILD_LIMIT},-${WILD_LIMIT}`) !== null);
for(const k of ['w/1000001,0', 'w/0,-1000001', 'w/12345678,0', 'w/1.5,2', 'w/1,2,3', 'w/,1', 'w/1,', 'w/ 1,2', 'w/+1,2', 'w/01,2', 'w/-0,1', 'w/1;2', 'w/1,2 ',
  'W/1,2', 'o/1,2', 'w:1,2', 'w/1e3,2', 'w/0x10,2', 'w/NaN,1', '', 'w/', 'w/9'.repeat(10), null, undefined, 12, {}, ['w/1,2']])
  t('refused: ' + JSON.stringify(k), parseWildKey(k) === null);

/* ---- existence: one code path with the client (wildIsle) ---- */
const slots = [];
for(let cz = -1; cz <= 1; cz++) for(let cx = -1; cx <= 1; cx++) for(const s of chunkAt(ATLAS_SEED, cx, cz).shrines) slots.push(s);
t('found shrine slots', slots.length >= 8);
let some = 0;
for(const s of slots.slice(0, 6)){ const w = wildIsle(ATLAS_SEED, s.x, s.z); t('a shrine slot exists at ' + s.key, wildExists(s.key) === true); if(w) some++; }
t('most slots hold a puzzle', some >= 4);
t('a non-shrine tile never exists', wildExists('w/0,0') === false || slots.some(s => s.key === 'w/0,0'));
t('far-off key does not throw', typeof wildExists('w/999999,-999999') === 'boolean');
t('garbage is false', wildExists('w/abc') === false && wildExists('o/x') === false);

/* ---- LRU ---- */
let calls = 0; const m = lruMemo(3, k => (calls++, k * 2));
m(1); m(2); m(3); m(1); t('hit does not recompute', calls === 3);
m(4); t('bounded', m.size() === 3);
m(2); t('least recently used went first (2 recomputed)', calls === 5);
m(1); t('recently used survived', calls === 5);

console.log(`wild-key: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
