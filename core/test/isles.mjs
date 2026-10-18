// @klar/core — Isle engine tests (zero deps): node core/test/isles.mjs
// Unit tests for every rule, then the curated set: each isle must parse, be
// solvable, have its stored par == the solver's shortest, its stored solution
// must replay to a win, and its featured mechanics must be load-bearing.
import {
  parseIsle, solveIsle, simulate, step, initialState, starsFor,
  canonicalIsle, isleHash, CURATED_ISLES, CHAPTERS, MAX_W,
  checkCommunityIsle, toCommunityFile,
} from '../src/isle/index.js';

let pass = 0, fail = 0;
const t = (name, cond) => { if(cond) pass++; else { fail++; console.error('FAIL:', name); } };
const L = rows => { const r = parseIsle({ rows }); if(!r.ok) throw new Error(JSON.stringify(r.errors)); return r.level; };
const run = (level, moves) => simulate(level, moves);

/* ---------------- format ---------------- */
t('parse ok', parseIsle({ rows:['S . G'] }).ok);
t('E_START', parseIsle({ rows:['. . G'] }).errors.some(e => e.code === 'E_START'));
t('E_GOAL', parseIsle({ rows:['S . .'] }).errors.some(e => e.code === 'E_GOAL'));
t('E_TOKEN', parseIsle({ rows:['S ? G'] }).errors.some(e => e.code === 'E_TOKEN'));
t('E_RAGGED', parseIsle({ rows:['S . G', '. .'] }).errors.some(e => e.code === 'E_RAGGED'));
t('E_PORTAL unpaired', parseIsle({ rows:['S p G'] }).errors.some(e => e.code === 'E_PORTAL'));
t('E_GATE without plate', parseIsle({ rows:['S D G'] }).errors.some(e => e.code === 'E_GATE'));
t('E_SIZE', parseIsle({ rows:[Array(MAX_W + 1).fill('.').join(' ').replace('.', 'S').replace(/\.$/, 'G')] }).errors.some(e => e.code === 'E_SIZE'));
t('E_THEME', parseIsle({ theme:'moon', rows:['S . G'] }).errors.some(e => e.code === 'E_THEME'));
t('heights parse', L(['S .3 G']).cells[1].h === 3);
t('parse never throws on garbage', (() => { try { parseIsle(null); parseIsle({ rows:[1,2] }); return true; } catch { return false; } })());
const hA = isleHash({ name:'A', theme:'jungle', rows:['S  .  G'] });
const hB = isleHash({ name:'B', theme:'jungle', rows:['S . G'], par:2, solution:'RR' });
t('isle hash ignores name/par/whitespace', hA === hB);
t('isle hash changes with theme', hA !== isleHash({ theme:'oasis', rows:['S . G'] }));
t('isle hash changes with geometry', hA !== isleHash({ theme:'jungle', rows:['S . . G'] }));
t('canonical isle is name-free', !('name' in canonicalIsle({ name:'x', rows:['S G'] })));

/* ---------------- movement & heights ---------------- */
t('walk flat to goal', run(L(['S . G']), 'RR').won);
t('void blocks', !step(L(['S - G']), initialState(L(['S - G'])), 'R').ok);
t('rock blocks', !run(L(['S # G']), 'RR').won);
t('cannot climb a ledge', !run(L(['S .1 G1']), 'RR').won);
t('can hop down a ledge', run(L(['S1 . G']), 'RR').won);
t('cannot hop down two levels', !run(L(['S2 . G']), 'RR').won);
t('ramp climbs along its slope', run(L(['S > G1']), 'RR').won);
t('ramp descends along its slope', run(L(['S1 < G']), 'RR').won);
{ const lv = L(['.  G1', 'S  ^ ']); t('ramp blocks sideways entry', !step(lv, initialState(lv), 'R').ok); }
t('ramps chain', run(L(['S > >1 G2']), 'RRR').won);

/* ---------------- crates ---------------- */
{ const lv = L(['S C . .', '. . . G']); const r = step(lv, initialState(lv), 'R'); t('crate moves one tile', r.ok && r.state.crates[0] === 2 && r.state.p === 1); }
t('crate blocked by rock', !step(L(['S C # G']), initialState(L(['S C # G'])), 'R').ok);
t('crate cannot climb', !step(L(['S C .1 G']), initialState(L(['S C .1 G'])), 'R').ok);
{ const lv = L(['S1 C1 . G']); const r = step(lv, initialState(lv), 'R'); t('crate drops off a ledge', r.ok && r.state.crates[0] === 2); }
{ const lv = L(['S C ~ G']); const r = run(lv, 'RRR'); t('crate sinks into water -> floor', r.won && r.state.filled.includes(2)); }
t('water blocks the player', !run(L(['S ~ G']), 'RR').won);
t('crates never cover the goal', !step(L(['S C G']), initialState(L(['S C G'])), 'R').ok);

/* ---------------- ice ---------------- */
{ const lv = L(['S * * * G']); const r = run(lv, 'R'); t('ice slides you to the goal', r.won && r.applied === 1); }
{ const lv = L(['S * * # G']); const r = run(lv, 'R'); t('ice stops before rock', r.state.p === 2); }
{ const lv = L(['. C * * .', 'S . . . G']); const r = step(lv, { ...initialState(lv), p:0 }, 'R'); t('crate slides on ice', r.ok && r.state.crates[0] === 4); }

/* ---------------- plates & gates ---------------- */
t('closed gate blocks', !run(L(['S . D G', 'o . . .']), 'RRR').won);
t('crate on plate opens gate', run(L(['S C o', 'G D .']), 'RDL').won);
t('standing on the plate opens an adjacent gate', run(L(['S o D G']), 'RRR').won);
t('gate stays shut once you step off the plate', !run(L(['S o . D G']), 'RRRR').won);

