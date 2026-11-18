// @klar/core — Sky Atlas tests (zero deps): node core/test/atlas.mjs
// The overworld is a pure function of (seed, coordinates): determinism, seams that agree without
// the chunks seeing each other, every biome near spawn, one connected walkable graph, the 56
// official isles each placed once on a reachable shrine, and wild isles that are REAL isles —
// parse, solvable, par == the solver's, the family's mechanic load-bearing, tier inside the band.
import {
  ATLAS_SEED, ATLAS_THEMES, CHUNK, SPAWN, REGION_NAMES, hash2, mulberry32, biomeAt, biomeWeights, regionAt,
  chunkAt, cellAt, canStep, isleOf, Q, edgeInfo, isWalkable, placeContent, shrineAt, wildIsle, wildBand, WILD_TIERS, spawnOf,
  parseIsle, solveIsle, isleHash, auditIsle, provisionalTier, mechanicsUsed, simulate, CURATED_ISLES, CHAPTERS, MOVE_DIRS,
} from '../src/index.js';

let pass = 0, fail = 0;
const t = (name, cond) => { if(cond) pass++; else { fail++; console.error('FAIL:', name); } };
const T0 = performance.now();
const lap = (label, t0) => console.log(`  ${label.padEnd(44)} ${(performance.now() - t0).toFixed(0).padStart(6)} ms`);
const S = ATLAS_SEED;

/* ---------------- rng ---------------- */
{
  const a = [hash2(1, 2, 3, 4), hash2(1, 2, 3, 4), hash2(1, 2, 3, 5), hash2(1, 3, 2, 4), hash2(2, 2, 3, 4)];
  t('hash2 stateless', a[0] === a[1]);
  t('hash2 depends on every argument', new Set(a).size === 4);
  t('hash2 in [0,1)', Array.from({ length:2000 }, (_, i) => hash2(7, i, -i, 3)).every(v => v >= 0 && v < 1));
  const m1 = mulberry32(42), m2 = mulberry32(42);
  t('mulberry32 reproducible', [1, 2, 3, 4].every(() => m1() === m2()));
  let sum = 0; for(let i = 0; i < 5000; i++) sum += hash2(9, i, 0);
  t('hash2 roughly uniform', Math.abs(sum / 5000 - 0.5) < 0.02);
}

/* ---------------- biomes ---------------- */
{
  t('six themes', ATLAS_THEMES.join() === 'jungle,oasis,tropical,urban,mountain,night');
  t('spawn is jungle (Canopy)', biomeAt(S, SPAWN.x, SPAWN.z) === 'jungle' && regionAt(S, SPAWN.x, SPAWN.z).site.join() === '0,0');
  t('fixed neighbours', biomeAt(S, 24, 0) === 'oasis' && biomeAt(S, -24, 0) === 'mountain' && biomeAt(S, 0, 24) === 'tropical' && biomeAt(S, 0, -24) === 'urban');
  t('region names come from the theme', ATLAS_THEMES.every(th => { const r = regionAt(S, 24, 0); return REGION_NAMES[th].length >= 5 && (r.theme !== th || REGION_NAMES[th].includes(r.name)); }));
  for(const seed of [S, 2, 77, 12345]){
    const near = {};
    for(let z = -40; z <= 40; z++) for(let x = -40; x <= 40; x++) if(Math.hypot(x - SPAWN.x, z - SPAWN.z) <= 40) near[biomeAt(seed, x, z)] = 1;
    t(`every biome within 40 tiles of spawn (seed ${seed})`, ATLAS_THEMES.every(th => near[th]));
  }
  let ok = true;
  for(let i = 0; i < 300; i++){
    const x = Math.floor((hash2(5, i, 0) - 0.5) * 400), z = Math.floor((hash2(5, i, 1) - 0.5) * 400), w = biomeWeights(S, x, z, 3);
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    if(Math.abs(sum - 1) > 1e-9 || !(biomeAt(S, x, z) in w) || Object.keys(w).some(k => !ATLAS_THEMES.includes(k))) ok = false;
  }
  t('biomeWeights sums to 1 and contains the tile\'s own theme', ok);
  t('biome map is deterministic', biomeAt(S, 123, -456) === biomeAt(S, 123, -456) && JSON.stringify(biomeWeights(S, 5, 5)) === JSON.stringify(biomeWeights(S, 5, 5)));
  let night = 0, total = 0;
  for(let z = -400; z < 400; z += 7) for(let x = -400; x < 400; x += 7){ total++; if(biomeAt(S, x, z) === 'night') night++; }
  t('night is the rare theme', night / total > 0.03 && night / total < 0.2);
}

