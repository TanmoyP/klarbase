#!/usr/bin/env node
// tools/author.mjs — build and verify the OFFICIAL isles.
//
//   node tools/author.mjs                          render isles/official/ -> core/src/isle/official.js, verify
//   node --env-file=.env tools/author.mjs --seed   also publish them to the database
//
// Each official isle must parse, be solvable, have par == the solver's
// shortest, a stored solution that replays to a win, and load-bearing
// featured mechanics. The JSON files in isles/official/ are the artifacts; the
// rendered module is deterministic, so CI can run this and
// `git diff --exit-code core/src/isle/official.js` to prove it is current.
// (Community isles are checked by tools/check-isles.mjs instead.)
import fs from 'node:fs';
import { loadOfficial, renderModule, MODULE } from './official.mjs';

// The JSON sources are the truth; core's data module is rendered from them before anything
// imports it, so the checks below always judge what the files say.
fs.writeFileSync(MODULE, renderModule(loadOfficial()));
const {
  CURATED_ISLES, parseIsle, solveIsle, solveSeeds, simulate, isleHash, canonicalIsle, stableStringify, mechanicsUsed,
} = await import('../core/src/index.js');

let fail = 0;
CURATED_ISLES.forEach((isle, i) => {
  const errs = [];
  const { ok, errors, level } = parseIsle(isle);
  if(!ok) errs.push(...errors.map(e => e.code));
  let used = [];
  if(ok){
    const r = solveIsle(level);
    if(!r.solvable) errs.push('unsolvable');
    else if(r.par !== isle.par) errs.push(`par ${isle.par} != shortest ${r.par} (${r.solution})`);
    const sim = simulate(level, isle.solution);
    if(!sim.won || sim.applied !== isle.solution.length) errs.push('stored solution does not win');
    used = mechanicsUsed(level, isle.solution);
    for(const n of isle.needs || []) if(n !== 'walk:flat' && !used.includes(n)) errs.push(`does not use ${n}`);
    const sp = solveSeeds(level);
    if(sp ? sp.par !== isle.seedPar : isle.seedPar) errs.push(`seedPar ${isle.seedPar} != ${sp && sp.par}`);
  }
  const tag = errs.length ? 'FAIL' : 'PASS';
  const info = errs.length ? errs.join('; ') : `${isleHash(isle).slice(0, 12)}  ${used.join(', ')}`;
  console.log(`${tag}  ${String(i + 1).padStart(2)} ${isle.name.padEnd(15)} ${isle.theme.padEnd(9)} par ${String(isle.par).padStart(2)}  ${info}`);
  if(errs.length) fail++;
});
if(fail){ console.log(`
${fail} official isle(s) FAILED`); process.exit(1); }
console.log(`
${CURATED_ISLES.length} official isles verified — core/src/isle/official.js is current`);

// --seed: publish the official isles as immutable rows owned by a system user.
// Writes to whatever DATABASE_URL points at: local for testing, prod only on purpose.
if(process.argv.includes('--seed')){
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const SYS = { id:'klarbase-official', name:'Klarbase', email:'official@klarbase.dev' };
  try {
    await prisma.user.upsert({ where:{ id:SYS.id }, update:{}, create:{ ...SYS, emailVerified:true } });
    for(const isle of CURATED_ISLES){
      const json = stableStringify({ ...canonicalIsle(isle), par:isle.par, solution:isle.solution });
      await prisma.puzzle.upsert({ where:{ hash:isleHash(isle) }, update:{},
        create:{ hash:isleHash(isle), title:isle.name, json, portsJson:'{}', authorId:SYS.id, status:'live' } });
    }
    console.log(`seeded ${CURATED_ISLES.length} official isles as "${SYS.name}"`);
  } finally { await prisma.$disconnect(); }
}
process.exit(0);
