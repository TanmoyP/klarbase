#!/usr/bin/env node
// tools/isle-lab.mjs — the isle designer's workbench (K10). Read-only: never writes a file.
// Everything it knows comes from @klar/core (parse, step, solve, audit) — it adds
// questions a designer asks, never rules of its own.
//
//   node tools/isle-lab.mjs <isle.json | official-id> [options]
//
//   (no option)        report: gate check, par + solution, audit + tiers, "make it harder"
//                      hints, idle pieces (in the par route), nearest existing isles
//   --must <catch>     PROVE the catch is necessary: search every route that avoids it.
//                      None wins → proven. One wins → printed: an unintended shortcut.
//                      Repeatable; each catch is proved on its own.
//   --routes [n]       up to n (default 12) distinct shortest routes, with the mechanics each uses
//   --replay [moves]   text frames of the par route (or of the given moves)
//   --date YYYY-MM-DD  judge it as that day's daily (default: a daily-<date> id, else community)
//   --json             the report as JSON (for agents)
//
// A catch is <event>[@x,z[,storey]] — x = column, z = row inside the storey, from 0:
//   push sink slide cslide fall tp gateway key door toggle gate scales   (any engine event)
//   cell@x,z            Pip stands on that tile at the end of some move
// An event matches a tile if any of its at/from/to is that tile. Examples:
//   --must sink@3,2  --must toggle  --must cell@0,4  --must gateway
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURATED_ISLES, MOVES, parseIsle, cellPlace, isleHash, initialState, step, stateKey, simulate,
         solveIsle, solveSeeds, auditIsle, provisionalTier, tierById, harderHints, gutMismatch, mechanicsUsed,
         checkCommunityIsle, checkDailyIsle, bridgeUp, gatesOpen, panTilt, heightAt, hazardCellsAt } from '../core/src/isle/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET = 300000;

/* ---------------- arguments ---------------- */
const argv = process.argv.slice(2);
const opt = { must:[], routes:0, replay:null, json:false, date:null };
let target = null;
for(let i = 0; i < argv.length; i++){
  const a = argv[i], nextVal = () => argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : null;
  if(a === '--must') opt.must.push(nextVal());
  else if(a === '--routes') opt.routes = +(nextVal() || 12);
  else if(a === '--replay') opt.replay = nextVal() || '';
  else if(a === '--json') opt.json = true;
  else if(a === '--date') opt.date = nextVal();
  else if(!target) target = a;
}
if(!target){ console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 24).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(1); }

// an isles/official/ file is studied as its official id (it is that CURATED_ISLES entry)
if(fs.existsSync(target) && path.resolve(target).startsWith(path.join(ROOT, 'isles', 'official') + path.sep)) target = path.basename(target, '.json');
let doc, file = null;
if(fs.existsSync(target)){ file = path.resolve(target); doc = JSON.parse(fs.readFileSync(file, 'utf8')); }
else {
  const c = CURATED_ISLES.find(i => i.id === target);
  if(!c){ console.error(`no file or official isle "${target}"`); process.exit(1); }
  doc = { schemaVersion:c.storeys ? 6 : 5, ...c };
}
const { ok, errors, level } = parseIsle(doc);
if(!ok){ for(const e of errors) console.log('✗', e.text, e.at ? `at ${JSON.stringify(e.at)}` : ''); process.exit(1); }

const multi = level.storeys.length > 1;
const where = i => { const c = cellPlace(level, i); return multi ? `(${c.x},${c.z},s${c.storey})` : `(${c.x},${c.z})`; };
const cellAt = (x, z, k = 0) => { const s = level.storeys[k]; return s && x >= 0 && z >= 0 && x < s.w && z < s.h ? z * level.w + s.x0 + x : -1; };

