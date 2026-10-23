// @klar/core — difficulty + daily tests (zero deps): node core/test/difficulty.mjs
// The audit, the K3 score, the `tier` field, the Twist isles' targets, and the
// Daily Isle (pick, numbering, share text, dated-file rules).
import {
  parseIsle, isleHash, CURATED_ISLES, checkCommunityIsle, toCommunityFile, checkDailyIsle,
  TIERS, TIER_IDS, tierOf, tierById, auditIsle, provisionalTier, provisionalPrior, observedScore, difficultyScore,
  harderHints, gutMismatch, PRIOR_WEIGHT, timeBucket, TIME_BUCKETS, playSummary,
  dailyPick, dailyNumber, dailyEpoch, dailyShareText, utcDate, DAILY_EPOCH,
} from '../src/isle/index.js';

let pass = 0, fail = 0;
const t = (name, cond) => { if(cond) pass++; else { fail++; console.error('FAIL:', name); } };
const L = (rows, theme) => { const r = parseIsle({ rows, theme }); if(!r.ok) throw new Error(JSON.stringify(r.errors)); return r.level; };
const audit = id => auditIsle(parseIsle(CURATED_ISLES.find(i => i.id === id)).level);
const near = (a, b, eps = 0.051) => Math.abs(a - b) < eps;

/* ---------------- tiers ---------------- */
t('six tiers, contiguous 0..100', TIERS.length === 6 && TIERS[0].min === 0 && TIERS.at(-1).max === 100 && TIERS.every((x, i) => !i || x.min === TIERS[i - 1].max));
t('tier names', TIERS.map(x => x.name).join() === 'Breeze,Easy,Tricky,Hard,Fiendish,Mythic');
t('tierOf bands', tierOf(0).id === 'breeze' && tierOf(15).id === 'easy' && tierOf(54.9).id === 'tricky' && tierOf(72).id === 'fiendish' && tierOf(100).id === 'mythic');
t('tierById', tierById('hard').name === 'Hard' && tierById('nope') === null);

/* ---------------- the audit (same numbers tools/difficulty.mjs printed before the move) ---------------- */
{ const a = audit('crosswalk'); t('audit crosswalk', a.states === 4149 && a.traps === 1 && a.routes === 19 && a.par === 24 && !a.greedy && a.deadPct === 57 && a.away === 9); }
{ const a = audit('first-steps'); t('audit first-steps', a.states === 9 && a.traps === 0 && a.routes === 2 && a.par === 4 && !a.capped); }
{ const a = audit('palm-plates'); t('audit palm-plates', a.states === 174 && a.traps === 3 && a.routes === 6 && a.away === 9); }
t('audit: greedy wins twin-mirages', audit('twin-mirages').greedy === true);
t('audit: greedy fails the-peak', audit('the-peak').greedy === false);
{ const a = auditIsle(parseIsle(CURATED_ISLES.find(i => i.id === 'crosswalk')).level, { maxStates:100 }); t('audit caps', a.capped && a.states === 100 && a.par === null); }
{ const a = auditIsle(L(['S # G'])); t('audit: unsolvable isle', a.par === null && a.routes === 0 && a.deadPct === 100); }
{ const a = auditIsle(L(['S . . G'])); t('audit: straight walk = greedy, 1 route', a.greedy && a.routes === 1 && a.par === 3); }

/* ---------------- provisional prior (§4.2) ---------------- */
const A = (states, traps, greedy, routes) => ({ states, traps, greedy, routes, par:10, capped:false });
t('prior: greedy → Breeze', provisionalTier(A(5000, 4, true, 1)).id === 'breeze');
t('prior: tiny → Breeze', provisionalTier(A(30, 0, false, 3)).id === 'breeze');
t('prior: Easy', provisionalTier(A(120, 1, false, 9)).id === 'easy');
t('prior: Tricky', provisionalTier(A(900, 2, false, 5)).id === 'tricky');
t('prior: Tricky needs ≤ 6 routes', provisionalTier(A(900, 2, false, 7)).id === 'easy');
t('prior: Hard', provisionalTier(A(5000, 3, false, 4)).id === 'hard');
t('prior: Fiendish', provisionalTier(A(50000, 4, false, 2)).id === 'fiendish');
t('prior: Mythic by traps', provisionalTier(A(40000, 6, false, 1)).id === 'mythic');
t('prior: Mythic by size', provisionalTier(A(160000, 2, false, 1)).id === 'mythic');
t('prior: traps alone never make a small isle Mythic', provisionalTier(A(4000, 9, false, 1)).id === 'hard');
t('prior: capped → Fiendish', provisionalTier({ states:200000, capped:true }).id === 'fiendish');
t('prior: none → Easy', provisionalTier(null).id === 'easy');
t('prior lands inside its band', [A(30, 0, false, 1), A(120, 1, false, 9), A(900, 2, false, 5), A(5000, 3, false, 4), A(50000, 4, false, 2), A(1e6, 7, false, 1)]
  .every(a => tierOf(provisionalPrior(a)).id === provisionalTier(a).id));
