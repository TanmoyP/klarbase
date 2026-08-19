// tools/author.mjs — maquette authoring & verification harness.
//
// WHY THIS EXISTS: a maquette that doesn't pass validate() + solve() silently
// won't load or won't be winnable, and illusion geometry is exact-integer — so
// maquettes must be verified against @klar/core BEFORE they ship, never eyeballed
// or trusted from a blind LLM. This is the in-loop authoring method (spec risk #1/#2).
//
// USAGE:
//   node tools/author.mjs           # verify all maquettes below; exits non-zero on any failure
//
// It doubles as a REGRESSION CHECK for the shipped Playset: the 8 entries here
// mirror client/src/sandbox.js PRESETS. Keep them in sync — if you add/edit a
// maquette in the game, add/edit it here and confirm green first.
//
// SEAM RECIPE (the whoa): two walk nodes coincide on screen at yaw 0 iff they are
// +(d,d,d) apart in node coords (the (1,1,1) null vector). A block at (x,y,z) has a
// walk node at "x,(y+1),z" with h2=2(y+1). Author the pair into `allow` as
// {a:"x,y,z", b:"x,y,z", yaw}; buildGraph exposes detected candidates so you can
// confirm your pair is real before promoting it. A seam is only worth shipping if
// it's LOAD-BEARING: the puzzle must be UNSOLVABLE without it.

import {
  validate, buildGraph, solve, solveReport,
} from '../core/src/index.js';

const B = (x,y,z)=>({t:'block',p:[x,y,z]});
const build = list => list.map((c,i)=>({ i:i+1, t:c.t, p:c.p, r:c.r||0, v:c.v }));

/* ---- 1. First Steps ---- */
function m1(){
  const out=[];
  for(let x=2;x<=8;x++) for(let z=2;z<=8;z++) out.push(B(x,0,z));
  out.push({t:'column',p:[1,0,1],v:{h:4}},{t:'column',p:[9,0,1],v:{h:2}},
           {t:'column',p:[1,0,9],v:{h:2}},{t:'column',p:[9,0,9],v:{h:4}});
  out.push({t:'slab',p:[6,1,5]},{t:'slab',p:[7,1,5]},{t:'slab',p:[6,1,6]},{t:'slab',p:[7,1,6]});
  const keep=out.filter(c=>!(c.p[0]===2&&c.p[2]===2)&&!(c.p[0]===8&&c.p[2]===8));
  keep.push({t:'spawn',p:[2,0,2]},{t:'goal',p:[8,0,8]});
  return build(keep);
}
/* ---- 2. The Climb ---- */
function m2(){
  const out=[];
  for(let x=0;x<=7;x++) for(let z=0;z<=3;z++) out.push(B(x,0,z));
  out.push({t:'stairs',p:[3,1,1],r:1}); out.push(B(4,1,1)); out.push(B(5,1,1));
  out.push({t:'stairs',p:[5,2,1],r:1}); out.push(B(6,1,1)); out.push({t:'goal',p:[6,2,1]});
  out.push({t:'column',p:[0,1,3],v:{h:3}},{t:'column',p:[7,1,0],v:{h:2}});
  const keep=out.filter(c=>!(c.p[0]===0&&c.p[1]===0&&c.p[2]===1));
  keep.push({t:'spawn',p:[0,0,1]});
  return build(keep);
}
/* ---- 3. Split Level ---- */
function m3(){
  const out=[];
  for(let x=0;x<=7;x++) for(let z=0;z<=4;z++){
    if((x===0&&z===2)||(x===1&&z===0)||(x===7&&z===4)) continue;
    out.push(B(x,0,z));
  }
  out.push({t:'spawn',p:[0,0,2]});
  out.push({t:'stairs',p:[3,1,2],r:1});
  out.push(B(4,1,2),B(5,1,2));
  out.push({t:'column',p:[1,0,0],v:{h:3}},{t:'column',p:[7,0,4],v:{h:2}});
  out.push({t:'goal',p:[6,1,2]});
  return build(out);
}
/* ---- 4. The Seam (aligned yaw 0) ---- */
function m4(){
  return build([
    {t:'spawn',p:[0,0,0]}, B(1,0,0), B(2,0,0),
    {t:'column',p:[5,0,3],v:{h:3}}, B(5,3,3), B(6,3,3), B(7,3,3),
    {t:'goal',p:[8,3,3]},
  ]);
}
const m4allow=[{a:'2,1,0', b:'5,4,3', yaw:0}];
/* ---- 5. Turnabout (starts at yaw 1) ---- */
function m5(){
  return build([
    {t:'spawn',p:[0,0,2]}, B(1,0,2), B(2,0,2),
    {t:'column',p:[7,0,5],v:{h:3}}, B(5,3,5), B(6,3,5), B(7,3,5),
    {t:'goal',p:[8,3,5]},
  ]);
}
const m5allow=[{a:'2,1,2', b:'5,4,5', yaw:0}];
/* ---- 6. Twofold (two chained seams) ---- */
function m6(){
  return build([
    {t:'spawn',p:[0,0,0]}, B(1,0,0), B(2,0,0),
    {t:'column',p:[5,0,3],v:{h:3}}, B(5,3,3), B(6,3,3),
    {t:'column',p:[9,0,6],v:{h:4}}, {t:'column',p:[9,4,6],v:{h:2}}, B(9,6,6),
    B(10,6,6), {t:'goal',p:[11,6,6]},
  ]);
}
const m6allow=[{a:'2,1,0', b:'5,4,3', yaw:0}, {a:'6,4,3', b:'9,7,6', yaw:0}];
/* ---- 7. The Gap (starts at yaw 2; deck dead-ends, hidden seam crosses) ---- */
function m7(){
  const out=[];
  for(let x=0;x<=8;x++) for(let z=2;z<=6;z++){
    if(x===0&&z===4) continue;
    out.push(B(x,0,z));
  }
  out.push({t:'spawn',p:[0,0,4]});
  out.push({t:'stairs',p:[2,1,4],r:1}); out.push(B(3,1,4),B(4,1,4));
  out.push({t:'column',p:[7,0,7],v:{h:4}}, B(7,4,7), B(8,4,7));
  out.push({t:'goal',p:[9,4,7]});
  return build(out);
}
const m7allow=[{a:'4,2,4', b:'7,5,7', yaw:0}];
/* ---- 8. The Ascent (three stacked seams) ---- */
function m8(){
  return build([
    {t:'spawn',p:[0,0,0]}, B(1,0,0), B(2,0,0),
    {t:'column',p:[5,0,3],v:{h:3}}, B(5,3,3), B(6,3,3),
    {t:'column',p:[9,0,6],v:{h:4}}, {t:'column',p:[9,4,6],v:{h:2}}, B(9,6,6), B(10,6,6),
    {t:'column',p:[13,0,9],v:{h:4}}, {t:'column',p:[13,4,9],v:{h:4}}, {t:'column',p:[13,8,9],v:{h:1}}, B(13,9,9),
    {t:'goal',p:[14,9,9]},
  ]);
}
const m8allow=[{a:'2,1,0',b:'5,4,3',yaw:0},{a:'6,4,3',b:'9,7,6',yaw:0},{a:'10,7,6',b:'13,10,9',yaw:0}];