/* ---------------- the state graph (shared by routes and audits) ---------------- */
// Explore every reachable state once; edges keep their move and events.
function explore(blocked = null){
  const s0 = initialState(level), k0 = stateKey(s0);
  const id = new Map([[k0, 0]]), states = [s0], won = [false], out = [[]];
  for(let n = 0; n < states.length; n++){
    if(won[n]) continue;
    for(const m of MOVES){
      const r = step(level, states[n], m); if(!r.ok) continue;
      if(blocked && blocked(r, states[n])) continue;
      const k = stateKey(r.state);
      let t = id.get(k);
      if(t === undefined){
        if(id.size >= BUDGET) return { capped:true, states, won, out };
        t = id.size; id.set(k, t); states.push(r.state); won.push(r.won); out.push([]);
      }
      out[n].push({ t, m });
    }
  }
  return { capped:false, states, won, out };
}
// Distance-to-win for every node (reverse BFS); -1 = dead.
function toWinOf(g){
  const N = g.states.length, rev = Array.from({ length:N }, () => []), d = new Int32Array(N).fill(-1), q = [];
  for(let n = 0; n < N; n++) for(const e of g.out[n]) rev[e.t].push(n);
  for(let n = 0; n < N; n++) if(g.won[n]){ d[n] = 0; q.push(n); }
  for(let i = 0; i < q.length; i++) for(const p of rev[q[i]]) if(d[p] < 0){ d[p] = d[q[i]] + 1; q.push(p); }
  return d;
}
function shortest(g){
  const d = toWinOf(g);
  if(d[0] < 0) return null;
  let n = 0, path = '';
  while(!g.won[n]){ const e = g.out[n].find(e => d[e.t] === d[n] - 1); path += e.m; n = e.t; }
  return path;
}

/* ---------------- catches: prove necessity ---------------- */
function parseCatch(spec){
  const m = /^([a-z]+)(?:@(\d+),(\d+)(?:,s?(\d+))?)?$/.exec(spec || '');
  if(!m) throw new Error(`bad catch "${spec}" — use event[@x,z[,storey]]`);
  const cell = m[2] != null ? cellAt(+m[2], +m[3], m[4] != null ? +m[4] : 0) : null;
  if(m[2] != null && cell < 0) throw new Error(`catch "${spec}" points outside the isle`);
  const touches = e => cell == null || e.at === cell || e.from === cell || e.to === cell;
  if(m[1] === 'cell'){
    if(cell == null) throw new Error('cell needs @x,z');
    return r => r.state.p === cell || r.events.some(e => (e.t === 'walk' || e.t === 'slide' || e.t === 'tp') && e.to === cell);
  }
  if(m[1] === 'gateway') return r => r.events.some(e => e.t === 'tp' && e.gateway && touches(e));
  return r => r.events.some(e => e.t === m[1] && touches(e));
}
function proveNecessary(spec){
  const uses = parseCatch(spec);
  const g = explore(r => uses(r));
  if(g.capped) return { spec, proven:null, note:`search capped at ${BUDGET} states — unproven` };
  const route = shortest(g);
  return route == null ? { spec, proven:true } : { spec, proven:false, shortcut:route, length:route.length };
}

/* ---------------- distinct shortest routes ---------------- */
function listRoutes(g, max){
  const d = toWinOf(g), out = [];
  const walk = (n, acc) => {
    if(out.length >= max) return;
    if(g.won[n]){ out.push(acc); return; }
    for(const e of g.out[n]) if(d[e.t] === d[n] - 1) walk(e.t, acc + e.m);
  };
  if(d[0] >= 0) walk(0, '');
  return out.map(r => ({ route:r, mechanics:mechanicsUsed(level, r) }));
}