t('prior grows with states inside a band', provisionalPrior(A(3100, 3, false, 1)) < provisionalPrior(A(20000, 3, false, 1)));

/* ---------------- observed score ---------------- */
const base = { started:100, cleared:80, hints:20, restarts:30, moves:{ 20:40, 24:40 }, time:{ 3:50, 4:30 }, par:18 };
const obs = patch => observedScore({ ...base, ...patch });
t('observed: null without attempts', observedScore({ started:0 }) === null && observedScore(null) === null);
t('observed: 0..100', obs({}) >= 0 && obs({}) <= 100);
t('observed: everyone clears instantly at par → 0', observedScore({ started:10, cleared:10, hints:0, restarts:0, moves:{ 18:10 }, time:{ 0:10 }, par:18 }) === 0);
t('observed: nobody clears, many hints → 100', observedScore({ started:10, cleared:0, hints:40, restarts:40, par:18 }) === 100);
t('observed: fewer clears → harder', obs({ cleared:40 }) > obs({}));
t('observed: more hints → harder', obs({ hints:150 }) > obs({}));
t('observed: more restarts → harder', obs({ restarts:120 }) > obs({}));
t('observed: more moves over par → harder', obs({ moves:{ 40:80 } }) > obs({}));
t('observed: slower → harder', obs({ time:{ 7:80 } }) > obs({}));
t('observed: clears never exceed attempts', obs({ cleared:500 }) === obs({ cleared:100 }));
t('time buckets', timeBucket(10000) === 0 && timeBucket(15000) === 0 && timeBucket(16000) === 1 && timeBucket(9e9) === TIME_BUCKETS.length - 1);

/* ---------------- the K3 score ---------------- */
{ const d = difficultyScore({ tier:'hard' }); t('score: gut call alone = tier midpoint, settling', d.score === 64 && d.tier.id === 'hard' && d.n === 0 && d.settling && d.declared); }
{ const a = A(5000, 3, false, 4), d = difficultyScore({ audit:a }); t('score: no tier → provisional prior', d.score === Math.round(provisionalPrior(a)) && !d.declared); }
t('score: nothing known → Easy', difficultyScore({}).tier.id === 'easy');
t('score: tier beats audit as the prior', difficultyScore({ tier:'breeze', audit:A(50000, 4, false, 1) }).score === 8);
{ const s = { started:20, cleared:20, hints:0, restarts:0, moves:{ 18:20 }, time:{ 0:20 }, par:18 }, d = difficultyScore({ tier:'hard', stats:s });
  t('score: (K·prior + n·observed)/(K+n)', d.score === Math.round((PRIOR_WEIGHT * 63.5 + 20 * 0) / (PRIOR_WEIGHT + 20)) && d.n === 20 && !d.settling); }
{ const s = { started:19, cleared:1, par:10 }; t('score: settling while n < 20', difficultyScore({ tier:'easy', stats:s }).settling); }
{ const s = { started:5000, cleared:5000, hints:0, restarts:0, moves:{ 10:5000 }, time:{ 0:5000 }, par:10 };
  t('score: the crowd takes over', difficultyScore({ tier:'mythic', stats:s }).score <= 1); }

