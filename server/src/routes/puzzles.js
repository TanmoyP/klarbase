// Puzzles API — Phase 2 scope.
// THE PUBLISH GATE IS THE SECURITY BOUNDARY OF THE WHOLE PROJECT.
// The client's validation exists for UX only; anything stored has passed
// @klar/core validate() + solvability HERE, on the server, from the same
// module the client uses. Never trust the client; never fork the rules.
import { Router } from 'express';
import {
  SCHEMA_VERSION, validate, solveReport, canonicalContent,
  stableStringify, contentHash, computePorts, ERR_TEXT,
} from '@klar/core';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';
import { publishLimiter, reportLimiter } from '../middleware.js';

export const puzzles = Router();

const REPORT_AUTOHIDE = 3;  // moderation hook: N distinct reports hides a puzzle
const pub = p => ({ hash:p.hash, title:p.title, status:p.status, createdAt:p.createdAt,
                    author:{ id:p.author.id, name:p.author.name } });

/* ---- public: play a shared maquette (no login required) ---------------- */
// phase2-kickoff §4.7: "no account required to play a shared puzzle". A live
// maquette is public; a hidden one 404s to strangers. Everything AFTER the
// requireAuth line below — publish, browse, delete, report — stays gated.
puzzles.get('/:hash', async (req, res) => {
  const p = await prisma.puzzle.findUnique({ where:{ hash:req.params.hash }, include:{ author:true } });
  if(!p || p.status === 'hidden') return res.status(404).json({ error:'not found' });
  res.json({ ...pub(p), puzzle: JSON.parse(p.json) });
});

puzzles.use(requireAuth);   // ------- everything below requires login -------

/* ---- publish ---------------------------------------------------------- */
// POST /api/puzzles  { title, puzzle }  ->  { hash, deduped? }  |  422 { errors }
puzzles.post('/', publishLimiter, async (req, res) => {
  const { title, puzzle } = req.body || {};
  if(!title || typeof title !== 'string' || title.length > 80)
    return res.status(400).json({ error:'title required (max 80 chars)' });
  if(!puzzle || puzzle.schemaVersion !== SCHEMA_VERSION || !Array.isArray(puzzle.components))
    return res.status(422).json({ errors:[{ code:'E_SHAPE', text:'not a v4 puzzle document' }] });

  // 1. validate — zero errors required (warnings, e.g. W_STAIR_OPEN, are allowed)
  const comps = puzzle.components;
  const v = validate(comps);
  if(!v.ok)
    return res.status(422).json({
      errors: v.errors.map(e => ({ ...e, text: ERR_TEXT[e.code] || e.code })),
    });

  // 2. solvable — the avatar must be able to reach a goal from the spawn,
  //    turning freely (illusion edges usable at their authored yaw)
  const allow = Array.isArray(puzzle.illusionAllowlist) ? puzzle.illusionAllowlist : [];
  const s = solveReport(comps, allow);
  if(!s.any)
    return res.status(422).json({
      errors:[{ code:'E_UNSOLVABLE', text:'no path from spawn to goal at any camera yaw' }],
    });

  // 3. canonicalize -> hash -> dedup. Identical content is one row, first
  //    publisher owns it; republishing your own puzzle is idempotent.
  const canonical = canonicalContent(puzzle);
  const hash = contentHash(puzzle);
  const existing = await prisma.puzzle.findUnique({ where:{ hash }, include:{ author:true } });
  if(existing) return res.status(existing.authorId === req.user.id ? 200 : 409)
    .json({ hash, deduped:true, author: pub(existing).author });

  const ports = computePorts(comps);
  const row = await prisma.puzzle.create({
    data:{
      hash, title: title.trim(),
      json: stableStringify(canonical),
      portsJson: JSON.stringify(ports),
      authorId: req.user.id,
      status: 'live',          // flip to 'pending' here if you want pre-moderation
    },
    include:{ author:true },
  });
  res.status(201).json({ hash: row.hash, ...pub(row) });
});

/* ---- browse (cursor pagination) --------------------------------------- */
// GET /api/puzzles?cursor=<hash>&limit=24&author=me
puzzles.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 24, 50);
  const mine = req.query.author === 'me';
  const where = mine ? { authorId: req.user.id }
                     : { status: 'live' };
  const rows = await prisma.puzzle.findMany({
    where, orderBy: [{ createdAt:'desc' }, { hash:'asc' }],
    take: limit + 1,
    ...(req.query.cursor ? { cursor:{ hash:String(req.query.cursor) }, skip:1 } : {}),
    include:{ author:true },
  });
  const page = rows.slice(0, limit);
  res.json({
    puzzles: page.map(p => ({ ...pub(p), mine: p.authorId === req.user.id })),
    nextCursor: rows.length > limit ? page[page.length-1].hash : null,
  });
});

/* ---- delete own --------------------------------------------------------- */
// A puzzle PLACED IN THE WORLD can never be deleted: plots reference its hash,
// and neighbours may depend on its ports. That is the lattice immutability
// invariant reaching back into Phase 2 — the world must not rot.
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
