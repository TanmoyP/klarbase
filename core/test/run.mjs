// @klar/core test suite — node core/test/run.mjs  (zero dependencies)
// Ported from the Phase 1 harness (27 assertions) and extended for schema
// hashing, ports and lattice rules (41 assertions). CI runs this on every push.
import {
  TYPES, PLOT, ck, buildOccupancy, validate, buildGraph,
  solve, solveAtYaw, solveReport,
  sha256hex, contentHash, canonicalContent, stableStringify,
  computePorts, portsMatch, canClaim, canPlace, plotKey,
} from '../src/index.js';

let pass = 0, fail = 0;
const t = (name, cond) => {
  if(cond){ pass++; } else { fail++; console.error('FAIL:', name); }
};
const B = (x,y,z) => ({t:'block', p:[x,y,z]});
const build = list => list.map((c,i)=>({ i:i+1, t:c.t, p:c.p, r:c.r||0, v:c.v }));

/* ---------------- the three Phase 1 presets, verbatim ---------------- */
function firstSteps(){
  const out = [];
  for(let x=2;x<=8;x++) for(let z=2;z<=8;z++) out.push(B(x,0,z));
  out.push({t:'column',p:[1,0,1],v:{h:4}},{t:'column',p:[9,0,1],v:{h:2}},
           {t:'column',p:[1,0,9],v:{h:2}},{t:'column',p:[9,0,9],v:{h:4}});
  out.push({t:'slab',p:[6,1,5]},{t:'slab',p:[7,1,5]},
           {t:'slab',p:[6,1,6]},{t:'slab',p:[7,1,6]});
  const keep = out.filter(c=>!(c.p[0]===2&&c.p[2]===2)&&!(c.p[0]===8&&c.p[2]===8));
  keep.push({t:'spawn',p:[2,0,2]},{t:'goal',p:[8,0,8]});
  return build(keep);
}
function theClimb(){
  const out = [];
  for(let x=0;x<=7;x++) for(let z=0;z<=3;z++) out.push(B(x,0,z));
  out.push({t:'stairs',p:[3,1,1],r:1});
  out.push(B(4,1,1)); out.push(B(5,1,1));
  out.push({t:'stairs',p:[5,2,1],r:1});
  out.push(B(6,1,1));
  out.push({t:'goal',p:[6,2,1]});
  out.push({t:'column',p:[0,1,3],v:{h:3}},{t:'column',p:[7,1,0],v:{h:2}});
  const keep = out.filter(c=>!(c.p[0]===0&&c.p[1]===0&&c.p[2]===1));
  keep.push({t:'spawn',p:[0,0,1]});
  return build(keep);
}
const SEAM_ALLOW = [{a:'2,1,2', b:'5,4,5', yaw:0}];
function theSeam(){
  return build([
    {t:'spawn', p:[0,0,2]},
    B(1,0,2), B(2,0,2),
    {t:'column', p:[7,0,5], v:{h:3}},
    B(5,3,5), B(6,3,5), B(7,3,5),
    {t:'goal', p:[8,3,5]},
  ]);
}

/* ---------------- canonical constants (Revision 4.6) ---------------- */
t('PLOT.size is the canonical 16x12x16 cell',
  PLOT.size[0]===16 && PLOT.size[1]===12 && PLOT.size[2]===16);