/* ---------------- builder guidance ---------------- */
t('hints: greedy → block the direct line', harderHints(A(100, 0, true, 1)).some(h => /block the direct line/.test(h)));
t('hints: no traps → crate near water', harderHints(A(400, 0, false, 1)).some(h => /crate near water/.test(h)));
t('hints: many routes → narrow to one', harderHints(A(4000, 3, false, 5)).some(h => /narrow it to one/.test(h)));
t('hints: none for capped audits', harderHints({ capped:true }).length === 0);
t('gut mismatch warns', /audit reads Breeze/.test(gutMismatch('mythic', A(20, 0, true, 1)) || ''));
t('gut mismatch quiet when close', gutMismatch('easy', A(120, 1, false, 2)) === null && gutMismatch(null, A(1, 0, true, 1)) === null);

/* ---------------- the tier field ---------------- */
// Tier is a gut call, not geometry: every official hash is exactly what it was before tiers existed.
const HASHES = {
  'first-steps':'3727fc423dff6394079bc314af8f522391d8f98a0834f5720f2d43360879902c',
  'ledge-drop':'99c5f735c6050a3938d545f248b57a284afc86d5db90ed6460120d643df8defd',
  'mossy-crate':'ad4cc7140da0e471a025f39706c54fdcae246056c5dc4391e2cf4d5cbc7dbd80',
  'root-bridge':'a2e81391e8cc2bb4f2100ac29a15465c07b18469f3d61f7a4772a517b8460f8a',
  'fern-gate':'33414f684be9fb4209bd4285f6ac4f2af766f20e6caf46903eb2feeeed910f49',
  'mirage':'e48a1a2e4839444ec2b001b2db461817ff6e7491195479e14f928cb21468f8b9',
  'twin-mirages':'bf6206b7af47c312f9bea847b5b0751415a8ccbf730ee50a8edae6f7150e0399',
  'sunken-well':'c0b9d0f405f3e0d30fd403c412c8c7151eee09ecb334b6010740f09c344fd454',
  'palm-plates':'7689bc255286eee3154e9b3e33fc95c1f35c5f6bf0d22843a523467715b60176',
  'tide-lever':'01f6d885177e092b864cc789d47010cf9e151806a9cc25182c77b2f2962b8120',
  'low-tide':'9b73c0946422d507c13d431c5ae41741a52c4e2a32906bca7c9f648b028d4df6',
  'coconut-key':'f2dc0fc0d141c56f9bf2d56bf4be5e23e619fa2375757fbfa50226cec2564946',
  'lagoon-locks':'6661e5a333db60f2ec16c8cc6cf9b4c151fcc34bfd378c32722ec3015764a3d5',
  'rooftops':'9778d336a661dab80b80150c64ece128c2f97269d078f15ea19834f7f79267c9',
  'canal-lift':'821b902f8270dc7d46900a2794d7e8e1c1dbb2ce24ebea96680dfd24b56c0641',
  'subway':'cf4bbc10ed8b8576af82ba96b846f733c2db6d6bc6b6e0ed9b8899d48fe1e28d',
  'night-market':'52b27ff0f378bb5993e869e3d7ecf61f64fdc1906a5938e6edb22b450d8c7d79',
  'crosswalk':'4035f7cd57bc927c0c560d0bb0ec2b4a6bf7599e63e77e11743235c77467c748',
  'first-frost':'36f240d94f3c27f9357958a657cded9602c9b8d69aed6d1583c995a8bfcabe21',
  'glacier-stops':'aaa6c8e7d62ff8164f62aaa951cbaee8922ca26d619f7e1969d419e5bc44a304',
  'snowball':'af9088a168516109f7c8fab1735ea478a25e4f4e74f8bb123d1dabbc91931c8b',
  'glacier-maze':'521b0a5a7e3432c4fb2ae00885625fdb870113a03629e1bc590de667d754b17c',
  'frozen-gate':'5482153a39388a9bdeabd5af4f590cda81fde6201bd3430c380148aa632f3a61',
  'the-peak':'cd4133e4d647783778a3cd6ec8db4fc66228e6017b018829ca9604820c906981',
};
for(const [id, h] of Object.entries(HASHES)){
  const isle = CURATED_ISLES.find(i => i.id === id);
  t(`${id}: hash unchanged by tier`, !!isle && isleHash(isle) === h && isleHash({ ...isle, tier:'mythic' }) === h);
}
t('every official isle declares a valid tier', CURATED_ISLES.every(i => TIER_IDS.includes(i.tier)));

