// @klar/core — Isle engine tests (zero deps): node core/test/isles.mjs
// Unit tests for every rule, then the curated set: each isle must parse, be
// solvable, have its stored par == the solver's shortest, its stored solution
// must replay to a win, and its featured mechanics must be load-bearing.
import {
  parseIsle, solveIsle, simulate, step, initialState, starsFor,
  canonicalIsle, isleHash, CURATED_ISLES, CHAPTERS, MAX_W,
  checkCommunityIsle, toCommunityFile,
  panTilt, heightAt, stateKey, mechanicsUsed, eventMechanic, neighbor, cellPlace, solveSeeds, seedsTouched, hazardCellsAt,
} from '../src/isle/index.js';
import { sha256hex, stableStringify } from '../src/schema.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

/* ---------------- archipelago maps (schemaVersion 6, K4) ---------------- */
const M = storeys => { const r = parseIsle({ storeys }); if(!r.ok) throw new Error(JSON.stringify(r.errors)); return r.level; };
const code = (doc, c) => parseIsle(doc).errors.some(e => e.code === c);
t('map parses', parseIsle({ storeys:[{ rows:['S . G'], at:[0, 0, 0] }, { rows:['. .'], at:[5, 0, 2] }] }).ok);
t('E_STOREYS: not a list', code({ storeys:'S G' }, 'E_STOREYS'));
t('E_STOREYS: more than 3', code({ storeys:Array(4).fill({ rows:['S G'], at:[0, 0, 0] }) }, 'E_STOREYS'));
t('E_AT: missing at', code({ storeys:[{ rows:['S . G'] }] }, 'E_AT'));
t('E_AT: fractional altitude', code({ storeys:[{ rows:['S . G'], at:[0, 0, 1.5] }] }, 'E_AT'));
t('E_SIZE per storey', code({ storeys:[{ rows:['S . G'], at:[0, 0, 0] }, { rows:[Array(MAX_W + 1).fill('.').join(' ')], at:[0, 2, 0] }] }, 'E_SIZE'));
t('E_OVERLAP: stacked storeys too close', code({ storeys:[{ rows:['S . G'], at:[0, 0, 0] }, { rows:['. .'], at:[1, 0, 4] }] }, 'E_OVERLAP'));
t('stacked storeys far enough apart are fine', parseIsle({ storeys:[{ rows:['S . G'], at:[0, 0, 0] }, { rows:['. .'], at:[1, 0, 8] }] }).ok);
t('E_V6: pans need a map', code({ rows:['S a1 b1 G'] }, 'E_V6'));
t('E_V6: arch C needs a map', code({ rows:['S r - r G'] }, 'E_V6'));
t('E_PANS: one pan alone', code({ storeys:[{ rows:['S a1 G'], at:[0, 0, 0] }] }, 'E_PANS'));
t('E_PAN_H: base 0', code({ storeys:[{ rows:['S a b1 G'], at:[0, 0, 0] }] }, 'E_PAN_H'));
t('E_PAN_H: base 5', code({ storeys:[{ rows:['S a5 b1 G'], at:[0, 0, 0] }] }, 'E_PAN_H'));
t('E_PAN_PLAIN: water on a pan', code({ storeys:[{ rows:['S a~ b1 G'], at:[0, 0, 0] }] }, 'E_PAN_PLAIN'));
t('E_PAN_PLAIN: crate on a pan', code({ storeys:[{ rows:['S Ca b1 G'], at:[0, 0, 0] }] }, 'E_PAN_PLAIN'));
t('E_PORTAL: arch C unpaired', code({ storeys:[{ rows:['S r G'], at:[0, 0, 0] }] }, 'E_PORTAL'));
{ const mh = isleHash({ storeys:[{ rows:['S  .  G'], at:[0, 0, 0] }] });
  t('map hash ignores whitespace', mh === isleHash({ name:'x', storeys:[{ rows:['S . G'], at:[0, 0, 0] }] }));
  t('map hash changes with a storey offset', mh !== isleHash({ storeys:[{ rows:['S . G'], at:[1, 0, 0] }] }));
  t('map hash differs from the same rows as a v5 isle', mh !== isleHash({ rows:['S . G'] }));
  t('canonical map keeps storeys, drops names', canonicalIsle({ name:'n', storeys:[{ rows:['S G'], at:[0, 0, 0] }] }).schemaVersion === 6); }