/* ---------------- chunks: shape, determinism, seams ---------------- */
{
  const t0 = performance.now();
  const c = chunkAt(S, 3, -2), c2 = chunkAt(S, 3, -2);
  t('chunk is deterministic', JSON.stringify(c) === JSON.stringify(c2));
  t('chunk has 256 cells', c.cells.length === CHUNK * CHUNK && CHUNK === 16);
  const KINDS = new Set(['ground', 'ramp', 'rock', 'tree', 'water', 'void', 'bridge', 'shrine']);
  let shapeOk = true, tot = 0, isles = 0;
  for(let i = 0; i < 400; i++){
    const ch = chunkAt(S, Math.floor((hash2(3, i, 0) - 0.5) * 60), Math.floor((hash2(3, i, 1) - 0.5) * 60));
    for(const e of ch.cells){
      tot++;
      if(!KINDS.has(e.kind) || !Number.isInteger(e.h) || e.h < 0 || e.h > 5 || typeof e.ch !== 'string' || !ATLAS_THEMES.includes(e.theme)) shapeOk = false;
      if(e.kind === 'ramp' && !MOVE_DIRS[e.dir]) shapeOk = false;
      if(e.kind === 'void' && e.h !== 0) shapeOk = false;
    }
    isles += ch.cells.filter(e => e.kind !== 'void').length ? 1 : 0;
  }
  t('every cell: known kind, height 0-5, ch, theme (ramp has dir)', shapeOk);
  t('no empty chunks (an isle in each quadrant)', isles === 400);
  lap('400 chunks generated', t0);

  // seams: two chunks agree about the span that crosses their shared edge — without ever seeing each other.
  // Spans are 2-4 tiles, so a seam may cut one anywhere: wherever EITHER chunk holds a bridge tile on its
  // edge row, the other holds the bridge's next tile (bridge or its socket), and Pip walks across both ways.
  const rnd = mulberry32(2024);
  let seamOk = 0, seams = 0, bridgesSeen = 0, stepOk = true;
  for(let i = 0; i < 200; i++){
    const seed = [S, 5, 99][i % 3], cx = Math.floor((rnd() - 0.5) * 400), cz = Math.floor((rnd() - 0.5) * 400), horiz = i % 2 === 0;
    const A = chunkAt(seed, cx, cz), B = horiz ? chunkAt(seed, cx + 1, cz) : chunkAt(seed, cx, cz + 1);
    let agree = true;
    const axis = horiz ? 'E' : 'S';
    for(let k = 0; k < CHUNK; k++){
      const a = horiz ? A.cells[k * CHUNK + 15] : A.cells[15 * CHUNK + k], b = horiz ? B.cells[k * CHUNK] : B.cells[k];
      const ax = horiz ? cx * 16 + 15 : cx * 16 + k, az = horiz ? cz * 16 + k : cz * 16 + 15;
      const aBr = A.bridges.some(q => q.axis === axis && q.x === ax && q.z === az), bBr = B.bridges.some(q => q.axis === axis && q.x === ax + (horiz ? 1 : 0) && q.z === az + (horiz ? 0 : 1));
      if(!aBr && !bBr) continue;
      bridgesSeen++;
      if(!isWalkable(a) || !isWalkable(b) || (aBr && bBr && a.h !== b.h)) agree = false;
      const fwd = canStep(seed, { x:ax, z:az }, horiz ? 'R' : 'D'), back = canStep(seed, { x:ax + (horiz ? 1 : 0), z:az + (horiz ? 0 : 1) }, horiz ? 'L' : 'U');
      if(!fwd.ok || !back.ok) stepOk = false;
    }
    seams++; if(agree) seamOk++;
  }
  t('seam agreement on 200 random chunk pairs', seamOk === seams);
  t('bridges cross seams (the test is not vacuous)', bridgesSeen > 25);
  t('bridge spans across seams walk both ways', stepOk);
  // a bridge span: both tiles are 'bridge' at the lower plateau; its ends are floor (or the stair that climbs)
  let spanOk = true;
  for(let cz = -3; cz <= 3; cz++) for(let cx = -3; cx <= 3; cx++) for(const b of chunkAt(S, cx, cz).bridges){
    const c = cellAt(S, b.x, b.z);
    if(c.kind !== 'bridge' || c.h !== b.h) spanOk = false;
    const dx = b.axis === 'E' ? 1 : 0, dz = b.axis === 'S' ? 1 : 0;
    const n1 = cellAt(S, b.x + dx, b.z + dz), n0 = cellAt(S, b.x - dx, b.z - dz);
    if(!(n1.kind === 'bridge' || isWalkable(n1)) || !(n0.kind === 'bridge' || isWalkable(n0))) spanOk = false;
  }
  t('every listed bridge tile is a bridge cell between walkable ends', spanOk);

  // richer terrain: bridges span 2-4 tiles of open sky only, shrines stand on a clear 3x3, biomes have their character
  const ofTile = (x, z) => isleOf(S, Math.floor(x / Q), Math.floor(z / Q));
  let overLand = 0, spans = 0, lens = {}, clear = true, nShr = 0;
  const maxH = {}, hist = {}, sizes = [];
  for(let cz = -4; cz <= 4; cz++) for(let cx = -4; cx <= 4; cx++){
    const ch = chunkAt(S, cx, cz);
    for(const b of ch.bridges){ spans++; const I = ofTile(b.x, b.z); if(I.mask[(b.z - I.oz) * Q + (b.x - I.ox)]) overLand++; }
    for(const sh of ch.shrines){
      nShr++;
      const h0 = cellAt(S, sh.x, sh.z).h;
      for(let dz = -1; dz <= 1; dz++) for(let dx = -1; dx <= 1; dx++){ const c = cellAt(S, sh.x + dx, sh.z + dz); if(!(c.kind === 'ground' || c.kind === 'shrine') || c.h !== h0) clear = false; }
    }
    for(const c of ch.cells) if(c.kind !== 'void'){ maxH[c.theme] = Math.max(maxH[c.theme] || 0, c.h); (hist[c.theme] = hist[c.theme] || {})[c.h] = (hist[c.theme][c.h] || 0) + 1; }
  }
  for(let qz = -12; qz < 12; qz++) for(let qx = -12; qx < 12; qx++) sizes.push(isleOf(S, qx, qz).area);
  for(let qz = -30; qz < 30; qz += 3) for(let qx = -30; qx < 30; qx += 3) for(const [ax, e] of [['E', edgeInfo(S, qx, qz, 'E')], ['S', edgeInfo(S, qx, qz, 'S')]]) if(e && !e.land) lens[e.gap.length] = (lens[e.gap.length] || 0) + 1;
  const mean = Object.fromEntries(Object.entries(hist).map(([k, h]) => [k, Object.entries(h).reduce((a, [l, c]) => a + l * c, 0) / Object.values(h).reduce((a, b) => a + b, 0)]));
  t('no bridge tile lies on land', spans > 100 && overLand === 0);
  t('bridge spans are 2-4 tiles', Object.keys(lens).every(k => +k >= 2 && +k <= 4) && Object.keys(lens).length === 3);
  t('every shrine stands on a clear 3x3 of open flat ground', nShr > 50 && clear);
  t('isles are chunky: mean 40-90 tiles, none under 17', sizes.reduce((a, b) => a + b, 0) / sizes.length > 40 && sizes.reduce((a, b) => a + b, 0) / sizes.length < 90 && Math.min(...sizes) >= 17);
  t('mountains climb to 4-5, the lagoon stays low', maxH.mountain >= 4 && (mean.mountain || 0) >= mean.jungle + 0.5 && (mean.tropical || 9) <= 1.6);
  t('heights stay within 0-5 and every biome uses 3+ levels', Object.values(hist).every(h => Object.keys(h).length >= 3 && Object.keys(h).every(k => +k >= 0 && +k <= 5)));
  console.log('  terrain: isle area ' + Math.min(...sizes) + '-' + Math.max(...sizes) + ', span lengths ' + JSON.stringify(lens) + ', mean height by biome ' + Object.entries(hist).map(([k, h]) => { const n = Object.values(h).reduce((a, b) => a + b, 0); return k + ' ' + (Object.entries(h).reduce((a, [l, c]) => a + l * c, 0) / n).toFixed(1); }).join(', '));
}