/* ---------------- Twist isles: one per chapter, designed to the Hard targets ---------------- */
const twists = CURATED_ISLES.filter(i => i.twist);
t('five Twist isles, one per chapter', twists.length === 5 && new Set(twists.map(i => i.theme)).size === 5);
for(const isle of twists){
  const a = auditIsle(parseIsle(isle).level), tiles = isle.rows.join(' ').trim().split(/\s+/).filter(x => x !== '-').length;
  t(`${isle.id}: gut call Hard or Fiendish`, ['hard', 'fiendish'].includes(isle.tier));
  t(`${isle.id}: ≥ 3,000 states (${a.states})`, a.states >= 3000);
  t(`${isle.id}: ≥ 3 traps (${a.traps})`, a.traps >= 3);
  t(`${isle.id}: greedy fails`, a.greedy === false);
  t(`${isle.id}: ≤ 4 shortest routes (${a.routes})`, a.routes <= 4);
  t(`${isle.id}: compact (${tiles} tiles ≤ 60)`, tiles <= 60);
  t(`${isle.id}: audit agrees it is Hard+ (${provisionalTier(a).name})`, ['hard', 'fiendish', 'mythic'].includes(provisionalTier(a).id));
}

/* ---------------- community + online files carry tier ---------------- */
const good = { schemaVersion:5, id:'sundial-steps', name:'Sundial Steps', author:'TanmoyP', theme:'oasis',
  rows:['- ,1 G1 - - -', '- .1 ^ - - -', '. . . ~ C .', '~ ~ ~ ~ . .', 'S , p - . p'], par:9, solution:'RRUULLLUU' };
t('contrib: tier allowed', checkCommunityIsle({ ...good, tier:'tricky' }).ok);
t('contrib: tier from TIERS only', checkCommunityIsle({ ...good, tier:'brutal' }).errors.some(e => e.includes('tier must be one of')));
t('contrib: tier optional', checkCommunityIsle(good).ok);
t('toCommunityFile keeps the gut call', toCommunityFile({ name:'Sundial Steps', theme:'oasis', rows:good.rows, tier:'easy' }, 'TanmoyP').tier === 'easy');
t('toCommunityFile drops a bogus tier', !('tier' in toCommunityFile({ name:'Sundial Steps', theme:'oasis', rows:good.rows, tier:'x' }, 'TanmoyP')));

/* ---------------- dated daily isles ---------------- */
const daily = { schemaVersion:5, id:'daily-2026-10-20', name:'Sundial Steps', theme:'oasis', rows:good.rows, par:9, solution:'RRUULLLUU', tier:'hard' };
const dbad = (patch, why, date = '2026-10-20') => { const d = { ...daily, ...patch }; for(const k in patch) if(patch[k] === undefined) delete d[k];
  const v = checkDailyIsle(d, { date }); return !v.ok && v.errors.some(e => e.includes(why)); };
t('daily: good file passes', checkDailyIsle(daily, { date:'2026-10-20' }).ok);
t('daily: author optional but checked', checkDailyIsle({ ...daily, author:'TanmoyP' }, { date:'2026-10-20' }).ok && dbad({ author:'-x y' }, 'GitHub username'));
t('daily: catch allowed', checkDailyIsle({ ...daily, catch:'The arch drops you on the wrong side.' }, { date:'2026-10-20' }).ok);
t('daily: catch is plain text ≤ 200', dbad({ catch:'x'.repeat(201) }, 'catch must be plain text'));
t('daily: tier required', dbad({ tier:undefined }, 'missing required field "tier"'));
t('daily: tier valid', dbad({ tier:'ultra' }, 'tier must be one of'));
t('daily: id must match the date', dbad({ id:'daily-2026-10-21' }, 'id must be "daily-2026-10-20"'));
t('daily: file name must be a real date', dbad({}, 'YYYY-MM-DD', '2026-02-30') && dbad({}, 'YYYY-MM-DD', 'today'));
t('daily: par exact', dbad({ par:8 }, 'shortest solution is 9'));
t('daily: solution must win', dbad({ solution:'RRUULLLUD' }, 'does not reach a goal'));
t('daily: unique vs existing', !checkDailyIsle(daily, { date:'2026-10-20', existing:new Map([[isleHash(daily), 'x']]) }).ok);
t('daily: unknown field', dbad({ spoiler:'x' }, 'unknown field "spoiler"'));
t('daily: plain walking rejected', dbad({ rows:['S . . . . . . G'], par:7, solution:'RRRRRRR' }, 'plain flat walking'));
t('daily: oversize', !checkDailyIsle(daily, { date:'2026-10-20', bytes:99999 }).ok);

