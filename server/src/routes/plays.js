// Anonymous per-isle play stats (decision K7). Public, no login, no cookies.
// Stores ONLY running sums per isle (IslePlay): never a user, an IP, a session
// or anything per person. The rate limiter keeps IPs in memory for its window
// only. These sums feed the evolving difficulty score (K3) via @klar/core.
//   POST /api/plays { key, event:'start'|'clear'|'hint'|'restart', moves?, ms? }
//   GET  /api/plays  -> { plays:{ [key]:{ started, cleared, hints, restarts, moves, time } } }
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';
import { CURATED_ISLES, CONTRIB, DAILY, timeBucket, MOVES_CAP } from '@klar/core';
import { prisma } from '../db.js';
import { playLimiter } from '../middleware.js';

export const plays = Router();

// Isles that exist in this build: official ids, plus community and dated daily
// files bundled from isles/ (the Dockerfile copies it). Unknown keys are refused,
// so nobody can fill the table with junk rows.
const ISLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../isles');
const listJson = dir => { try { return fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch { return []; } };
const OFFICIAL = new Set(CURATED_ISLES.map(i => i.id));
const BUNDLED = new Set([
  ...(() => { try { return fs.readdirSync(path.join(ISLES_DIR, 'community')); } catch { return []; } })()
    .flatMap(a => listJson(path.join(ISLES_DIR, 'community', a)).map(f => `c/${a}/${f.slice(0, -5)}`)),
  ...listJson(path.join(ISLES_DIR, 'daily')).map(f => `d/${f.slice(0, -5)}`),
]);

const EVENTS = { start:'started', clear:'cleared', hint:'hints', restart:'restarts' };
const COMMUNITY_KEY = new RegExp(`^c/(${CONTRIB.AUTHOR.source.slice(1, -1)})/(${CONTRIB.ID.source.slice(1, -1)})$`);
const DAILY_KEY = new RegExp(`^d/(${DAILY.DATE.source.slice(1, -1)})$`);
const ONLINE_KEY = /^i\/([0-9a-f]{64})$/;

// body -> { key, event, moves?, bucket? } | { error }. Pure; exported for tests.
export function parsePlay(body){
  const b = body && typeof body === 'object' ? body : {};
  const key = typeof b.key === 'string' && b.key.length <= 80 ? b.key : '';
  if(!(OFFICIAL.has(key) || COMMUNITY_KEY.test(key) || DAILY_KEY.test(key) || ONLINE_KEY.test(key))) return { error:'unknown isle key' };
  if(!Object.hasOwn(EVENTS, b.event)) return { error:'event must be start, clear, hint or restart' };
  const out = { key, event:b.event };
  if(b.event === 'clear'){
    if(b.moves !== undefined){
      if(!Number.isInteger(b.moves) || b.moves < 1 || b.moves > 100000) return { error:'moves must be a positive integer' };
      out.moves = String(Math.min(b.moves, MOVES_CAP));
    }
    if(b.ms !== undefined){
      if(!Number.isInteger(b.ms) || b.ms < 0 || b.ms > 7 * 86400000) return { error:'ms must be a non-negative integer' };
      out.bucket = String(timeBucket(b.ms));
    }
  } else if(b.moves !== undefined || b.ms !== undefined) return { error:'moves and ms belong to a clear' };
  return out;
}

// Atomic upsert: counters and histogram cells are incremented inside Postgres,
// so concurrent players never overwrite each other. Column names come from the
// fixed EVENTS map (never from input); every value is a bound parameter.
const bump = (json, cell) => cell === undefined ? Prisma.sql`"IslePlay".${Prisma.raw(`"${json}"`)}`
  : Prisma.sql`jsonb_set("IslePlay".${Prisma.raw(`"${json}"`)}, ARRAY[${cell}::text], to_jsonb(COALESCE(("IslePlay".${Prisma.raw(`"${json}"`)} ->> ${cell}::text)::int, 0) + 1))`;
const seed = cell => cell === undefined ? Prisma.sql`'{}'::jsonb` : Prisma.sql`jsonb_build_object(${cell}::text, 1)`;
export function playSql(p){
  const col = Prisma.raw(`"${EVENTS[p.event]}"`);
  return Prisma.sql`
      INSERT INTO "IslePlay" ("isleKey", ${col}, "moves", "times", "updatedAt")
      VALUES (${p.key}, 1, ${seed(p.moves)}, ${seed(p.bucket)}, NOW())
      ON CONFLICT ("isleKey") DO UPDATE SET
        ${col} = "IslePlay".${col} + 1,
        "moves" = ${bump('moves', p.moves)},
        "times" = ${bump('times', p.bucket)},
        "updatedAt" = NOW()`;
}

plays.post('/', playLimiter, async (req, res, next) => {
  const p = parsePlay(req.body);
  if(p.error) return res.status(400).json({ error:p.error });
  try {
    if(p.key.startsWith('c/') || p.key.startsWith('d/')){ if(BUNDLED.size && !BUNDLED.has(p.key)) return res.status(404).json({ error:'unknown isle' }); }
    else if(p.key.startsWith('i/')){
      const hash = p.key.slice(2);
      if(!(await prisma.puzzle.findUnique({ where:{ hash }, select:{ hash:true } }))) return res.status(404).json({ error:'unknown isle' });
    }
    await prisma.$executeRaw(playSql(p));
    res.status(204).end();
  } catch(e){ next(e); }
});

// Aggregates for the picker. Short public cache: scores evolve, but slowly.
plays.get('/', async (_req, res, next) => {
  try {
    const rows = await prisma.islePlay.findMany({ orderBy:{ updatedAt:'desc' }, take:2000 });
    const out = {};
    for(const r of rows) out[r.isleKey] = { started:r.started, cleared:r.cleared, hints:r.hints, restarts:r.restarts, moves:r.moves, time:r.times };
    res.set('Cache-Control', 'public, max-age=60').json({ plays:out });
  } catch(e){ next(e); }
});
