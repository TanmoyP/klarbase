#!/usr/bin/env node
// tools/growth-metrics.mjs — one snapshot of the growth numbers (marketing/PLAN.md §5).
//
//   node tools/growth-metrics.mjs            print the snapshot as JSON
//   node tools/growth-metrics.mjs --append   also write marketing/state/metrics/<date>.json
//                                            and append a row to marketing/state/metrics.csv
//
// Sources, each optional — a missing one is recorded as null, never guessed:
//   GitHub      public API; GITHUB_TOKEN or `gh auth token` unlocks traffic (needs push access)
//   Server      KLARBASE_URL (default https://klarbase.dev) + STATS_TOKEN → GET /api/stats
//   Cloudflare  CF_API_TOKEN + CF_ACCOUNT_ID + CF_SITE_TAG → Web Analytics (cookieless) visits
//
// Read-only everywhere. Zero dependencies. Tokens come from the environment only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = path.join(ROOT, 'marketing', 'state');
const REPO = process.env.KLAR_REPO || 'TanmoyP/klarbase';
const MAKER = (process.env.KLAR_MAKER || REPO.split('/')[0]).toLowerCase();   // excluded from "makers"
const SITE = (process.env.KLARBASE_URL || 'https://klarbase.dev').replace(/\/$/, '');
const DAY = 24*60*60*1000;
const now = new Date();
const ymd = d => d.toISOString().slice(0, 10);
const since7 = ymd(new Date(now - 7*DAY));

