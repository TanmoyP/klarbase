// Isles API (schemaVersion 5). Internal names stay "puzzle" (table, route).
// THE PUBLISH GATE IS THE SECURITY BOUNDARY OF THE WHOLE PROJECT.
// The client's checks exist for UX only; anything stored has passed the
// @klar/core isle parser + solver HERE, on the server, from the same module
// the client uses. Never trust the client; never fork the rules.
import { Router } from 'express';
import { ISLE_SCHEMA, parseIsle, solveIsle, canonicalIsle, isleHash, stableStringify } from '@klar/core';
import { prisma } from '../db.js';
import { requireAuth, sessionUser } from '../auth.js';
import { publishLimiter, reportLimiter } from '../middleware.js';

export const puzzles = Router();

const REPORT_AUTOHIDE = 3;          // moderation hook: N distinct reports hides an isle
const SOLVE_BUDGET = 200000;        // same budget as the community PR checks
const pub = p => ({ hash:p.hash, title:p.title, status:p.status, createdAt:p.createdAt,
                    author:{ id:p.author.id, name:p.author.name } });
const docOf = p => { try { return JSON.parse(p.json); } catch { return {}; } };

/* ---- public: play a shared isle (no login) ------------------------------- */
// Anyone can play a shared link. The stored solution is only sent to signed-in
// players — solutions are earned (sign in, clear the isle, or put in the time).
puzzles.get('/:hash', async (req, res) => {
  const p = await prisma.puzzle.findUnique({ where:{ hash:req.params.hash }, include:{ author:true } });
  if(!p || p.status === 'hidden') return res.status(404).json({ error:'not found' });
  const doc = docOf(p);
  if(doc.schemaVersion === ISLE_SCHEMA && !(await sessionUser(req))) delete doc.solution;
  res.json({ ...pub(p), puzzle:doc });
});

/* ---- public: browse (cursor pagination) ----------------------------------- */
// GET /api/puzzles?cursor=<hash>&limit=24[&author=me]   (author=me needs login)
puzzles.get('/', async (req, res) => {
  const user = await sessionUser(req);
  const mine = req.query.author === 'me';
  if(mine && !user) return res.status(401).json({ error:'login required' });
  const limit = Math.min(parseInt(req.query.limit) || 24, 50);
  const rows = await prisma.puzzle.findMany({
    where: mine ? { authorId:user.id } : { status:'live' },
    orderBy: [{ createdAt:'desc' }, { hash:'asc' }],
    take: limit + 1,
    ...(req.query.cursor ? { cursor:{ hash:String(req.query.cursor) }, skip:1 } : {}),
    include:{ author:true },
  });
  const page = rows.slice(0, limit);
  res.json({
    puzzles: page.map(p => { const d = docOf(p);
      return { ...pub(p), isle:d.schemaVersion === ISLE_SCHEMA, theme:d.theme || null, par:d.par || null, mine:!!user && p.authorId === user.id }; }),
    nextCursor: rows.length > limit ? page[page.length - 1].hash : null,
  });
});

puzzles.use(requireAuth);   // ------- everything below requires login -------

/* ---- publish ---------------------------------------------------------- */
// POST /api/puzzles  { title, puzzle:{ schemaVersion:5, theme, rows } }
//   -> 201 { hash } | 200/409 { hash, deduped } | 422 { errors:[{code,text}] }
puzzles.post('/', publishLimiter, async (req, res) => {
  const { title, puzzle } = req.body || {};
  if(!title || typeof title !== 'string' || title.trim().length > 60)
    return res.status(400).json({ error:'title required (max 60 chars)' });
  if(!puzzle || puzzle.schemaVersion !== ISLE_SCHEMA || !Array.isArray(puzzle.rows))
    return res.status(422).json({ errors:[{ code:'E_SHAPE', text:'not an isle document (schemaVersion 5)' }] });

  // 1. parse — the grid must be well formed (tiles, one start, a goal, paired arches…)
  const { ok, errors, level } = parseIsle(puzzle);
  if(!ok) return res.status(422).json({ errors:errors.map(e => ({ code:e.code, text:e.text })) });

  // 2. solvable — some sequence of moves must reach a goal, within budget
  const r = solveIsle(level, { maxStates:SOLVE_BUDGET });
  if(!r.solvable) return res.status(422).json({ errors:[r.capped
    ? { code:'E_TOO_BIG', text:'too large to verify — make the isle smaller' }
    : { code:'E_UNSOLVABLE', text:'not solvable — no sequence of moves reaches a goal' }] });

  // 3. canonical -> hash -> dedup. Identical isles are one row; first publisher owns it.
  const hash = isleHash(puzzle);
  const existing = await prisma.puzzle.findUnique({ where:{ hash }, include:{ author:true } });
  if(existing) return res.status(existing.authorId === req.user.id ? 200 : 409)
    .json({ hash, deduped:true, author:pub(existing).author });

  const row = await prisma.puzzle.create({
    data:{
      hash, title:title.trim(),
      json: stableStringify({ ...canonicalIsle(puzzle), par:r.par, solution:r.solution }),
      portsJson: '{}',                // isles don't join the (deferred) world lattice
      authorId: req.user.id,
      status: 'live',                 // flip to 'pending' here for pre-moderation
    },
    include:{ author:true },
  });
  res.status(201).json({ hash:row.hash, ...pub(row), par:r.par });
});

/* ---- delete own --------------------------------------------------------- */
// An entry PLACED IN THE (legacy) WORLD can never be deleted — immutability.
puzzles.delete('/:hash', async (req, res) => {
  const p = await prisma.puzzle.findUnique({ where:{ hash:req.params.hash } });
  if(!p || p.authorId !== req.user.id) return res.status(404).json({ error:'not found' });
  const placed = await prisma.plot.count({ where:{ puzzleHash:p.hash } });
  if(placed > 0)
    return res.status(409).json({ error:`placed in the world at ${placed} plot(s) — world placements are immutable` });
  await prisma.puzzle.delete({ where:{ hash:p.hash } });
  res.json({ ok:true });
});

/* ---- report (moderation hook) ------------------------------------------- */
puzzles.post('/:hash/report', reportLimiter, async (req, res) => {
  const p = await prisma.puzzle.findUnique({ where:{ hash:req.params.hash } });
  if(!p) return res.status(404).json({ error:'not found' });
  const reason = String((req.body && req.body.reason) || '').slice(0, 500);
  await prisma.report.upsert({
    where:{ puzzleHash_reporterId:{ puzzleHash:p.hash, reporterId:req.user.id } },
    create:{ puzzleHash:p.hash, reporterId:req.user.id, reason },
    update:{ reason },
  });
  const count = await prisma.report.count({ where:{ puzzleHash:p.hash } });
  if(count >= REPORT_AUTOHIDE && p.status === 'live')
    await prisma.puzzle.update({ where:{ hash:p.hash }, data:{ status:'hidden' } });
  res.json({ ok:true });
});
