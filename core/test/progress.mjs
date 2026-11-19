// @klar/core — progress save tests (zero deps): node core/test/progress.mjs
// mergeProgress must be idempotent, commutative on bests, and never lose a clear;
// sanitizeProgress must refuse junk and oversize saves.
import assert from 'node:assert';
import { mergeProgress, sanitizeProgress, MAX_BYTES, MAX_ISLES } from '../src/progress.js';

let pass = 0, fail = 0;
const t = (name, cond) => { if(cond){ pass++; } else { fail++; console.error('FAIL:', name); } };
const same = (name, x, y) => { try { assert.deepStrictEqual(x, y); pass++; } catch { fail++; console.error('FAIL:', name, JSON.stringify(x), JSON.stringify(y)); } };

const A = { progress:{ 'o:a':{ stars:2, moves:12, time:30 }, 'o:b':{ stars:3, moves:9 } }, dailies:{ '2026-11-01':2 },
  map:{ pos:{ x:1, z:2, t:100 }, explored:['0,0', '1,0'], lit:['o:a'] } };
const B = { progress:{ 'o:a':{ stars:3, moves:14, time:20, seeds:2 }, 'o:c':{ stars:1, moves:5 } }, dailies:{ '2026-11-01':1, '2026-11-02':3 },
  map:{ pos:{ x:9, z:9, t:200 }, explored:['1,0', '2,0'], lit:['o:c'] } };

// rules
const M = mergeProgress(A, B);
same('stars max', M.progress['o:a'].stars, 3);
same('moves min', M.progress['o:a'].moves, 12);
same('time min', M.progress['o:a'].time, 20);
same('seeds max', M.progress['o:a'].seeds, 2);
same('keeps both sides', Object.keys(M.progress), ['o:a', 'o:b', 'o:c']);
same('dailies union + max', M.dailies, { '2026-11-01':2, '2026-11-02':3 });
same('explored union', M.map.explored, ['0,0', '1,0', '2,0']);
same('lit union', M.map.lit, ['o:a', 'o:c']);
same('pos = larger t', M.map.pos, { x:9, z:9, t:200 });
same('pos either order', mergeProgress(B, A).map.pos, { x:9, z:9, t:200 });

// algebra
same('idempotent', mergeProgress(M, M), M);
same('merge(x, x) = normalised x', mergeProgress(A, A), mergeProgress(A, {}));
same('commutative', mergeProgress(A, B), mergeProgress(B, A));
same('associative', mergeProgress(mergeProgress(A, B), A), mergeProgress(A, mergeProgress(B, A)));
same('null is identity', mergeProgress(A, null), mergeProgress(A, {}));
same('absent map stays absent', 'map' in mergeProgress({ progress:{ 'o:x':{ stars:1 } } }, {}), false);
same('map from one side only', mergeProgress({}, { map:{ explored:['3,3'] } }).map, { explored:['3,3'], lit:[] });

// never lose a clear: whatever order, whatever junk, a cleared isle stays cleared
for(const junk of [null, 5, 'x', [], { progress:'no' }, { progress:{ 'o:a':{ stars:'3' } } }, { progress:{ 'o:a':{ stars:-1, moves:0, time:NaN } } }]){
  const m = mergeProgress(A, junk), m2 = mergeProgress(junk, A);
  t('clear survives junk ' + JSON.stringify(junk), m.progress['o:a'].stars >= 2 && m2.progress['o:a'].stars >= 2 && m.progress['o:a'].moves === 12);
}
t('invalid moves/time ignored', mergeProgress({ progress:{ 'o:a':{ stars:1, moves:7 } } }, { progress:{ 'o:a':{ stars:1, moves:-3, time:-1 } } }).progress['o:a'].moves === 7);
t('missing time kept from the side that has it', mergeProgress({ progress:{ 'o:a':{ stars:1, time:9 } } }, { progress:{ 'o:a':{ stars:2 } } }).progress['o:a'].time === 9);
same('unknown keys kept, b wins', mergeProgress({ x:1, y:1 }, { x:2 }).x, 2);
same('unknown key from a kept', mergeProgress({ y:1 }, { x:2 }).y, 1);
mergeProgress(JSON.parse('{"__proto__":{"polluted":1}}'), {});
t('__proto__ never merged', !('polluted' in {}));

// sanitize
const S = sanitizeProgress(A);
t('sanitize keeps a good save', S && S.progress['o:a'].stars === 2 && S.dailies['2026-11-01'] === 2 && S.map.pos.t === 100);
same('sanitize is idempotent', sanitizeProgress(S), S);
for(const bad of [null, undefined, 5, 'x', [], true]) t('sanitize rejects ' + JSON.stringify(bad), sanitizeProgress(bad) === null);
const dirty = sanitizeProgress({ evil:'<script>', progress:{ 'o:a':{ stars:9, moves:'x' }, '../../etc':{ stars:1 }, 'o:ok':{ stars:1, moves:4, extra:1 } },
  dailies:{ 'not-a-date':1, '2026-11-01':7, '2026-11-02':2 }, map:{ pos:{ x:'a', z:1, t:1 }, explored:['ok', 5, { a:1 }, 'a'.repeat(81)], lit:'nope' } });
same('sanitize drops junk', dirty, { v:1, progress:{ 'o:ok':{ stars:1, moves:4 } }, dailies:{ '2026-11-02':2 }, map:{ explored:['ok'], lit:[] } });
const many = {}; for(let i = 0; i <= MAX_ISLES; i++) many['o:' + i] = { stars:1 };
t('sanitize rejects too many isles', sanitizeProgress({ progress:many }) === null);
const big = {}; for(let i = 0; i < 2000; i++) big['o:isle-number-' + i] = { stars:3, moves:99999, time:123.456, seeds:12 };
t('sanitize rejects oversize (> 64 KB)', JSON.stringify(big).length > MAX_BYTES && sanitizeProgress({ progress:big }) === null);

console.log(`progress: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