/* ---------------- the daily pick ---------------- */
const pool = ['o:a', 'o:b', 'o:c', 'c:x/y', 'o:d'];
t('daily: same date → same isle, in any pool order', dailyPick(pool, '2026-11-03') === dailyPick([...pool].reverse(), '2026-11-03'));
{ const seen = new Set(); for(let d = 0; d < pool.length; d++) seen.add(dailyPick(pool, new Date(Date.UTC(2026, 10, 1 + d)).toISOString().slice(0, 10)));
  t('daily: no repeats until the pool is used up', seen.size === pool.length); }
t('daily: empty pool', dailyPick([], '2026-10-20') === null);
t('daily: numbering', dailyNumber(DAILY_EPOCH) === 1 && dailyNumber('2026-10-20') === 2 && dailyNumber('2026-11-29', '2026-10-19') === 42);
t('daily: a later dated file never renumbers', dailyEpoch(['2026-10-25', '2026-10-21']) === DAILY_EPOCH && dailyEpoch([]) === DAILY_EPOCH && dailyEpoch(['2026-10-01']) === '2026-10-01');
t('daily: utc date', utcDate(new Date(Date.UTC(2026, 9, 19, 23, 59))) === '2026-10-19');
t('daily: share text', dailyShareText({ no:42, moves:18, par:17, stars:2 }) === 'Klarbase Daily #42 · 18 moves (par 17) · ★★☆');

/* ---------------- archipelago maps (schemaVersion 6) score like any isle ---------------- */
{ const map = { storeys:[{ rows:['S1 C1 b1', 'p1 .1 .1'], at:[0, 0, 0] }, { rows:['p3 a2 .2 G2'], at:[0, 0, 10] }] };
  const a = auditIsle(parseIsle(map).level);
  t('audit maps a v6 map (storeys, gateway, scales)', !a.capped && a.par === 6 && a.routes >= 1 && a.states > 0);
  t('a map gets a provisional tier and a score', !!provisionalTier(a) && difficultyScore({ audit:a }).score >= 0);
  const gardens = CURATED_ISLES.filter(i => i.chapter === 'gardens');
  t('Hanging Gardens: eight map isles with a gut tier', gardens.length === 8 && gardens.every(i => Array.isArray(i.storeys) && TIER_IDS.includes(i.tier)));
  for(const isle of gardens){
    const g = auditIsle(parseIsle(isle).level);
    t(`${isle.id}: gut call and audit agree within a tier (${isle.tier} vs ${provisionalTier(g).id})`, !g.capped && gutMismatch(isle.tier, g) === null);
  }
  const daily6 = { schemaVersion:6, id:'daily-2026-10-21', name:'Vine Lift', theme:'jungle', storeys:map.storeys, par:6, solution:'RDLRRR', tier:'tricky' };
  t('daily: a v6 map passes', checkDailyIsle(daily6, { date:'2026-10-21' }).ok);
  t('daily: a map must say schemaVersion 6', !checkDailyIsle({ ...daily6, schemaVersion:5 }, { date:'2026-10-21' }).ok); }

/* ---------------- player-facing numbers ---------------- */
{ const s = playSummary({ started:20, cleared:10, moves:{ 9:3, 10:1, 14:6 } }, 9);
  t('summary: plays, clears, rates', s.plays === 20 && s.clears === 10 && s.clearRate === 50 && s.parRate === 30 && s.medianMoves === 14);
  const few = playSummary({ started:2, cleared:2, moves:{ 9:2 } }, 9);
  t('summary: rates wait for enough plays', few.plays === 2 && few.clearRate === null && few.parRate === null && few.medianMoves === 9);
  const none = playSummary(null, 9);
  t('summary: no stats', none.plays === 0 && none.clears === 0 && none.clearRate === null && none.medianMoves === null);
  t('summary: no par → no par rate', playSummary({ started:9, cleared:9, moves:{ 4:9 } }, null).parRate === null); }

console.log(`\nDIFFICULTY pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
