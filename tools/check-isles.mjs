#!/usr/bin/env node
// tools/check-isles.mjs — the gate every community isle passes before merge.
//
//   node tools/check-isles.mjs                 check every isle in isles/community/
//   node tools/check-isles.mjs path/to/x.json  check one file (what contributors run)
//
// In CI (pull requests) two env vars switch on the CREDIT rule:
//   ISLE_PR_AUTHOR   the PR author's GitHub login
//   ISLE_CHANGED     newline-separated paths the PR touches
// A PR may only add/edit/delete isles inside isles/community/<its-author>/ —
// so nobody can submit, alter or remove an isle credited to someone else —
// unless the author is listed in isles/MAINTAINERS.
//
// Zero dependencies and data-only: contributor files are parsed as JSON and
// judged by @klar/core. Nothing a contributor writes is ever executed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURATED_ISLES, checkCommunityIsle, checkDailyIsle, isleHash } from '../core/src/isle/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMMUNITY = path.join(ROOT, 'isles', 'community');
// Dated Daily Isles (isles/daily/YYYY-MM-DD.json) go through the same gate with
// the daily rules (checkDailyIsle): no author folder, id = daily-<date>, tier required.
const DAILY_DIR = path.join(ROOT, 'isles', 'daily');
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
const isDaily = p => p.startsWith('isles/daily/');

function listIsles(){
  const out = [];
  if(fs.existsSync(COMMUNITY)) for(const owner of fs.readdirSync(COMMUNITY)){
    const dir = path.join(COMMUNITY, owner);
    if(!fs.statSync(dir).isDirectory()) continue;
    for(const f of fs.readdirSync(dir)) out.push(path.join(dir, f));
  }
  if(fs.existsSync(DAILY_DIR)) for(const f of fs.readdirSync(DAILY_DIR)) if(f !== 'README.md') out.push(path.join(DAILY_DIR, f));
  return out;
}

const files = process.argv[2] ? [path.resolve(process.argv[2])] : listIsles();
const existing = new Map(CURATED_ISLES.map(i => [isleHash(i), `official isle "${i.name}"`]));
const results = [];
let failed = 0;

// pass 1: read + parse everything so duplicates are detected across files
const docs = files.map(f => {
  const r = { file:f, path:rel(f), errors:[], doc:null, bytes:0 };
  if(!/\.json$/.test(f)){ r.errors.push(`only .json isle files belong in ${isDaily(r.path) ? 'isles/daily/' : 'isles/community/'}`); return r; }
  try {
    const text = fs.readFileSync(f, 'utf8'); r.bytes = Buffer.byteLength(text);
    r.doc = JSON.parse(text);
  } catch(e){ r.errors.push(`not valid JSON — ${e.message}`); }
  return r;
});
// Duplicates are blamed on the newcomer: an isle already in the repo (not in
// this PR's changes) keeps its place; among equals, the first path wins.
const changedSet = new Set((process.env.ISLE_CHANGED || '').split('\n').map(s => s.trim()).filter(Boolean));
const hashes = new Map();
for(const r of docs) if(r.doc && Array.isArray(r.doc.rows)){ try { const h = isleHash(r.doc); (hashes.get(h) || hashes.set(h, []).get(h)).push(r.path); } catch {} }
const firstOwner = paths => [...paths].sort((a, b) => (changedSet.has(a) - changedSet.has(b)) || a.localeCompare(b))[0];