/* ---------------- walking: rule 1, by rules.js's own heightStep ---------------- */
{
  // find a ramp with floor behind it: climb it, and see the rules at work
  let ramp = null, drop = null;
  for(let cz = -2; cz <= 2 && !(ramp && drop); cz++) for(let cx = -2; cx <= 2 && !(ramp && drop); cx++){
    const ch = chunkAt(S, cx, cz);
    for(let i = 0; i < 256; i++){
      const e = ch.cells[i], x = cx * 16 + i % 16, z = cz * 16 + ((i / 16) | 0);
      if(e.kind === 'ramp' && !ramp){
        const d = e.dir, o = { U:'D', D:'U', L:'R', R:'L' }[d], v = MOVE_DIRS[d], w = MOVE_DIRS[o];
        const hi = cellAt(S, x + v[0], z + v[1]), lo = cellAt(S, x + w[0], z + w[1]);
        if(isWalkable(hi) && isWalkable(lo) && hi.h === e.h + 1 && lo.h === e.h && lo.kind !== 'ramp' && hi.kind !== 'ramp') ramp = { x, z, d, o, h:e.h };
      }
    }
  }
  t('found a stair to test', !!ramp);
  if(ramp){
    const lo = { x:ramp.x + MOVE_DIRS[ramp.o][0], z:ramp.z + MOVE_DIRS[ramp.o][1] };
    const up = canStep(S, lo, ramp.d);
    t('walk onto a stair from below', up.ok && up.kind === 'ramp' && up.to.h === ramp.h);
    const top = canStep(S, up.to, ramp.d);
    t('climb the stair to the terrace above', top.ok && top.kind === 'ramp' && top.to.h === ramp.h + 1);
    t('and back down it', canStep(S, top.to, ramp.o).ok && canStep(S, up.to, ramp.o).ok);
    const sideways = ramp.d === 'U' || ramp.d === 'D' ? ['L', 'R'] : ['U', 'D'];
    t('a stair is not entered sideways', sideways.every(m => { const f = { x:ramp.x - MOVE_DIRS[m][0], z:ramp.z - MOVE_DIRS[m][1] }; return !isWalkable(cellAt(S, f.x, f.z)) || !canStep(S, f, m).ok || cellAt(S, f.x, f.z).kind === 'void'; }));
  }
  // ledges: never climb without a stair; hop down exactly one; blockers and sky block
  let ledgeUp = 0, hopDown = 0, blockedOk = true, flat = 0;
  for(let z = -48; z < 48; z++) for(let x = -48; x < 48; x++){
    const a = cellAt(S, x, z);
    if(!isWalkable(a)) continue;
    for(const m of ['U', 'D', 'L', 'R']){
      const b = cellAt(S, x + MOVE_DIRS[m][0], z + MOVE_DIRS[m][1]), r = canStep(S, { x, z }, m);
      if(!isWalkable(b)){ if(r.ok) blockedOk = false; continue; }
      if(a.kind !== 'ramp' && b.kind !== 'ramp'){
        if(b.h === a.h){ flat++; if(!r.ok) blockedOk = false; }
        else if(b.h === a.h - 1){ hopDown++; if(!r.ok || r.kind !== 'down') blockedOk = false; }
        else { ledgeUp++; if(r.ok) blockedOk = false; }
      }
    }
  }
  t('flat steps walk, one-level drops hop down, ledges and 2-level drops block, rock/tree/water/sky block', blockedOk && flat > 500);
  t('the sampled world has real ledges and hops', ledgeUp > 10 && hopDown > 10);
  t("'U' is north (z-1)", canStep(S, SPAWN, 'U').ok ? canStep(S, SPAWN, 'U').to.z === SPAWN.z - 1 : true);
  t('canStep rejects a bad direction', !canStep(S, SPAWN, 'Q').ok);
  t('spawn is walkable ground', cellAt(S, SPAWN.x, SPAWN.z).kind === 'ground' && SPAWN.x === spawnOf(S).x);
}

