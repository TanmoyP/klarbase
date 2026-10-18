#!/usr/bin/env node
// tools/author.mjs — verify the OFFICIAL isles and write their JSON artifacts.
//
//   node tools/author.mjs                          verify + write content/isles/*.json
//   node --env-file=.env tools/author.mjs --seed   also publish them to the database
//
// Each official isle must parse, be solvable, have par == the solver's
// shortest, a stored solution that replays to a win, and load-bearing
// featured mechanics. Output is deterministic (no timestamps), so CI can run
// this and `git diff --exit-code content/isles` to prove artifacts are current.
// (Community isles are checked by tools/check-isles.mjs instead.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CURATED_ISLES, parseIsle, solveIsle, simulate, isleHash, canonicalIsle, stableStringify, mechanicsUsed,
} from '../core/src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'content', 'isles');
fs.mkdirSync(OUT, { recursive:true });
for(const f of fs.readdirSync(OUT)) if(f.endsWith('.json')) fs.unlinkSync(path.join(OUT, f));

let fail = 0;
const manifest = { schemaVersion:5, isles:[] };
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
  }
  const tag = errs.length ? 'FAIL' : 'PASS';
  console.log(`${tag}  ${String(i + 1).padStart(2)} ${isle.name.padEnd(14)} ${isle.theme.padEnd(9)} par ${String(isle.par).padStart(2)}  ${errs.join('; ')}`);
  if(errs.length){ fail++; return; }
  const file = `${String(i + 1).padStart(2, '0')}-${isle.id}.json`;
  const doc = { schemaVersion:5, id:isle.id, name:isle.name, theme:isle.theme, hint:isle.hint, rows:isle.rows.map(r => r.trim().split(/\s+/).join(' ')), par:isle.par, solution:isle.solution };
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(doc, null, 2) + '\n');
  manifest.isles.push({ order:i + 1, id:isle.id, name:isle.name, theme:isle.theme, par:isle.par, mechanics:used, hash:isleHash(isle), file });
});
if(fail){ console.log(`\n${fail} official isle(s) FAILED`); process.exit(1); }
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n${CURATED_ISLES.length} official isles verified — artifacts in content/isles/`);

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