/* ---------------- levers & bridges ---------------- */
t('use off a lever is a no-op', !step(L(['S . G']), initialState(L(['S . G'])), 'X').ok);
t('down bridge blocks', !run(L(['S L _ G']), 'RRR').won);
t('lever raises a down bridge', run(L(['S L _ G']), 'RXRR').won);
t('lever sinks an up bridge', !run(L(['S L = G']), 'RXRR').won);
{ const lv = L(['S C = . G', '. . L . .']);
  const r = run(lv, 'RDRX'); t('crate on sinking bridge drops in as a block', r.state.filled.includes(2) && r.state.crates.length === 0);
  t('the dropped block is walkable after the flip', run(lv, 'RDRXURR').won); }

/* ---------------- keys, doors, portals ---------------- */
t('door without key blocks', !run(L(['S K G']), 'RR').won);
t('key opens door', run(L(['S k K G']), 'RRR').won);
t('one key per door', !run(L(['S k K K G']), 'RRRR').won);
t('portal sends you to its twin', run(L(['S p - p G']), 'RR').won);
{ const r = run(L(['S p - p G']), 'R'); t('portal arrival lands on twin', r.state.p === 3); }

/* ---------------- solver ---------------- */
{ const r = solveIsle(L(['S . . G'])); t('solver finds shortest', r.solvable && r.solution === 'RRR' && r.par === 3); }
t('solver reports unsolvable', !solveIsle(L(['S # G'])).solvable);
t('stars', starsFor(10, 10) === 3 && starsFor(15, 10) === 2 && starsFor(16, 10) === 1);

/* ---------------- curated isles ---------------- */
t('at least 20 curated isles', CURATED_ISLES.length >= 20);
t('ids unique', new Set(CURATED_ISLES.map(i => i.id)).size === CURATED_ISLES.length);
t('every chapter has isles', CHAPTERS.every(c => CURATED_ISLES.some(i => i.theme === c.theme)));
for(const isle of CURATED_ISLES){
  const { ok, errors, level } = parseIsle(isle);
  if(!ok){ t(`${isle.id}: parses (${errors.map(e => e.code).join(',')})`, false); continue; }
  const r = solveIsle(level);
  t(`${isle.id}: solvable`, r.solvable);
  t(`${isle.id}: par ${isle.par} == shortest ${r.par} (${r.solution})`, r.par === isle.par);
  const sim = simulate(level, isle.solution);
  t(`${isle.id}: stored solution replays to a win`, sim.won && sim.applied === isle.solution.length);
  let s = initialState(level); const used = new Set();
  for(const m of isle.solution){ const st = step(level, s, m); for(const e of st.events) used.add(e.t === 'walk' ? 'walk:' + e.kind : e.t); s = st.state; }
  for(const n of isle.needs || []) t(`${isle.id}: uses ${n}`, used.has(n));
}

/* ---------------- community contribution rules ---------------- */
const good = { schemaVersion:5, id:'sundial-steps', name:'Sundial Steps', author:'TanmoyP', theme:'oasis',
  rows:['- ,1 G1 - - -', '- .1 ^ - - -', '. . . ~ C .', '~ ~ ~ ~ . .', 'S , p - . p'], par:9, solution:'RRUULLLUU' };
const bad = (patch, why) => { const d = { ...good, ...patch }; for(const k in patch) if(patch[k] === undefined) delete d[k]; const v = checkCommunityIsle(d); return !v.ok && v.errors.some(e => e.includes(why)); };
t('contrib: good isle passes', checkCommunityIsle(good).ok);
t('contrib: reports mechanics', checkCommunityIsle(good).report.mechanics.includes('tp'));
t('contrib: missing field', bad({ author:undefined }, 'missing required field "author"'));
t('contrib: unknown field', bad({ score:1 }, 'unknown field "score"'));
t('contrib: wrong par names the right one', bad({ par:7 }, 'shortest solution is 9'));
t('contrib: broken solution', bad({ solution:'RRUULLLUD' }, 'does not reach a goal'));
t('contrib: non-shortest solution rejected', bad({ solution:'RRUULRLLLUU' }, 'submit a shortest solution'));
t('contrib: too short', bad({ rows:['S . . > G1'], par:4, solution:'RRRR' }, 'too short'));
t('contrib: plain walking rejected', bad({ rows:['S . . . . . . G'], par:7, solution:'RRRRRRR' }, 'plain flat walking'));
t('contrib: unsolvable', bad({ rows:['S # G'], par:0, solution:'' }, 'not solvable'));
t('contrib: duplicate of official', (() => { const o = CURATED_ISLES[4]; const d = { ...good, rows:o.rows, theme:o.theme, par:o.par, solution:o.solution };
  return !checkCommunityIsle(d, { existing:new Map([[isleHash(o), 'official']]) }).ok; })());
t('contrib: links in hint rejected', bad({ hint:'see https://spam.example' }, 'no links'));
t('contrib: bad author', bad({ author:'-bad name' }, 'GitHub username'));
t('contrib: bad theme', bad({ theme:'moon' }, 'theme must be'));
t('contrib: bad schema', bad({ schemaVersion:4 }, 'schemaVersion'));
t('contrib: oversize file', !checkCommunityIsle(good, { bytes:99999 }).ok);
{ const f = toCommunityFile({ name:'Sundial Steps', theme:'oasis', rows:good.rows }, 'TanmoyP');
  t('toCommunityFile fills par + solution that pass the gate', checkCommunityIsle(f).ok && f.par === 9); }

console.log(`\nISLES pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