/* ---------------- connectivity: one walkable world ---------------- */
function bfs(seed, from, bound, dirs = 'UDLR'){
  const key = p => p.x + ',' + p.z, seen = new Map([[key(from), from]]), st = [from];
  while(st.length){
    const p = st.pop();
    for(const d of dirs){
      const r = canStep(seed, p, d);
      if(!r.ok || r.to.x < bound[0] || r.to.x > bound[2] || r.to.z < bound[1] || r.to.z > bound[3] || seen.has(key(r.to))) continue;
      seen.set(key(r.to), { x:r.to.x, z:r.to.z }); st.push({ x:r.to.x, z:r.to.z });
    }
  }
  return seen;
}
const ALL = (() => { // the 7x7 chunks around spawn (chunk 0,0 is the spawn chunk): bridges and shrine slots
  const out = { bridges:[], shrines:[] };
  for(let cz = -3; cz <= 3; cz++) for(let cx = -3; cx <= 3; cx++){ const c = chunkAt(S, cx, cz); out.bridges.push(...c.bridges); out.shrines.push(...c.shrines); }
  return out;
})();
{
  const t0 = performance.now();
  const reach = bfs(S, SPAWN, [-7 * 16, -7 * 16, 7 * 16 + 15, 7 * 16 + 15]);
  t('BFS from spawn reaches every bridge of the 7x7 chunks', ALL.bridges.length > 60 && ALL.bridges.every(b => reach.has(b.x + ',' + b.z)));
  t('BFS from spawn reaches every shrine slot of the 7x7 chunks', ALL.shrines.length > 40 && ALL.shrines.every(s => reach.has(s.x + ',' + s.z)));
  let walkable = 0, unreached = 0;
  for(let cz = -3; cz <= 3; cz++) for(let cx = -3; cx <= 3; cx++) chunkAt(S, cx, cz).cells.forEach((e, i) => {
    if(!isWalkable(e)) return; walkable++;
    if(!reach.has((cx * 16 + i % 16) + ',' + (cz * 16 + ((i / 16) | 0)))) unreached++;
  });
  t('every walkable tile of the 7x7 chunks is reachable (no stranded floor)', walkable > 3000 && unreached === 0);
  // ...and you can always walk home: from every shrine back to spawn
  const back = ALL.shrines.filter((_, i) => i % 3 === 0).every(s => bfs(S, { x:s.x, z:s.z }, [-7 * 16, -7 * 16, 7 * 16 + 15, 7 * 16 + 15]).has(SPAWN.x + ',' + SPAWN.z));
  t('and back: spawn is reachable from the shrines', back);
  for(const seed of [2, 31337]){
    const sp = spawnOf(seed), r = bfs(seed, sp, [-96, -96, 111, 111]);
    let all = true;
    for(let cz = -3; cz <= 3; cz++) for(let cx = -3; cx <= 3; cx++){ const c = chunkAt(seed, cx, cz); for(const b of c.bridges) if(!r.has(b.x + ',' + b.z)) all = false; for(const s of c.shrines) if(!r.has(s.x + ',' + s.z)) all = false; }
    t(`connected from spawn too (seed ${seed}, 7x7 chunks)`, all);
  }
  lap('connectivity BFS', t0);
}