// storey edges: two storeys touching on the map are still two isles
{ const lv = M([{ rows:['S . .'], at:[0, 0, 0] }, { rows:['. . G'], at:[3, 0, 0] }]);
  t('movement never crosses a storey edge', !run(lv, 'RRRRR').won && neighbor(lv, 2, 'R') === -1);
  t('cellPlace maps a cell to its storey and map tile', (({ storey, x, mx }) => storey === 1 && x === 0 && mx === 3)(cellPlace(lv, 4))); }
// gateways: an arch pair across storeys
{ const lv = M([{ rows:['S . p'], at:[0, 0, 0] }, { rows:['p . G'], at:[0, 0, 10] }]);
  const r = step(lv, step(lv, initialState(lv), 'R').state, 'R');
  t('gateway carries Pip to the other storey', r.ok && lv.sid[r.state.p] === 1 && r.events.some(e => e.t === 'tp' && e.gateway));
  t('gateway map solves', run(lv, 'RRRR').won);
  t('a gateway counts as "gateway", not "tp"', (m => m.includes('gateway') && !m.includes('tp'))(mechanicsUsed(lv, 'RRRR')));
  const local = M([{ rows:['S p - p G'], at:[0, 0, 0] }]);
  t('an arch pair on one storey is a plain arch', (m => m.includes('tp') && !m.includes('gateway'))(mechanicsUsed(local, 'RR'))); }

/* ---------------- Sky Scales (K1) ---------------- */
{ const lv = M([{ rows:['S2 a2 .2 G2', '-  b2 -  - '], at:[0, 0, 0] }]);
  const A = 1, B = lv.w + 1, s0 = initialState(lv);
  t('empty scales balance at base', panTilt(lv, s0) === 0 && heightAt(lv, A, 0) === 2 && heightAt(lv, B, 0) === 2);
  t('Pip on pan A: A heavier', panTilt(lv, { ...s0, p:A }) === 1 && heightAt(lv, A, 1) === 1 && heightAt(lv, B, 1) === 3);
  t('Pip on A + crate on B: balanced', panTilt(lv, { ...s0, p:A, crates:[B] }) === 0);
  t('crate on B alone: B heavier', panTilt(lv, { ...s0, crates:[B] }) === -1);
  const wide = M([{ rows:['S2 a2 .2 G2', '-  b2 b2 - '], at:[0, 0, 0] }]);
  t('a pan can span tiles; two crates outweigh Pip', panTilt(wide, { ...initialState(wide), p:1, crates:[wide.w + 1, wide.w + 2] }) === -1);
  const r1 = step(lv, s0, 'R');
  t('stepping on a pan is judged with the heights at the START of the move', r1.ok && r1.state.p === A);
  t('the pan sinks once the move settles (scales event)', r1.events.some(e => e.t === 'scales' && e.tilt === 1));
  t('Pip rides the pan down: no climbing back', !step(lv, r1.state, 'L').ok && !step(lv, r1.state, 'R').ok);
  t('no cascades: one move, one tilt', r1.events.filter(e => e.t === 'scales').length === 1); }
{ // counterweight: a crate on B lifts A; Pip steps on at the top and rides down to the goal level
  const lv = M([{ rows:['.3 a2 G2 -', 'S3 C3 b2 .2'], at:[0, 0, 0] }]);
  const r = solveIsle(lv);
  t('counterweight lifts the far pan (solver)', r.solvable && r.solution === 'RUR');
  t('without the counterweight the pan sinks under Pip', !run(lv, 'URR').won);
  t('scales show up as a mechanic', mechanicsUsed(lv, 'RUR').includes('scales')); }
{ // crates ride a pan: a crate's height follows its pan
  const lv = M([{ rows:['S2 C2 a2 .', '.  .  b2 G'], at:[0, 0, 0] }]);
  const r = step(lv, initialState(lv), 'R');
  t('a crate pushed onto a pan sinks with it', r.ok && r.state.crates[0] === 2 && heightAt(lv, 2, panTilt(lv, r.state)) === 1); }