/* ---------------- idle pieces: what the par route never uses ---------------- */
function idlePieces(moves){
  let s = initialState(level);
  const crates = level.crates.map(p => ({ start:p, at:p, moved:false }));
  const used = { lever:new Set(), tp:new Set(), key:new Set(), door:new Set(), plate:new Set(), pan:false };
  const press = st => { for(const pl of level.plates) if(st.p === pl || st.crates.includes(pl)) used.plate.add(pl); };
  press(s);
  for(const m of moves){
    const r = step(level, s, m); if(!r.ok) break;
    for(const e of r.events){
      if(e.t === 'push' || e.t === 'cslide'){ const c = crates.find(c => c.at === e.from); if(c){ c.at = e.to; c.moved = true; } }
      if(e.t === 'toggle') used.lever.add(s.p);
      if(e.t === 'tp'){ used.tp.add(e.from); used.tp.add(e.to); }
      if(e.t === 'key') used.key.add(e.at);
      if(e.t === 'door') used.door.add(e.at);
      if(e.t === 'scales') used.pan = true;
    }
    s = r.state; press(s);
  }
  const idle = [];
  for(const c of crates) if(!c.moved) idle.push(`crate ${where(c.start)} never pushed${level.cells[c.start].pan || level.cells[c.start].kind === 'plate' ? ' (sits on a pan/plate — ballast?)' : ''}`);
  for(const l of level.levers) if(!used.lever.has(l)) idle.push(`lever ${where(l)} never pulled`);
  for(const [i, j] of Object.entries(level.twin)) if(+i < j && !used.tp.has(+i) && !used.tp.has(j)) idle.push(`arch pair ${where(+i)}–${where(j)} never used`);
  for(const k of level.keys) if(!used.key.has(k)) idle.push(`key ${where(k)} never taken`);
  for(const dd of level.doors) if(!used.door.has(dd)) idle.push(`door ${where(dd)} never opened`);
  if(level.gates.length) for(const p of level.plates) if(!used.plate.has(p)) idle.push(`plate ${where(p)} never pressed`);
  if(level.pans && !used.pan) idle.push('the scales never tip');
  return idle;
}

/* ---------------- similarity against every isle we ship ---------------- */
// Layout overlap under all 8 rotations/mirrors and every offset: matching tiles
// (same tile = 1, same tile at another height = ½) over the larger isle's tile count.
// Flowers count as ground and trees as rocks — scenery, not design.
const gridsOf = d => (Array.isArray(d.storeys) ? d.storeys.map(s => s.rows) : [d.rows]).map(rows =>
  rows.map(r => r.trim().split(/\s+/).map(t => t[0] === '-' ? null : { ch:t[0] === ',' ? '.' : t[0] === 'T' ? '#' : t[0], h:+(t[1] || 0) })));
const SYMS = [(x, z) => [x, z], (x, z, w, h) => [w - 1 - x, z], (x, z, w, h) => [x, h - 1 - z], (x, z, w, h) => [w - 1 - x, h - 1 - z],
              (x, z) => [z, x], (x, z, w, h) => [h - 1 - z, x], (x, z, w, h) => [z, w - 1 - x], (x, z, w, h) => [h - 1 - z, w - 1 - x]];
function gridSim(A, B){
  const cellsA = [], h = A.length, w = A[0].length;
  A.forEach((row, z) => row.forEach((c, x) => c && cellsA.push({ x, z, c })));
  const mapB = new Map(); let nB = 0;
  B.forEach((row, z) => row.forEach((c, x) => { if(c){ mapB.set(x + ',' + z, c); nB++; } }));
  const denom = Math.max(cellsA.length, nB); if(!denom) return 0;
  let best = 0;
  for(const f of SYMS){
    const pts = cellsA.map(({ x, z, c }) => { const [u, v] = f(x, z, w, h); return { u, v, c }; });
    const offs = new Map();
    for(const p of pts) for(const [k, cb] of mapB) if(cb.ch === p.c.ch){
      const [bx, bz] = k.split(',').map(Number), key = (bx - p.u) + ',' + (bz - p.v);
      offs.set(key, (offs.get(key) || 0) + (cb.h === p.c.h ? 1 : 0.5));
    }
    for(const v of offs.values()) if(v > best) best = v;
  }
  return best / denom;
}
function loadAllIsles(){
  const all = CURATED_ISLES.map(i => ({ name:`official “${i.name}” (${i.id})`, doc:i }));
  const walk = dir => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes:true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.json') ? [path.join(dir, e.name)] : []) : [];
  // isles/official/ is CURATED_ISLES already — walking it too would make every official isle its own twin
  for(const f of walk(path.join(ROOT, 'isles')).filter(f => !path.relative(ROOT, f).split(path.sep).join('/').startsWith('isles/official/'))){
    try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); all.push({ name:path.relative(ROOT, f).split(path.sep).join('/'), doc:d, file:f }); } catch {}
  }
  return all;
}
// The isle under study itself (a file, or an official id) is never its own neighbour.
const isSelf = o => file ? o.file === file : !o.file && o.doc.id === doc.id;
function nearest(n = 5){
  const mine = isleHash(doc), A = gridsOf(doc), out = [];
  for(const o of loadAllIsles()){
    if(isSelf(o) || !(Array.isArray(o.doc.rows) || Array.isArray(o.doc.storeys))) continue;
    let h; try { h = isleHash(o.doc); } catch { continue; }
    if(h === mine){ out.push({ name:o.name, sim:1 }); continue; }
    const B = gridsOf(o.doc);
    let s = 0; for(const a of A) for(const b of B) s = Math.max(s, gridSim(a, b));
    out.push({ name:o.name, sim:s });
  }
  return out.sort((a, b) => b.sim - a.sim).slice(0, n);
}