const SET = [
  ['1 First Steps', m1(), []],
  ['2 The Climb',   m2(), []],
  ['3 Split Level', m3(), []],
  ['4 The Seam',    m4(), m4allow],
  ['5 Turnabout',   m5(), m5allow],
  ['6 Twofold',     m6(), m6allow],
  ['7 The Gap',     m7(), m7allow],
  ['8 The Ascent',  m8(), m8allow],
];

let fail = 0;
for(const [name, comps, allow] of SET){
  const v = validate(comps);
  const sr = solveReport(comps, allow);
  const noSeam = allow.length ? solve(comps, []).solvable : null;
  const g = buildGraph(comps, allow);

  const okValid = v.ok;
  const okSolve = sr.any;
  const okBearing = !allow.length || noSeam === false;   // seam must be load-bearing
  const okPromoted = g.illusion.length >= allow.length;  // every authored seam became an edge
  const pass = okValid && okSolve && okBearing && okPromoted;
  if(!pass) fail++;

  let line = `${pass?'PASS':'FAIL'}  ${name.padEnd(14)} valid=${okValid?'Y':'N'}`;
  if(!okValid) line += '(' + v.errors.map(e=>e.code+(e.id?('#'+e.id):'')).join(',') + ')';
  line += ` solvable=${okSolve?'Y':'N'}`;
  if(allow.length) line += ` seams=${g.illusion.length}/${allow.length} load-bearing=${okBearing?'Y':'NO'}`;
  console.log(line);
  if(!pass && allow.length){
    for(const s of allow){
      const isCand = g.candidates.some(c=>((c.a===s.a&&c.b===s.b)||(c.a===s.b&&c.b===s.a))&&c.yaw===s.yaw);
      console.log(`      seam ${s.a}->${s.b}@${s.yaw}: aNode=${g.nodes.has(s.a)} bNode=${g.nodes.has(s.b)} candidate=${isCand}`);
    }
  }
}
console.log(`\n${fail ? fail+' FAILED' : 'all '+SET.length+' maquettes verified'}`);
process.exit(fail ? 1 : 0);