// the chapter's signature: pans on different storeys — load the lower isle to lift the upper one
const CROSS = [{ rows:['S1 C1 b1', 'p1 .1 .1'], at:[0, 0, 0] }, { rows:['p3 a2 .2 G2'], at:[0, 0, 10] }];
{ const lv = M(CROSS);
  const r = solveIsle(lv);
  t('cross-storey scales: solvable', r.solvable && r.par === 6);
  t('cross-storey scales: the lower crate lifts the upper pan', run(lv, 'RDLRRR').won && !run(lv, 'DRRR').won);
  t('cross-storey scales: uses scales and a gateway', (m => m.includes('scales') && m.includes('gateway'))(mechanicsUsed(lv, r.solution)));
  const shape = s => Object.keys(s).join() + '|' + stateKey(s).split('|').length;
  t('solver state does not grow with scales or storeys', shape(initialState(lv)) === shape(initialState(L(['S . G'])))); }

/* ---------------- Weight II: balloon, glide, stone, buoys, gusts, seeds (Phase 3) ---------------- */
const M1 = rows => M([{ rows, at:[0, 0, 0] }]);
const go = (lv, moves, s = initialState(lv)) => { for(const m of moves){ const r = step(lv, s, m); if(!r.ok) return null; s = r.state; } return s; };
t('E_V6: balloon posts need a map', code({ rows:['S B G'] }, 'E_V6'));
t('E_V6: vents need a map', code({ rows:['S e . G'] }, 'E_V6'));
t('E_SEEDS: at most 3', code({ storeys:[{ rows:['S + + + + G'], at:[0, 0, 0] }] }, 'E_SEEDS'));
t('E_CRATES counts buoys', code({ storeys:[{ rows:['S C C C C C u u u u G'], at:[0, 0, 0] }] }, 'E_CRATES'));
t('E_GUSTS: crossing gust lines', code({ storeys:[{ rows:['S . s .', 'e . . .', '. . . G'], at:[0, 0, 0] }] }, 'E_GUSTS'));
{ const lv = M1(['S e . . # .', '. . . . . G']);
  t('gust line runs from the vent to the rock', lv.gusts.length === 1 && lv.gusts[0].cells.length === 3 && lv.gusts[0].dir === 'R'); }
{ const lv = M1(['S1 e1 .1 . .1 .2 G1']);
  t('gust line passes over a dip, stops at higher floor', lv.gusts[0].cells.length === 4); }
// taking, holding, releasing
{ const lv = M1(['S B . G']);
  const s1 = go(lv, 'RX'), r1 = step(lv, go(lv, 'R'), 'X');
  t('Use on a post takes its balloon', s1.hold === 'balloon' && r1.events.some(e => e.t === 'take' && e.what === 'balloon'));
  t('a post holds one balloon', (s => s && s.hold === '' && !step(lv, s, 'X').ok)(go(lv, 'RXX')));
  t('Use elsewhere with a balloon lets it go', go(lv, 'RXRX').hold === '');
  t('Use with empty hands off a post, pile or lever is a no-op', !step(lv, initialState(lv), 'X').ok); }
{ const lv = M1(['S P . G']);
  t('Use on a pile takes a stone', go(lv, 'RX').hold === 'stone');
  t('Use on the pile again puts it back', go(lv, 'RXX').hold === '');
  t('a stone is put back only at a pile', go(lv, 'RXRX') === null); }