/* ---------------- text frames ---------------- */
// One two-character token per tile: the tile (current form) + its current height.
// @ Pip   ! hazard this beat   C crate   u buoy   F filled water / sunk crate   d open gate
// K closed door   = up bridge   _ down bridge
function frame(s){
  const tilt = panTilt(level, s), open = gatesOpen(level, s), lines = [];
  const hz = new Set(level.hazards.length ? hazardCellsAt(level, s.t) : []);
  level.storeys.forEach((st, k) => {
    if(multi) lines.push(`storey ${k} at [${st.at.join(', ')}]`);
    lines.push('    ' + Array.from({ length:st.w }, (_, x) => String(x).padEnd(3)).join(''));
    for(let z = 0; z < st.h; z++){
      let row = String(z).padStart(2) + '  ';
      for(let x = 0; x < st.w; x++){
        const i = z * level.w + st.x0 + x, c = level.cells[i];
        let ch = c.ch;
        if(c.kind === 'void'){ row += '-  '; continue; }
        if(c.kind === 'bridge') ch = bridgeUp(c, s) ? '=' : '_';
        if(c.kind === 'gate') ch = open ? 'd' : 'D';
        if(c.kind === 'door') ch = s.opened.includes(i) ? '.' : 'K';
        if(level.keys.includes(i)) ch = s.got.includes(i) ? '.' : 'k';
        if(c.ch === 'S') ch = '.';
        if(c.ch === 'C' || c.ch === 'u' || c.ch === 'H' || c.ch === 'I') ch = '.';
        if(s.filled.includes(i)) ch = 'F';
        if(hz.has(i)) ch = '!';
        if(s.crates.includes(i)) ch = 'C';
        if(s.buoys.includes(i)) ch = 'u';
        if(s.p === i) ch = '@';
        const hh = heightAt(level, i, tilt);
        row += (ch + (hh ? hh : ' ')).padEnd(3);
      }
      lines.push(row.trimEnd());
    }
  });
  return lines.join('\n');
}
function replay(moves){
  let s = initialState(level);
  const out = ['start\n' + frame(s)];
  for(let k = 0; k < moves.length; k++){
    const r = step(level, s, moves[k]);
    if(!r.ok){ out.push(`move ${k + 1} ${moves[k]}: ${r.bonk ? 'BONK (a hazard is there next beat)' : 'BLOCKED'}`); break; }
    s = r.state;
    const ev = r.events.filter(e => e.t !== 'walk' && e.t !== 'hazard').map(e => e.t).join(' ');
    out.push(`move ${k + 1} ${moves[k]}${ev ? '  · ' + ev : ''}${level.hazards.length ? `  (beat ${s.t})` : ''}\n` + frame(s));
    if(r.won){ out.push('WON'); break; }
  }
  return out.join('\n\n');
}

/* ---------------- report ---------------- */
const date = opt.date || (/^daily-(\d{4}-\d{2}-\d{2})$/.exec(doc.id || '') || [])[1] || null;
const existing = new Map();
for(const o of loadAllIsles()) if(!isSelf(o)){ try { existing.set(isleHash(o.doc), o.name); } catch {} }
const gate = doc.author || date ? (date ? checkDailyIsle(doc, { date, existing }) : checkCommunityIsle(doc, { existing })) : null;