for(const r of docs){
  if(r.doc){
    // location rule: isles/community/<author>/<id>.json  ·  isles/daily/<YYYY-MM-DD>.json
    const parts = r.path.split('/'), daily = isDaily(r.path);
    if(daily){ if(parts.length !== 3) r.errors.push('daily isles live at isles/daily/<YYYY-MM-DD>.json'); }
    else if(parts.length !== 4 || parts[0] !== 'isles' || parts[1] !== 'community') r.errors.push('isle files live at isles/community/<your-github-username>/<id>.json');
    else {
      if(r.doc.author !== parts[2]) r.errors.push(`"author" is "${r.doc.author}" but the file is in isles/community/${parts[2]}/ — they must match`);
      if(`${r.doc.id}.json` !== parts[3]) r.errors.push(`file name must be "${r.doc.id}.json" to match its "id"`);
    }
    const others = new Map(existing);
    if(Array.isArray(r.doc.rows)){ try {
      const h = isleHash(r.doc), group = hashes.get(h) || [];
      if(group.length > 1 && firstOwner(group) !== r.path) others.set(h, firstOwner(group));
    } catch {} }
    const v = daily ? checkDailyIsle(r.doc, { date:parts.at(-1).replace(/\.json$/, ''), existing:others, bytes:r.bytes })
                    : checkCommunityIsle(r.doc, { existing:others, bytes:r.bytes });
    r.errors.push(...v.errors); r.report = v.report;
  }
  if(r.errors.length) failed++;
  results.push(r);
}

// credit rule (pull requests only)
const author = process.env.ISLE_PR_AUTHOR, changed = (process.env.ISLE_CHANGED || '').split('\n').map(s => s.trim()).filter(Boolean);
const creditErrors = [];
if(author && changed.length){
  const maintainersFile = path.join(ROOT, 'isles', 'MAINTAINERS');
  const maintainers = fs.existsSync(maintainersFile) ? fs.readFileSync(maintainersFile, 'utf8').split('\n').map(l => l.replace(/#.*/, '').trim().toLowerCase()).filter(Boolean) : [];
  const isMaintainer = maintainers.includes(author.toLowerCase());
  for(const p of changed){
    const m = /^isles\/community\/([^/]+)\//.exec(p);
    if(m && m[1].toLowerCase() !== author.toLowerCase() && !isMaintainer)
      creditErrors.push(`${p}: @${author} can only add or change isles in isles/community/${author}/`);
  }
  if(creditErrors.length) failed++;
}

/* ---------------- report ---------------- */
for(const r of results){
  const tag = r.errors.length ? 'FAIL' : 'PASS';
  const info = r.report && r.report.par ? `par ${r.report.par} · ${r.report.mechanics.join(', ')}` : '';
  console.log(`${tag}  ${r.path}  ${info}`);
  for(const e of r.errors) console.log(`      ✗ ${e}`);
}
for(const e of creditErrors) console.log(`FAIL  credit: ${e}`);
console.log(`\n${results.length} community/daily isle(s) checked — ${failed ? failed + ' problem(s)' : 'all good'}`);

if(process.env.GITHUB_STEP_SUMMARY){
  const shown = changed.length ? results.filter(r => changed.includes(r.path)) : results;
  let md = `## 🏝️ Isle check — ${failed ? '❌ changes needed' : '✅ ready to merge'}\n\n`;
  if(creditErrors.length) md += creditErrors.map(e => `- ❌ ${e}`).join('\n') + '\n\n';
  md += '| Isle | Author | Theme | Par | Mechanics | Result |\n|---|---|---|---|---|---|\n';
  for(const r of shown){
    const d = r.doc || {};
    md += `| ${d.name || r.path} | ${d.author ? '@' + d.author : '—'} | ${d.theme || '—'} | ${r.report?.par ?? '—'} | ${(r.report?.mechanics || []).join(', ') || '—'} | ${r.errors.length ? '❌ ' + r.errors.join('<br>') : '✅'} |\n`;
  }
  for(const r of shown) if(r.doc && Array.isArray(r.doc.rows)){
    md += `\n<details><summary>${r.doc.name || r.path} — map${r.report?.solution ? ` · solution <code>${r.report.solution}</code>` : ''}</summary>\n\n\`\`\`\n${r.doc.rows.join('\n')}\n\`\`\`\n</details>\n`;
  }
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}
process.exit(failed ? 1 : 0);