// weights: plates, scales
{ const lv = M1(['S B o D G']);
  t('balloon-Pip presses no plate', !run(lv, 'RXRRR').won && run(lv, 'RRRR').won); }
{ const lv = M1(['S P o D G']);
  t('stone-Pip presses plates', run(lv, 'RXRRR').won); }
{ const lv = M1(['S2 P2 a2 G2', '-  -  b2 C2']);
  const A = 2, B = lv.w + 2, s0 = initialState(lv);
  t('stone-Pip outweighs a crate on the scales', panTilt(lv, { ...s0, p:A, hold:'stone', crates:[B] }) === 1);
  t('balloon-Pip weighs nothing on the scales', panTilt(lv, { ...s0, p:A, hold:'balloon', crates:[B] }) === -1);
  t('a buoy lifts its pan', panTilt(lv, { ...s0, crates:[], buoys:[A] }) === -1); }
// pushing
{ const lv = M1(['S B C . G']);
  t('balloon-Pip is too light to push', go(lv, 'RXR') === null && go(lv, 'RR') !== null); }
// glide
{ const lv = M1(['S4 B4 -  .  .1 G1', '.  .  .  .  .  . ']);
  const r = step(lv, go(lv, 'RX'), 'R');
  t('glide: one level lower per tile, lands where floor meets the altitude', r.ok && r.state.p === 4 && r.events.some(e => e.t === 'glide' && e.to === 4));
  t('glide: without a balloon the step is blocked', go(lv, 'RR') === null);
  t('glide shows up as a mechanic', mechanicsUsed(lv, 'RXRR').includes('glide')); }
{ const lv = M1(['S3 B3 #2 .1 G1']);
  t('glide: a rock in the way ends it', go(lv, 'RXR') === null); }
{ const lv = M1(['S3 B3 #  .1 G1']);
  t('glide: clears a low rock', go(lv, 'RXR').p === 3); }
{ const lv = M1(['S3 B3 ~  .1 G1']);
  t('glide: flies over water below the altitude', go(lv, 'RXR').p === 3); }
{ const lv = M1(['S3 B3 ~2 .1 G1']);
  t('glide: water at the altitude ends it', go(lv, 'RXR') === null); }
{ const lv = M1(['S2 B2 - - G']);
  t('glide: nothing to land on = no move', go(lv, 'RXR') === null); }
// buoys
{ const lv = M1(['S u .1 G1']);
  const r = step(lv, initialState(lv), 'R');
  t('buoy floats UP a one-level ledge', r.ok && r.state.buoys[0] === 2); }
{ const lv = M1(['S1 u1 . G']);
  t('buoy never drops down a ledge', !step(lv, initialState(lv), 'R').ok); }
{ const lv = M1(['S u ~ ~ .', '. . . . G']);
  const r = step(lv, initialState(lv), 'R');
  t('buoy pushed into water floats (does not fill it)', r.ok && r.state.buoys[0] === 2 && !r.state.filled.length && r.events.some(e => e.t === 'float'));
  const r2 = step(lv, r.state, 'R');
  t('a floating buoy is a stepping stone', r2.ok && r2.state.p === 2);
  t('Pip cannot push a floating buoy', r2.state.buoys[0] === 2); }
{ const lv = M1(['S u o D G']);
  t('buoys press no plate', !run(lv, 'RRRR').won); }
// gusts
{ const lv = M1(['S B . . .', 'n . . . G']);
  t('normal Pip stands in a gust', step(lv, initialState(lv), 'D').state.p === lv.w); }
{ const lv = M1(['.  .  .  .', 'S  B  .  .', '.  n  .  G']);   // vent (1,2) blows north over (1,1),(1,0)
  const r = step(lv, go(lv, 'R'), 'X');
  t('balloon-Pip is blown one tile downwind after Use', r.ok && r.state.p === 1 && r.events.some(e => e.t === 'gust')); }
{ const lv = M1(['S . . . .', 'e u . # G']);  // vent (0,1) blows east: the buoy drifts, stops before the rock
  const s1 = go(lv, 'R');
  t('buoys drift one tile per move', s1.buoys[0] === lv.w + 2);
  t('gusts never push into a rock', go(lv, 'R', s1).buoys[0] === lv.w + 2); }
{ const lv = M1(['S . . . .', 'e C u . G']);
  t('a crate shelters what lies behind it', go(lv, 'R').buoys[0] === lv.w + 2); }
{ const lv = M1(['. P . . .', 'S C . w G']);   // vent (3,1) blows west over (2,1),(1,1),(0,1)
  t('brace rule: weight 1 cannot push a crate into the wind', !step(lv, initialState(lv), 'R').ok);
  t('brace rule: stone-Pip can', go(lv, 'URXLDR') !== null); }
