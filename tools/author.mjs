// tools/author.mjs — maquette authoring & verification harness.
//
// WHY THIS EXISTS: a maquette that doesn't pass validate() + solve() silently
// won't load or won't be winnable, and illusion geometry is exact-integer — so
// maquettes must be verified against @klar/core BEFORE they ship, never eyeballed
// or trusted from a blind LLM. This is the in-loop authoring method (spec risk #1/#2).
//
// USAGE:
//   node tools/author.mjs           # verify all maquettes and write JSONs
//   node tools/author.mjs --seed    # also seed them into the local DB
//
// It doubles as a REGRESSION CHECK for the shipped Playset: every entry here is
// mirrored in client/src/sandbox.js via @klar/core CURATED. Keep them green.

import fs from 'fs';
import path from 'path';
import {
  CURATED,
  validate, buildGraph, solve, solveReport,
  canonicalContent, stableStringify, contentHash, computePorts,
} from '../core/src/index.js';

const OUT_DIR = 'content/maquettes';

function titleToSlug(name){
  return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function docFromCurated(entry){
  const components = entry.make();
  return {
    schemaVersion: 4,
    id: `pzl_curated_${entry.slug}`,
    meta: { name: entry.name, author: 'klarbase', created: new Date().toISOString(), editorVersion: '0.1.0-curated', tags: [] },
    plot: { size: [16, 12, 16], ports: [] },
    palette: { family: 'dusk-ochre', roles: { ground: 2, structure: 5, accent: 11, void: 0 } },
    audio: { bed: 'hollow', key: 3 },
    components,
    illusionAllowlist: entry.allow || [],
  };
}

let fail = 0;
const manifest = { maquettes: [] };

fs.mkdirSync(OUT_DIR, { recursive: true });

for(const entry of CURATED){
  const doc = docFromCurated(entry);
  const comps = doc.components;
  const allow = entry.allow || [];
  const v = validate(comps);
  const sr = solveReport(comps, allow);
  const noSeam = allow.length ? solve(comps, []).solvable : null;
  const g = buildGraph(comps, allow);

  const okValid = v.ok;
  const okSolve = sr.any;
  const okBearing = !allow.length || noSeam === false;
  const okPromoted = g.illusion.length >= allow.length;
  const pass = okValid && okSolve && okBearing && okPromoted;
  if(!pass) fail++;

  let line = `${pass ? 'PASS' : 'FAIL'}  ${entry.name.padEnd(18)} valid=${okValid ? 'Y' : 'N'}`;
  if(!okValid) line += ' (' + v.errors.map(e => e.code + (e.id ? '#' + e.id : '')).join(',') + ')';
  line += ` solvable=${okSolve ? 'Y' : 'N'}`;
  if(allow.length) line += ` seams=${g.illusion.length}/${allow.length} load-bearing=${okBearing ? 'Y' : 'NO'}`;
  console.log(line);
  if(!pass && allow.length){
    for(const s of allow){
      const isCand = g.candidates.some(c => ((c.a === s.a && c.b === s.b) || (c.a === s.b && c.b === s.a)) && c.yaw === s.yaw);
      console.log(`      seam ${s.a}->${s.b}@${s.yaw}: aNode=${g.nodes.has(s.a)} bNode=${g.nodes.has(s.b)} candidate=${isCand}`);
    }
  }

  if(pass){
    const canonical = canonicalContent(doc);
    const hash = contentHash(doc);
    const file = `${String(entry.order).padStart(2,'0')}-${entry.slug}.json`;
    const filePath = path.join(OUT_DIR, file);
    fs.writeFileSync(filePath, stableStringify(canonical) + '\n');
    const ports = computePorts(comps);
    manifest.maquettes.push({
      order: entry.order,
      slug: entry.slug,
      name: entry.name,
      sub: entry.sub,
      hint: entry.hint,
      yaw: entry.yaw,
      grass: entry.grass,
      hash,
      file,
      ports,
    });
  }
}

if(!fail){
  manifest.generatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\n${CURATED.length} maquettes verified — JSONs written to ${OUT_DIR}/`);
} else {
  console.log(`\n${fail} FAILED`);
  process.exit(1);
}

// --seed: publish the verified maquettes into the DB as curated content (immutable,
// owned by a fixed system user). Writes to whatever DATABASE_URL points at — run it
// against local for testing; against prod only deliberately. Immutable: never overwrites.
if(process.argv.includes('--seed')){
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const SYS = { id:'klarbase-curated', name:'Klarbase', email:'curated@klarbase.dev' };
  try {
    await prisma.user.upsert({ where:{ id:SYS.id }, update:{}, create:{ ...SYS, emailVerified:true } });
    let n = 0;
    for(const m of manifest.maquettes){
      const json = fs.readFileSync(path.join(OUT_DIR, m.file), 'utf8').trim();  // canonical v4 doc
      await prisma.puzzle.upsert({
        where:{ hash:m.hash },
        update:{},   // content-addressed + immutable — never overwrite an existing row
        create:{ hash:m.hash, title:m.name, json, portsJson:JSON.stringify(m.ports), authorId:SYS.id, status:'live' },
      });
      n++;
      console.log(`  seeded ${m.name} (${m.hash.slice(0,12)}…)`);
    }
    console.log(`\nseeded ${n} maquettes into the DB as '${SYS.name}'`);
  } finally {
    await prisma.$disconnect();
  }
}

process.exit(0);