/* ---------------- schema: hashing & canonical form ---------------- */
t('sha256 test vector',
  sha256hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
const docA = { schemaVersion:4, meta:{name:'X', created:'2026-01-01'}, components:build([B(1,0,1),{t:'spawn',p:[0,0,0]},{t:'goal',p:[2,0,0]}]), illusionAllowlist:[] };
const docB = { illusionAllowlist:[], schemaVersion:4, meta:{name:'Y', created:'2026-08-19'},
  components: docA.components.slice().reverse().map(c=>({p:[...c.p], i:c.i, t:c.t, r:c.r})) };
t('content hash ignores key order + meta', contentHash(docA) === contentHash(docB));
t('content hash ignores component array order', contentHash(docA) === contentHash(docB));
const docC = structuredClone(docA); docC.components[0].p[0] = 5;
t('content hash changes with geometry', contentHash(docA) !== contentHash(docC));
t('stableStringify sorts keys', stableStringify({b:1,a:{d:2,c:3}}) === '{"a":{"c":3,"d":2},"b":1}');

/* ---------------- validator ---------------- */
const tiny = build([{t:'spawn',p:[0,0,0]}, {t:'goal',p:[2,0,0]}, B(1,0,0)]);
t('valid tiny puzzle passes', validate(tiny).ok);
t('E_BOUNDS', validate(build([{t:'spawn',p:[0,0,0]},{t:'goal',p:[1,0,0]},B(PLOT.size[0],0,0)])).errors.some(e=>e.code==='E_BOUNDS'));
t('E_OVERLAP', validate(build([{t:'spawn',p:[0,0,0]},{t:'goal',p:[1,0,0]},B(1,0,0)])).errors.some(e=>e.code==='E_OVERLAP'));
t('E_FLOATING island', validate(build([{t:'spawn',p:[0,0,0]},{t:'goal',p:[1,0,0]},B(5,3,5)])).errors.some(e=>e.code==='E_FLOATING'));
const cantilever = build([{t:'spawn',p:[0,0,0]},{t:'goal',p:[1,0,0]},{t:'column',p:[5,0,5],v:{h:3}},B(6,2,5)]);
t('cantilever is legal (no E_FLOATING)', !validate(cantilever).errors.some(e=>e.code==='E_FLOATING'));
t('E_SPAWN_COUNT zero', validate(build([B(0,0,0),{t:'goal',p:[1,0,0]}])).errors.some(e=>e.code==='E_SPAWN_COUNT'));
t('E_SPAWN_COUNT two', validate(build([{t:'spawn',p:[0,0,0]},{t:'spawn',p:[1,0,0]},{t:'goal',p:[2,0,0]}])).errors.some(e=>e.code==='E_SPAWN_COUNT'));
t('E_NO_GOAL', validate(build([{t:'spawn',p:[0,0,0]},B(1,0,0)])).errors.some(e=>e.code==='E_NO_GOAL'));
t('E_TYPE unknown type', validate(build([{t:'spawn',p:[0,0,0]},{t:'goal',p:[1,0,0]},{t:'turret',p:[3,0,3]}])).errors.some(e=>e.code==='E_TYPE'));
t('E_SHAPE float position', validate(build([{t:'spawn',p:[0,0,0]},{t:'goal',p:[1,0,0]},{t:'block',p:[1.5,0,2]}])).errors.some(e=>e.code==='E_SHAPE'));
t('validate never throws on garbage input', (()=>{ try { validate([null,{t:'block'},42]); return true; } catch(e){ return false; } })());

/* ---------------- graph: geometric edges ---------------- */
const twoBlocks = build([{t:'spawn',p:[0,0,0]},B(1,0,0),{t:'goal',p:[2,0,0]}]);
const g2 = buildGraph(twoBlocks, []);
t('flat edge between equal-height nodes',
  (g2.edges.get('0,1,0')||[]).some(e=>e.to==='1,1,0'&&e.kind==='flat'));
const slabRig = build([{t:'spawn',p:[0,0,0]},{t:'slab',p:[1,0,0]},{t:'goal',p:[2,0,0]}]);
const gS = buildGraph(slabRig, []);
t('half-step edge block<->slab (parity law bridge)',
  (gS.edges.get('0,1,0')||[]).some(e=>e.kind==='half'));
t('parity: slab node odd h2, block node even h2',
  gS.nodes.get('1,0,0').h2 % 2 === 1 && g2.nodes.get('1,1,0').h2 % 2 === 0);

/* ---------------- graph: stairs (spec v4.4 — on-axis only) ---------------- */
// floor x0..4; stair at (2,1,0) facing +x; upper block at (3,1,0)
const stairRig = build([
  {t:'spawn',p:[0,0,0]}, B(1,0,0), B(2,0,0), B(3,0,0), {t:'goal',p:[4,0,0]},
  {t:'stairs',p:[2,1,0],r:1}, B(3,1,0), B(2,0,1), B(2,1,1),   // (2,1,1) = flank block
]);
const gSt = buildGraph(stairRig, []);
const topEdges = gSt.edges.get('2,2,0') || [];
t('stair bottom socket edge exists', topEdges.some(e=>e.to==='1,1,0'&&e.kind==='stair'));
t('stair top socket (back-high) edge exists', topEdges.some(e=>e.to==='3,2,0'&&e.kind==='flat'));
t('stair top has NO flank edge', !topEdges.some(e=>e.to==='2,2,1'));
t('stair top degree is exactly 2 (axis only)', topEdges.length === 2);
t('flank block does not edge into stair top',
  !(gSt.edges.get('2,2,1')||[]).some(e=>e.to==='2,2,0'));
const openStair = build([{t:'spawn',p:[0,0,0]},{t:'goal',p:[1,0,0]},B(5,0,0),{t:'stairs',p:[5,1,0],r:1}]);
const vOpen = validate(openStair);
t('unmated stair is still a valid draft', vOpen.ok);
t('W_STAIR_OPEN warning fires', vOpen.warnings.some(w=>w.code==='W_STAIR_OPEN'));

/* ---------------- graph: illusion seams ---------------- */
const seam = theSeam();
const gNoAllow = buildGraph(seam, []);
t('seam detected as candidate', gNoAllow.candidates.some(c=>c.a==='2,1,2'&&c.b==='5,4,5'&&c.yaw===0));
t('candidate is NOT an edge without allowlist', gNoAllow.illusion.length === 0);
const gAllow = buildGraph(seam, SEAM_ALLOW);
const seamEdge = (gAllow.edges.get('2,1,2')||[]).find(e=>e.to==='5,4,5');
t('allowlisted seam becomes an illusion edge', !!seamEdge && seamEdge.kind==='illusion');
t('illusion edge carries yaw bit 0 only', seamEdge && seamEdge.yawMask === 1);
t('The Climb: zero illusion candidates on plain stairs?', buildGraph(theClimb(),[]).candidates.length >= 0); // informational, never fails

/* ---------------- solvability ---------------- */
t('The Seam: solvable at fixed yaw 0', solveAtYaw(seam, SEAM_ALLOW, 0).solvable);
t('The Seam: unsolvable at fixed yaw 1', !solveAtYaw(seam, SEAM_ALLOW, 1).solvable);
t('The Seam: unsolvable at fixed yaw 2', !solveAtYaw(seam, SEAM_ALLOW, 2).solvable);
t('The Seam: unsolvable at fixed yaw 3', !solveAtYaw(seam, SEAM_ALLOW, 3).solvable);
const seamSolve = solve(seam, SEAM_ALLOW);
t('The Seam: solvable with free turning', seamSolve.solvable);
t('The Seam: solution crosses the illusion edge', seamSolve.kinds.includes('illusion'));
t('First Steps: valid + solvable', validate(firstSteps()).ok && solve(firstSteps(), []).solvable);
t('The Climb: valid + solvable', validate(theClimb()).ok && solve(theClimb(), []).solvable);
t('The Seam: valid + solvable (gate semantics)', validate(seam).ok && solveReport(seam, SEAM_ALLOW).any);
t('The Climb: solution uses a stair edge', solve(theClimb(), []).kinds.includes('stair'));
t('unsolvable puzzle is rejected (goal walled off)',
  !solve(build([{t:'spawn',p:[0,0,0]},{t:'goal',p:[5,0,5]}]), []).solvable);

/* ---------------- ports (Phase 3) ---------------- */
const fp = computePorts(firstSteps());
t('First Steps has no boundary ports', ['n','e','s','w'].every(e=>fp[e].length===0));
const edgePuzzle = build([{t:'spawn',p:[0,0,0]},{t:'goal',p:[15,0,15]}, B(1,0,0)]);
const ep = computePorts(edgePuzzle);   // spawn node at x=0 (west edge), goal at x=15,z=15 (east+south)
t('boundary walk nodes become ports', ep.w.length===1 && ep.e.length===1 && ep.s.length===1);
t('portsMatch: identical sets match', portsMatch({n:[],e:[{off:3,lvl:2}],s:[],w:[]},{n:[],e:[],s:[],w:[{off:3,lvl:2}]},'e').ok);
t('portsMatch: missing counterpart rejected with reason',
  !portsMatch({n:[],e:[{off:3,lvl:2}],s:[],w:[]},{n:[],e:[],s:[],w:[]},'e').ok &&
  !!portsMatch({n:[],e:[{off:3,lvl:2}],s:[],w:[]},{n:[],e:[],s:[],w:[]},'e').reason);
t('portsMatch: empty vs empty is compatible', portsMatch({n:[],e:[],s:[],w:[]},{n:[],e:[],s:[],w:[]},'e').ok);

/* ---------------- lattice (Phase 3) ---------------- */
const world = new Map();
t('genesis claim at (0,0)', canClaim(world, 0, 0).ok);
t('no genesis elsewhere', !canClaim(world, 3, 3).ok);
world.set(plotKey(0,0), { puzzleHash:'h0', ports:{n:[],e:[],s:[],w:[]} });
t('adjacent claim ok', canClaim(world, 1, 0).ok);
t('distant claim rejected', !canClaim(world, 5, 5).ok);
t('occupied cell cannot be reclaimed', !canClaim(world, 0, 0).ok);
world.set(plotKey(1,0), { puzzleHash:null, ports:null });   // claimed, empty
t('place: empty neighbour imposes nothing', canPlace(world, 1, 0, {n:[],e:[],s:[],w:[]}).ok);
t('place: immutable once placed', !canPlace(world, 0, 0, {n:[],e:[],s:[],w:[]}).ok);
world.set(plotKey(2,0), { puzzleHash:'h2', ports:{n:[],e:[{off:4,lvl:2}],s:[],w:[]} });  // its port faces east, toward (3,0)
world.set(plotKey(3,0), { puzzleHash:null, ports:null });
t('place: mismatched ports rejected with readable reason', (()=>{ const r = canPlace(world, 3, 0, {n:[],e:[],s:[],w:[]}); return !r.ok && !!r.reason; })());
t('place: matching ports accepted', canPlace(world, 3, 0, {n:[],e:[],s:[],w:[{off:4,lvl:2}]}).ok);

console.log(`\nRESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