// seeds
{ const lv = M1(['S . . G', '. + . .']);
  const r = solveIsle(lv), sp = solveSeeds(lv);
  t('seeds never change par', r.par === 3);
  t('seed par: the shortest route through every seed', sp.solvable && sp.par === 5);
  t('seedsTouched reports a seed stood on', seedsTouched(lv, step(lv, initialState(lv), 'D')).length === 0 && seedsTouched(lv, step(lv, { ...initialState(lv), p:lv.w }, 'R')).length === 1); }
t('no seeds -> no seed par', solveSeeds(L(['S . G'])) === null);

/* ---------------- cozy hazards (Phase 4, K5) ---------------- */
t('E_V6: boulders need a map', code({ rows:['S H . G'] }, 'E_V6'));
t('E_V6: thorns need a map', code({ rows:['S Y . G'] }, 'E_V6'));
t('night theme is a theme', parseIsle({ theme:'night', rows:['S . G'] }).ok);
t('E_CYCLE: periods 6 and 8 never line up within 12', code({ storeys:[{ rows:['S . . . . . G', 'H . . . - - -', '- - - - - - -', 'H . . . . - -'], at:[0, 0, 0] }] }, 'E_CYCLE'));
t('E_HAZARD_START: Pip may not start in a hazard', code({ storeys:[{ rows:['. . . G', '. Y . .', '. S . .'], at:[0, 0, 0] }] }, 'E_HAZARD_START') === false
  && code({ storeys:[{ rows:['. S . G', '. Y . .', '. . . .'], at:[0, 0, 0] }] }, 'E_HAZARD_START'));
t('E_HAZARD_PIECE: a crate may not start on a boulder lane or thorn arm', code({ storeys:[{ rows:['S . . G', 'H . C .'], at:[0, 0, 0] }] }, 'E_HAZARD_PIECE')
  && code({ storeys:[{ rows:['S . . G', '. Y C .'], at:[0, 0, 0] }] }, 'E_HAZARD_PIECE') && !code({ storeys:[{ rows:['S C . G', 'H . . .'], at:[0, 0, 0] }] }, 'E_HAZARD_PIECE'));
{ const far = M1(['S . . . G', '- - - - -', '- - - - -', 'H . . - -']);   // a boulder nowhere near the route
  t('a far-off hazard is not a mechanic', !mechanicsUsed(far, 'RRRR').includes('hazard'));
  const near = M1(['S . . G', 'H . . .']);   // Pip (1,0) above the boulder at (1,1)
  t('passing beside a hazard is', mechanicsUsed(near, 'R').includes('hazard')); }