/* ---------------- content: official, community, daily ---------------- */
let placement;
{
  const t0 = performance.now();
  placement = placeContent(S, { official:CURATED_ISLES });
  const again = placeContent(S, { official:CURATED_ISLES });
  t('56 official isles', CURATED_ISLES.length === 56);
  t('every official isle is placed exactly once', placement.size === 56 && CURATED_ISLES.every(i => placement.has('o/' + i.id)));
  const tiles = [...placement.values()].map(p => p.x + ',' + p.z);
  t('no two isles share a shrine', new Set(tiles).size === 56);
  t('placement is deterministic (same input, same Map)', JSON.stringify([...placement]) === JSON.stringify([...again]));
  t('every official shrine tile is a walkable shrine', [...placement.values()].every(p => { const c = cellAt(S, p.x, p.z); return c.kind === 'shrine' && isWalkable(c); }));
  const reach = bfs(S, SPAWN, [-96, -96, 95, 95]);
  t('every official shrine is reachable on foot from spawn', [...placement.values()].every(p => reach.has(p.x + ',' + p.z)));
  let minGap = Infinity; const ps = [...placement.values()];
  for(let i = 0; i < ps.length; i++) for(let j = i + 1; j < ps.length; j++) minGap = Math.min(minGap, Math.hypot(ps[i].x - ps[j].x, ps[i].z - ps[j].z));
  t('shrines are at least 4 tiles apart', minGap >= 4);
  // chapters sit in their theme's regions
  const chapterTheme = {}; for(const c of CHAPTERS) chapterTheme[c.id || c.theme] = c.theme;
  t('each chapter lives in regions of its theme', CURATED_ISLES.every(i => regionAt(S, placement.get('o/' + i.id).x, placement.get('o/' + i.id).z).theme === chapterTheme[i.chapter || i.theme]));
  const sp = spawnOf(S);
  t('the first isle is within a few tiles of spawn', Math.hypot(placement.get('o/first-steps').x - sp.x, placement.get('o/first-steps').z - sp.z) < 8);
  t('all 56 sit within ring 2 of the biome sites (< 90 tiles)', ps.every(p => Math.hypot(p.x, p.z) < 90));
  // twist / confluence isles sit nearer a region border than the chapter's plain isles
  const edge = id => { const p = placement.get('o/' + id); return regionAt(S, p.x, p.z); };
  t('twist + confluence isles are placed', ['spring-lock', 'frost-ferry', 'frost-mirage', 'drowned-gangway', 'squall-line'].every(id => edge(id)));
  // shrineAt
  const p0 = placement.get('o/mirage'), s0 = shrineAt(S, p0.x, p0.z, placement);
  t('shrineAt finds an official isle', s0 && s0.kind === 'official' && s0.key === 'o/mirage' && s0.statKey === 'o/mirage');
  t('shrineAt is null off a shrine', shrineAt(S, SPAWN.x, SPAWN.z, placement) === null);
  const freeSlot = ALL.shrines.find(s => !placement.has(s.key) && ![...placement.values()].some(p => p.x === s.x && p.z === s.z));
  const w0 = shrineAt(S, freeSlot.x, freeSlot.z, placement);
  t('an unplaced slot is a wild shrine with a stat key', w0 && w0.kind === 'wild' && w0.statKey === `w/${freeSlot.x},${freeSlot.z}`);

  // community + daily: placed in a region of their theme, stable when others are added, order-free
  const community = [
    { key:'c/ada/sunny-ledge', theme:'jungle' }, { key:'c/bob/frost-trap', theme:'mountain' }, { key:'c/cy/night-owl', theme:'night' },
    { key:'c/di/palm-maze', theme:'oasis' }, { key:'c/ed/canal-run', theme:'urban' }, { key:'c/fay/reef-key', theme:'tropical' },
  ];
  const daily = [{ key:'d/2026-11-18', theme:'urban' }, { key:'d/2026-11-19', theme:'night' }];
  const p1 = placeContent(S, { official:CURATED_ISLES, community, daily });
  t('community + daily isles are placed on free shrines of their theme', [...community, ...daily].every(c => { const p = p1.get(c.key); return p && cellAt(S, p.x, p.z).kind === 'shrine' && regionAt(S, p.x, p.z).theme === c.theme && !tiles.includes(p.x + ',' + p.z); }));
  t('kinds are recorded', p1.get('c/ada/sunny-ledge').kind === 'community' && p1.get('d/2026-11-18').kind === 'daily' && p1.get('o/first-steps').kind === 'official');
  t('official placement ignores community isles', CURATED_ISLES.every(i => JSON.stringify(p1.get('o/' + i.id)) === JSON.stringify(placement.get('o/' + i.id))));
  const p2 = placeContent(S, { official:CURATED_ISLES, community:[...community].reverse(), daily:[...daily].reverse() });
  t('input order does not matter', [...p1].every(([k, v]) => JSON.stringify(p2.get(k)) === JSON.stringify(v)));
  const more = Array.from({ length:40 }, (_, i) => ({ key:`c/user${i}/isle-${i}`, theme:ATLAS_THEMES[i % 6] }));
  const p3 = placeContent(S, { official:CURATED_ISLES, community:[...community, ...more], daily });
  const moved = [...community, ...daily].filter(c => JSON.stringify(p3.get(c.key)) !== JSON.stringify(p1.get(c.key))).length;
  t('adding 40 more isles moves at most one earlier isle', moved <= 1);
  t('all 40 + 8 are placed uniquely', p3.size === 56 + 6 + 2 + 40 && new Set([...p3.values()].map(v => v.x + ',' + v.z)).size === p3.size);
  lap('placement (56 official + 48 more)', t0);
  console.log(`  placement spread: official shrines up to ${Math.round(Math.max(...ps.map(p => Math.hypot(p.x - sp.x, p.z - sp.z))))} tiles from spawn`);
}