const ghToken = (() => {
  if(process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try { return execFileSync('gh', ['auth', 'token'], { encoding:'utf8', stdio:['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
})();
const warn = [];

async function gh(url, accept = 'application/vnd.github+json'){
  const res = await fetch(url.startsWith('http') ? url : `https://api.github.com${url}`, {
    headers:{ accept, 'user-agent':'klarbase-growth-metrics', ...(ghToken ? { authorization:`Bearer ${ghToken}` } : {}) } });
  if(!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
const safe = async (label, fn) => { try { return await fn(); } catch(e){ warn.push(`${label}: ${e.message}`); return null; } };

/* ---- GitHub ------------------------------------------------------------- */
async function github(){
  const repo = await safe('repo', () => gh(`/repos/${REPO}`));
  // stars gained in the last 7 days (newest pages first would need the count; 10 pages = 1000 stars is plenty for now)
  const stars7d = await safe('stargazers', async () => {
    let n = 0;
    for(let page = 1; page <= 10; page++){
      const rows = await gh(`/repos/${REPO}/stargazers?per_page=100&page=${page}`, 'application/vnd.github.star+json');
      n += rows.filter(r => r.starred_at >= since7).length;
      if(rows.length < 100) break;
    }
    return n;
  });
  // community isles on main, straight from the tree (the local checkout may lag)
  const isles = await safe('tree', async () => {
    const t = await gh(`/repos/${REPO}/git/trees/${repo?.default_branch || 'main'}?recursive=1`);
    const files = t.tree.filter(x => /^isles\/community\/[^/]+\/[^/]+\.json$/.test(x.path));
    const authors = new Set(files.map(f => f.path.split('/')[2].toLowerCase()));
    return { communityIsles:files.length, communityAuthors:[...authors].filter(a => a !== MAKER).length };
  });
  // PRs in the last 7 days; an "isle PR" touches isles/community/
  const prs = await safe('prs', async () => {
    const opened = await gh(`/search/issues?q=${encodeURIComponent(`repo:${REPO} is:pr created:>=${since7}`)}&per_page=100`);
    const merged = await gh(`/search/issues?q=${encodeURIComponent(`repo:${REPO} is:pr is:merged merged:>=${since7}`)}&per_page=100`);
    const makers = new Set(); let islePrsMerged7d = 0;
    for(const pr of merged.items){
      const files = await gh(`/repos/${REPO}/pulls/${pr.number}/files?per_page=100`);
      if(!files.some(f => f.filename.startsWith('isles/community/'))) continue;
      islePrsMerged7d++;
      const login = pr.user.login.toLowerCase();
      if(login !== MAKER) makers.add(login);
    }
    return { prsOpened7d:opened.total_count, prsMerged7d:merged.total_count, islePrsMerged7d, isleMakersMerged7d:makers.size, isleMakerLogins:[...makers] };
  });
  // traffic needs push access — a 14-day window, GitHub's own
  const views = await safe('traffic/views', () => gh(`/repos/${REPO}/traffic/views`));
  const clones = await safe('traffic/clones', () => gh(`/repos/${REPO}/traffic/clones`));
  const referrers = await safe('traffic/referrers', () => gh(`/repos/${REPO}/traffic/popular/referrers`));
  return {
    stars:repo?.stargazers_count ?? null, stars7d, forks:repo?.forks_count ?? null,
    watchers:repo?.subscribers_count ?? null, openIssues:repo?.open_issues_count ?? null,
    ...(isles || { communityIsles:null, communityAuthors:null }),
    ...(prs || { prsOpened7d:null, prsMerged7d:null, islePrsMerged7d:null, isleMakersMerged7d:null, isleMakerLogins:[] }),
    repoViews14d:views?.count ?? null, repoUniques14d:views?.uniques ?? null,
    repoClones14d:clones?.count ?? null, repoReferrers:referrers || [],
  };
}

/* ---- Klarbase server ---------------------------------------------------- */
async function server(){
  const health = await safe('health', async () => (await fetch(`${SITE}/api/health`)).ok);
  if(!process.env.STATS_TOKEN){ warn.push('server: STATS_TOKEN not set — sign-ups and online shares skipped'); return { up:health }; }
  const s = await safe('api/stats', async () => {
    const res = await fetch(`${SITE}/api/stats`, { headers:{ authorization:`Bearer ${process.env.STATS_TOKEN}` } });
    if(!res.ok) throw new Error(`${res.status} (is STATS_TOKEN set on the server too?)`);
    return res.json();
  });
  return { up:health, ...(s || {}) };
}

/* ---- Cloudflare Web Analytics ------------------------------------------- */
// GraphQL RUM dataset. Unverified until the first run with a real token —
// if the schema differs, this records null and prints the error.
async function cloudflare(){
  const { CF_API_TOKEN:token, CF_ACCOUNT_ID:account, CF_SITE_TAG:site } = process.env;
  if(!token || !account || !site){ warn.push('cloudflare: CF_API_TOKEN/CF_ACCOUNT_ID/CF_SITE_TAG not set — visits skipped'); return null; }
  return safe('cloudflare', async () => {
    const query = `query($a:String!,$s:String!,$from:Date!,$to:Date!){ viewer { accounts(filter:{accountTag:$a}) {
      total: rumPageloadEventsAdaptiveGroups(limit:1, filter:{siteTag:$s, date_geq:$from, date_leq:$to}) { sum { visits } count }
      refs:  rumPageloadEventsAdaptiveGroups(limit:15, orderBy:[sum_visits_DESC], filter:{siteTag:$s, date_geq:$from, date_leq:$to}) { sum { visits } dimensions { refererHost } }
      paths: rumPageloadEventsAdaptiveGroups(limit:15, orderBy:[sum_visits_DESC], filter:{siteTag:$s, date_geq:$from, date_leq:$to, requestPath_like:"/go/%"}) { sum { visits } dimensions { requestPath } } } } }`;
    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', { method:'POST',
      headers:{ authorization:`Bearer ${token}`, 'content-type':'application/json' },
      body:JSON.stringify({ query, variables:{ a:account, s:site, from:since7, to:ymd(now) } }) });
    const j = await res.json();
    if(j.errors?.length) throw new Error(j.errors[0].message);
    const acc = j.data.viewer.accounts[0];
    return { visits7d:acc.total[0]?.sum.visits ?? 0, pageloads7d:acc.total[0]?.count ?? 0,
      referrers:acc.refs.map(r => ({ host:r.dimensions.refererHost || '(direct)', visits:r.sum.visits })),
      landingPaths:acc.paths.map(r => ({ path:r.dimensions.requestPath, visits:r.sum.visits })) };
  });
}

/* ---- snapshot ----------------------------------------------------------- */
const [g, s, cf] = await Promise.all([github(), server(), cloudflare()]);
// North Star: Weekly Isle Makers ≈ online sharers + merged community-isle authors (maker excluded on
// the GitHub side; the server can't tell who the maker is, so an online share by the maker counts)
// — and it's null (unknown) unless both halves were measured, never a half-count passed off as the whole
const wim = s.sharers7d == null || g.isleMakersMerged7d == null ? null : s.sharers7d + g.isleMakersMerged7d;
const snap = { date:ymd(now), at:now.toISOString(), repo:REPO, site:SITE, wim, github:g, server:s, cloudflare:cf, warnings:warn };

console.log(JSON.stringify(snap, null, 2));

if(process.argv.includes('--append')){
  fs.mkdirSync(path.join(STATE, 'metrics'), { recursive:true });
  fs.writeFileSync(path.join(STATE, 'metrics', `${snap.date}.json`), JSON.stringify(snap, null, 2) + '\n');
  const cols = {
    date:snap.date, wim, visitors7d:cf?.visits7d, stars:g.stars, stars7d:g.stars7d, forks:g.forks,
    repoUniques14d:g.repoUniques14d, prsOpened7d:g.prsOpened7d, islePrsMerged7d:g.islePrsMerged7d,
    isleMakersMerged7d:g.isleMakersMerged7d, communityIsles:g.communityIsles, communityAuthors:g.communityAuthors,
    users:s.users, users7d:s.users7d, onlineIsles:s.isles, onlineIsles7d:s.isles7d, sharers7d:s.sharers7d,
  };
  const csv = path.join(STATE, 'metrics.csv');
  if(!fs.existsSync(csv)) fs.writeFileSync(csv, Object.keys(cols).join(',') + '\n');
  fs.appendFileSync(csv, Object.values(cols).map(v => v ?? '').join(',') + '\n');
  console.error(`appended ${snap.date} → marketing/state/metrics.csv`);
}
if(warn.length) console.error('warnings:\n  ' + warn.join('\n  '));