t('E_HAZARD_LANE: crossing boulder lanes', code({ storeys:[{ rows:['S . I . G', 'H . . . .', '. . . . .'], at:[0, 0, 0] }] }, 'E_HAZARD_LANE'));
{ const lv = M1(['S . . . G', 'H . . . -']);   // lane (0,1)…(3,1), period 6
  const b = lv.hazards[0], at = tt => hazardCellsAt(lv, tt)[0] - lv.w;
  t('boulder lane runs the same-height floor through its tile', b.lane.length === 4 && b.period === 6 && lv.cycle === 6);
  t('boulder rolls east, bounces, rolls back', [0, 1, 2, 3, 4, 5, 6].map(at).join() === '0,1,2,3,2,1,0');
  const cl = M1(['. S . G', '. C . .', 'H . . .']);
  t('crates never enter a hazard tile', !step(cl, initialState(cl), 'D').ok && step(M1(['. S . G', '. C . .', '. . . .']), initialState(M1(['. S . G', '. C . .', '. . . .'])), 'D').ok); }
{ const lv = M1(['S . . G', '. H . .']);        // boulder (1,1) → (2,1) at t1, (3,1) t2 …
  const r = step(lv, initialState(lv), 'D');      // Pip to (0,1): boulder moves away east — fine
  t('a hazard moving away is no hit', r.ok && r.state.t === 1 && r.events.some(e => e.t === 'hazard'));
  const s1 = step(lv, initialState(lv), 'R').state;   // Pip (1,0); t1 boulder at (2,1)
  const hit = step(lv, s1, 'R');                       // Pip → (2,0)? not the lane — fine
  t('walking beside the lane is safe', hit.ok);
  const lv2 = M1(['S . . G', '. . . .', 'H . . .']);
  const into = step(lv2, { ...initialState(lv2), p:lv2.w * 1 + 1 }, 'D');   // Pip (1,1) → (1,2) while boulder (0,2) → (1,2)
  t('stepping into the boulder\'s next tile bonks and undoes the move', !into.ok && into.bonk && into.bonk.at === lv2.w * 2 + 1);
  const swap = step(lv2, { ...initialState(lv2), p:lv2.w * 2 + 1 }, 'L');   // Pip (1,2) → (0,2) while boulder (0,2) → (1,2)
  t('swapping tiles with a hazard bonks too', !swap.ok && swap.bonk); }
{ const lv = M1(['S . . G', '. . . .', 'H . . .']);
  const w = step(lv, initialState(lv), 'X');
  t('Use with nothing to use waits a beat on a hazard isle', w.ok && w.state.p === lv.start && w.state.t === 1 && w.events.some(e => e.t === 'wait'));
  t('the turn counter is part of the state', stateKey(w.state) !== stateKey(initialState(lv)));
  t('waiting counts as a mechanic', mechanicsUsed(lv, 'X').includes('wait')); }
{ const lv = M1(['. . . G', '. Y . .', 'S . . .']);   // thorn at (1,1): arm N (1,0)(—), E (2,1)(3,1), S (1,2), W (0,1)
  t('thorn arm starts north and turns clockwise', hazardCellsAt(lv, 0).join() === [1].join() && hazardCellsAt(lv, 1).join() === [lv.w + 2, lv.w + 3].join() && hazardCellsAt(lv, 2).join() === [lv.w * 2 + 1].join() && hazardCellsAt(lv, 3).join() === [lv.w].join());
  t('thorn bush is solid', !step(lv, { ...initialState(lv), p:lv.w * 2 + 1 }, 'U').ok);
  const r = solveIsle(lv);
  t('the solver times its way past a thorn', r.solvable && simulate(lv, r.solution).won); }
{ // a crossing that only works on the right beat: wait, then go
  const lv = M1(['S  .  -', '-  .  -', 'H  .  .', '-  .  -', '-  G  -']);
  const r = solveIsle(lv);
  t('timing: the shortest route waits for the boulder', r.solvable && r.solution.includes('X') && !simulate(lv, 'RDDDD').won); }

// Nightfall: every isle's hazards are load-bearing — take the boulders off (H/I -> ground) and the
// thorns' arms off (Y -> rock) and the stripped isle's shortest route must bonk on the real one.
{ const night = CURATED_ISLES.filter(i => i.chapter === 'night');
  const strip = d => ({ ...d, storeys:d.storeys.map(st => ({ ...st, rows:st.rows.map(r => r.trim().split(/\s+/).map(tk => /^[HI]/.test(tk) ? '.' + tk.slice(1) : tk[0] === 'Y' ? '#' + tk.slice(1) : tk).join(' ')) })) });
  t('Nightfall: six hazard maps', night.length === 6 && night.every(i => Array.isArray(i.storeys) && parseIsle(i).level.hazards.length));
  for(const isle of night){
    const lv = parseIsle(isle).level, bare = solveIsle(parseIsle(strip(isle)).level);
    t(`${isle.id}: hazards are load-bearing`, bare.solvable && !simulate(lv, bare.solution).won);
  } }