/* ---------------- wild isles ---------------- */
{
  const FAMILY = { jungle:['sink'], oasis:['tp'], tropical:['toggle', 'key'], urban:['gate'], mountain:['slide'], night:['wait', 'hazard', 'sink', 'gate', 'tp'] };
  const sp = spawnOf(S);
  // determinism: a second module instance has an empty memo, so it really recomputes
  const fresh = await import('../src/atlas/wild.js?fresh');
  const probe = ALL.shrines.filter((_, i) => i % 5 === 0).slice(0, 8);
  t('wildIsle is deterministic (fresh module, same hash)', probe.every(s => { const a = wildIsle(S, s.x, s.z), b = fresh.wildIsle(S, s.x, s.z); return (a === null && b === null) || (a && b && isleHash(a.doc) === isleHash(b.doc) && a.solution === b.solution && a.hash === isleHash(a.doc)); }));

  // 300 slots: 100 near, 100 mid, 100 far — spread by hash over the world
  const rnd = mulberry32(7), slots = [], want = [[0, 64, 60], [64, 160, 120], [160, 480, 120]];
  const seen = new Set();
  for(const [lo, hi, n] of want){
    let got = 0;
    for(let tries = 0; got < n && tries < 4000; tries++){
      const ang = rnd() * Math.PI * 2, rad = lo + rnd() * (hi - lo), cx = Math.floor((sp.x + Math.cos(ang) * rad) / CHUNK), cz = Math.floor((sp.z + Math.sin(ang) * rad) / CHUNK);
      const sh = chunkAt(S, cx, cz).shrines; if(!sh.length) continue;
      const s = sh[Math.floor(rnd() * sh.length)], d = Math.hypot(s.x - sp.x, s.z - sp.z);
      if(d < lo || d >= hi || seen.has(s.key)) continue;
      seen.add(s.key); slots.push(s); got++;
    }
  }
  const times = [], tiers = {}, byTheme = {}, bands = [{}, {}, {}], nulls = [];
  let night6 = 0, nightAll = 0;
  let allOk = true;
  const failures = [];
  for(const s of slots){
    const t0 = performance.now(), w = wildIsle(S, s.x, s.z); times.push(performance.now() - t0);
    const theme = biomeAt(S, s.x, s.z), d = Math.hypot(s.x - sp.x, s.z - sp.z), band = wildBand(d);
    byTheme[theme] = byTheme[theme] || { n:0, ok:0 }; byTheme[theme].n++;
    if(!w){ nulls.push(s.key); continue; }
    byTheme[theme].ok++;
    const p = parseIsle(w.doc);
    const why = [];
    if(!p.ok) why.push('parse');
    else {
      const r = solveIsle(p.level, { maxStates:60000 });
      if(!r.solvable) why.push('unsolvable');
      if(r.par !== w.par || w.doc.par !== w.par) why.push('par');
      if(r.par < 6) why.push('par<6');
      if(!simulate(p.level, w.solution).won || w.solution.length !== w.par) why.push('solution');
      const used = mechanicsUsed(p.level, r.solution);
      if(!used.length || !FAMILY[theme].some(m => used.includes(m))) why.push('mechanic:' + used.join());
      if(w.mechanics.join() !== used.join()) why.push('mechanics field');
      const tier = provisionalTier(auditIsle(p.level, { maxStates:200000 })).id;
      if(tier !== w.tier || w.doc.tier !== w.tier) why.push('tier ' + tier + '!=' + w.tier);
      if(!WILD_TIERS[band].includes(w.tier)) why.push('band');
      if(w.tier === 'hard' || w.tier === 'fiendish' || w.tier === 'mythic') why.push('too hard');
      if(w.doc.schemaVersion !== (w.doc.storeys ? 6 : 5) || (theme !== 'night' && w.doc.storeys) || w.doc.theme !== theme) why.push('schema/theme');
      if(!/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(w.doc.name)) why.push('name');
      if(w.statKey !== `w/${s.x},${s.z}`) why.push('statKey');
      if(w.doc.storeys){ nightAll++; if(w.mechanics.includes('wait') || w.mechanics.includes('hazard')) night6++; }
    }
    tiers[w.tier] = (tiers[w.tier] || 0) + 1; bands[band][w.tier] = (bands[band][w.tier] || 0) + 1;
    if(why.length){ allOk = false; failures.push(s.key + ': ' + why.join(' ')); }
  }
  failures.slice(0, 8).forEach(f => console.error('  wild:', f));
  t('300 wild slots sampled (60 near / 120 mid / 120 far)', slots.length === 300);
  t('every returned wild isle: parses, solvable, par = solver par >= 6, solution wins, family mechanic present, tier in band', allOk);
  t('at most 2% of slots are quiet (null)', nulls.length <= 6);
  t('tiers never above tricky', !Object.keys(tiers).some(k => !['breeze', 'easy', 'tricky'].includes(k)));
  t('near slots are breeze/easy, far slots are all tricky', Object.keys(bands[0]).every(k => k === 'breeze' || k === 'easy') && Object.keys(bands[2]).every(k => k === 'tricky'));
  times.sort((a, b) => a - b);
  const q = f => times[Math.min(times.length - 1, Math.floor(times.length * f))];
  const p50 = q(0.5), p95 = q(0.95);
  t(`p95 wildIsle time < 250 ms (p95 ${p95.toFixed(0)} ms)`, p95 < 250);
  console.log(`  wild: ${slots.length - nulls.length}/${slots.length} accepted (${nulls.length} quiet); tiers ${JSON.stringify(tiers)}`);
  console.log(`        near ${JSON.stringify(bands[0])}  mid ${JSON.stringify(bands[1])}  far ${JSON.stringify(bands[2])}`);
  console.log(`        by theme ${Object.entries(byTheme).map(([k, v]) => `${k} ${v.ok}/${v.n}`).join(', ')}; night maps with hazards ${night6}/${nightAll} night v6 docs`);
  console.log(`        time p50 ${p50.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms · max ${times[times.length - 1].toFixed(0)} ms`);
}

const total = performance.now() - T0;
t(`whole atlas test under 60 s (${(total / 1000).toFixed(1)} s)`, total < 60000);
console.log(`\natlas: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