const solved = solveIsle(level, { maxStates:BUDGET });
const audit = auditIsle(level);
const report = {
  name:doc.name, id:doc.id, schemaVersion:doc.schemaVersion, theme:doc.theme, storeys:level.storeys.length,
  gate: gate ? { as:date ? `daily ${date}` : 'community', ok:gate.ok, errors:gate.errors } : null,
  solvable:solved.solvable, par:solved.par, solution:solved.solution, declaredPar:doc.par ?? null,
  mechanics: solved.solvable ? mechanicsUsed(level, solved.solution) : [],
  seeds: level.seeds.length ? (r => r && r.solvable ? { n:level.seeds.length, par:r.par, solution:r.solution } : { n:level.seeds.length, par:null })(solveSeeds(level, { maxStates:BUDGET })) : null,
  audit, provisionalTier: provisionalTier(audit).id, declaredTier: doc.tier || null,
  gutMismatch: doc.tier ? gutMismatch(doc.tier, audit) : null,
  harder: harderHints(audit),
  idle: solved.solvable ? idlePieces(solved.solution) : [],
  nearest: nearest(),
};
if(opt.must.length) report.catches = solved.solvable ? opt.must.map(proveNecessary) : opt.must.map(spec => ({ spec, proven:null, note:'the isle is unsolvable — nothing to prove' }));
if(opt.routes){ const g = explore(); report.routes = g.capped ? 'capped' : listRoutes(g, opt.routes); }

if(opt.json){ console.log(JSON.stringify(report, null, 2)); }
else {
  const p = (k, v) => console.log(k.padEnd(11) + ' ' + v);
  console.log(`\n${doc.name || '(unnamed)'}  ·  ${doc.theme || 'jungle'}${multi ? ` · ${level.storeys.length} storeys` : ''}\n`);
  if(report.gate) p('gate', report.gate.ok ? `PASS as ${report.gate.as}` : `FAIL as ${report.gate.as}\n` + report.gate.errors.map(e => '            ✗ ' + e).join('\n'));
  p('solver', solved.solvable ? `par ${solved.par}  ${solved.solution}` : solved.capped ? `CAPPED at ${BUDGET} states` : 'UNSOLVABLE');
  if(doc.par != null && solved.solvable && doc.par !== solved.par) p('', `✗ file says par ${doc.par}`);
  p('mechanics', report.mechanics.join(', ') || '— (plain walking)');
  if(report.seeds) p('seeds', report.seeds.par ? `${report.seeds.n} · seed par ${report.seeds.par} (+${report.seeds.par - solved.par})  ${report.seeds.solution}` : `${report.seeds.n} · NOT ALL REACHABLE before a goal`);
  p('audit', audit.capped ? `capped (${audit.states}+ states)` : `${audit.states} states · dead ${audit.deadPct}% · traps ${audit.traps} · away ${audit.away} · greedy ${audit.greedy ? 'WINS (too obvious)' : 'fails'} · routes ${audit.routes}`);
  p('tier', `audit reads ${tierById(report.provisionalTier).name}${doc.tier ? ` · declared ${tierById(doc.tier)?.name || doc.tier}` : ''}`);
  if(report.gutMismatch) p('', '⚠ ' + report.gutMismatch);
  for(const h of report.harder) p('harder?', h);
  for(const i of report.idle) p('idle', i);
  for(const n of report.nearest) p('nearest', `${Math.round(n.sim * 100)}%  ${n.name}${n.sim >= 0.7 ? '  ⚠ too similar' : ''}`);
  for(const c of report.catches || []) p('must ' + c.spec, c.proven === true ? '✓ PROVEN — every winning route uses it' : c.proven === false ? `✗ SHORTCUT without it (${c.length} moves): ${c.shortcut}` : '? ' + c.note);
  if(report.routes) for(const r of report.routes === 'capped' ? [] : report.routes) p('route', `${r.route}  [${r.mechanics.join(', ')}]`);
  if(report.routes === 'capped') p('route', `capped at ${BUDGET} states`);
}
if(opt.replay != null){
  const moves = opt.replay || solved.solution;
  if(!opt.json) console.log('\n' + replay(moves));
  const sim = simulate(level, moves);
  if(!opt.json && !sim.won) console.log(`\n(replay did not win: applied ${sim.applied}${sim.failedAt >= 0 ? `, blocked at move ${sim.failedAt + 1}` : ''})`);
}