/* ---------------- hash stability: v5 isles keep their identity forever ---------------- */
const FROZEN = {
  'first-steps':'3727fc423dff6394079bc314af8f522391d8f98a0834f5720f2d43360879902c', 'ledge-drop':'99c5f735c6050a3938d545f248b57a284afc86d5db90ed6460120d643df8defd',
  'mossy-crate':'ad4cc7140da0e471a025f39706c54fdcae246056c5dc4391e2cf4d5cbc7dbd80', 'root-bridge':'a2e81391e8cc2bb4f2100ac29a15465c07b18469f3d61f7a4772a517b8460f8a',
  'fern-gate':'33414f684be9fb4209bd4285f6ac4f2af766f20e6caf46903eb2feeeed910f49', 'mirage':'e48a1a2e4839444ec2b001b2db461817ff6e7491195479e14f928cb21468f8b9',
  'twin-mirages':'bf6206b7af47c312f9bea847b5b0751415a8ccbf730ee50a8edae6f7150e0399', 'sunken-well':'c0b9d0f405f3e0d30fd403c412c8c7151eee09ecb334b6010740f09c344fd454',
  'palm-plates':'7689bc255286eee3154e9b3e33fc95c1f35c5f6bf0d22843a523467715b60176', 'tide-lever':'01f6d885177e092b864cc789d47010cf9e151806a9cc25182c77b2f2962b8120',
  'low-tide':'9b73c0946422d507c13d431c5ae41741a52c4e2a32906bca7c9f648b028d4df6', 'coconut-key':'f2dc0fc0d141c56f9bf2d56bf4be5e23e619fa2375757fbfa50226cec2564946',
  'lagoon-locks':'6661e5a333db60f2ec16c8cc6cf9b4c151fcc34bfd378c32722ec3015764a3d5', 'rooftops':'9778d336a661dab80b80150c64ece128c2f97269d078f15ea19834f7f79267c9',
  'canal-lift':'821b902f8270dc7d46900a2794d7e8e1c1dbb2ce24ebea96680dfd24b56c0641', 'subway':'cf4bbc10ed8b8576af82ba96b846f733c2db6d6bc6b6e0ed9b8899d48fe1e28d',
  'night-market':'52b27ff0f378bb5993e869e3d7ecf61f64fdc1906a5938e6edb22b450d8c7d79', 'crosswalk':'4035f7cd57bc927c0c560d0bb0ec2b4a6bf7599e63e77e11743235c77467c748',
  'first-frost':'36f240d94f3c27f9357958a657cded9602c9b8d69aed6d1583c995a8bfcabe21', 'glacier-stops':'aaa6c8e7d62ff8164f62aaa951cbaee8922ca26d619f7e1969d419e5bc44a304',
  'snowball':'af9088a168516109f7c8fab1735ea478a25e4f4e74f8bb123d1dabbc91931c8b', 'glacier-maze':'521b0a5a7e3432c4fb2ae00885625fdb870113a03629e1bc590de667d754b17c',
  'frozen-gate':'5482153a39388a9bdeabd5af4f590cda81fde6201bd3430c380148aa632f3a61', 'the-peak':'cd4133e4d647783778a3cd6ec8db4fc66228e6017b018829ca9604820c906981',
  'community:TanmoyP/sundial-steps':'4d674ca8bc109cb409d34f1316a3d3c2c9a6b7a9eda952784ef77649b52c4cfb',
};
// the v5 identity formula, written out independently of format.js
const v5Hash = d => sha256hex(stableStringify({ schemaVersion:5, theme:d.theme || 'jungle', rows:d.rows.map(r => r.trim().split(/\s+/).join(' ')) }));
for(const isle of CURATED_ISLES) if(FROZEN[isle.id]) t(`hash unchanged: ${isle.id}`, isleHash(isle) === FROZEN[isle.id]);
t('every pre-map official isle is frozen here', Object.keys(FROZEN).filter(k => !k.includes(':')).every(id => CURATED_ISLES.some(i => i.id === id)));
{ const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../isles/community');
  for(const owner of fs.existsSync(dir) ? fs.readdirSync(dir) : []) for(const f of fs.readdirSync(path.join(dir, owner))){
    const d = JSON.parse(fs.readFileSync(path.join(dir, owner, f), 'utf8')), key = `community:${owner}/${f.replace(/\.json$/, '')}`;
    if(FROZEN[key]) t(`hash unchanged: ${key}`, isleHash(d) === FROZEN[key]);
    if(Array.isArray(d.rows)) t(`v5 hash formula holds: ${key}`, isleHash(d) === v5Hash(d));
  } }

/* ---------------- curated isles ---------------- */
t('at least 20 curated isles', CURATED_ISLES.length >= 20);
t('ids unique', new Set(CURATED_ISLES.map(i => i.id)).size === CURATED_ISLES.length);
t('every chapter has isles', CHAPTERS.every(c => CURATED_ISLES.some(i => (i.chapter || i.theme) === (c.id || c.theme))));
for(const isle of CURATED_ISLES){
  const { ok, errors, level } = parseIsle(isle);
  if(!ok){ t(`${isle.id}: parses (${errors.map(e => e.code).join(',')})`, false); continue; }
  const r = solveIsle(level);
  t(`${isle.id}: solvable`, r.solvable);
  t(`${isle.id}: par ${isle.par} == shortest ${r.par} (${r.solution})`, r.par === isle.par);
  const sim = simulate(level, isle.solution);
  t(`${isle.id}: stored solution replays to a win`, sim.won && sim.applied === isle.solution.length);
  let s = initialState(level); const used = new Set();
  for(const m of isle.solution){ const st = step(level, s, m); for(const e of st.events) used.add(eventMechanic(e)); s = st.state; }
  for(const n of isle.needs || []) t(`${isle.id}: uses ${n}`, used.has(n));
  const sp = solveSeeds(level);
  if(sp || isle.seedPar) t(`${isle.id}: seedPar ${isle.seedPar} == ${sp && sp.par}, and seeds sit off the par route`, sp && sp.par === isle.seedPar && sp.par > r.par);
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
const map6 = { schemaVersion:6, id:'vine-lift', name:'Vine Lift', author:'TanmoyP', theme:'jungle', storeys:CROSS, par:6, solution:'RDLRRR' };
t('contrib: a v6 map passes', checkCommunityIsle(map6).ok);
t('contrib: map reports scales + gateway', (m => m.includes('scales') && m.includes('gateway'))(checkCommunityIsle(map6).report.mechanics));
t('contrib: a map must say schemaVersion 6', !checkCommunityIsle({ ...map6, schemaVersion:5 }).ok);
t('contrib: rows with schemaVersion 6 is rejected', bad({ schemaVersion:6 }, 'schemaVersion must be'));
t('contrib: a map needs storeys, not rows', (v => !v.ok && v.errors.some(e => e.includes('unknown field "rows"')))(checkCommunityIsle({ ...map6, rows:['S G'] })));
t('contrib: map errors name the storey', (v => v.errors.some(e => e.includes('storey 2')))(checkCommunityIsle({ ...map6, storeys:[CROSS[0], { ...CROSS[1], rows:['p3 a2 ?2 G2'] }] })));
{ const f = toCommunityFile({ name:'Vine Lift', theme:'jungle', storeys:CROSS }, 'TanmoyP');
  t('toCommunityFile keeps a map a map', f.schemaVersion === 6 && Array.isArray(f.storeys) && !('rows' in f) && checkCommunityIsle(f).ok); }

console.log(`\nISLES pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
