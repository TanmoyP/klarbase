// World API — Phase 3 scope. The lattice rules (claim adjacency, port
// compatibility, placement immutability) live in @klar/core and are executed
// here inside transactions. Plots are rows keyed (x,y); a placed puzzle is
// never mutated or removed — the invariant that keeps the world from rotting.
import { Router } from 'express';
import { canClaim, canPlace, plotKey, neighbours4 } from '@klar/core';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';
import { worldLimiter } from '../middleware.js';

export const world = Router();
world.use(requireAuth);

// canClaim/canPlace are pure functions over a Map. We never load the whole
// lattice: a "window" map of exactly the cells a rule can see (target +
// 4-neighbours) is provably equivalent, and stays O(1) as the world grows.
function windowMap(rows){
  const m = new Map();
  for(const p of rows)
    m.set(plotKey(p.x, p.y), {
      puzzleHash: p.puzzleHash,
      ports: p.portsJson ? JSON.parse(p.portsJson) : null,
    });
  return m;
}
const withNeighbours = (x, y) => ({
  OR: [{ x, y }, ...neighbours4(x, y).map(([nx, ny]) => ({ x:nx, y:ny }))],
});

/* ---- claim a plot ------------------------------------------------------- */
// POST /api/world/claims  { x, y }
world.post('/claims', worldLimiter, async (req, res) => {
  const { x, y } = req.body || {};
  if(!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > 4096 || Math.abs(y) > 4096)
    return res.status(400).json({ error:'integer coordinates required' });
  try {
    const plot = await prisma.$transaction(async tx => {
      const total = await tx.plot.count();
      let decision;
      if(total === 0){
        decision = canClaim(new Map(), x, y);          // genesis: (0,0) only
      } else {
        const near = await tx.plot.findMany({ where: withNeighbours(x, y) });
        decision = canClaim(windowMap(near), x, y);    // free + adjacent, or rejected
      }
      if(!decision.ok) { const e = new Error(decision.reason); e.status = 422; throw e; }
      return tx.plot.create({ data:{ x, y, ownerId: req.user.id } });
    });
    res.status(201).json({ x: plot.x, y: plot.y });
  } catch(e){
    if(e.code === 'P2002') return res.status(422).json({ error:'cell already claimed' });
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* ---- place a published puzzle into an owned empty plot ------------------- */
// POST /api/world/plots/:x/:y/place  { puzzleHash }
world.post('/plots/:x/:y/place', worldLimiter, async (req, res) => {
  const x = parseInt(req.params.x), y = parseInt(req.params.y);
  const { puzzleHash } = req.body || {};
  if(!Number.isInteger(x) || !Number.isInteger(y) || !puzzleHash)
    return res.status(400).json({ error:'bad request' });
  try {
    const result = await prisma.$transaction(async tx => {
      const near = await tx.plot.findMany({ where: withNeighbours(x, y) });
      const me = near.find(p => p.x === x && p.y === y);
      if(!me || me.ownerId !== req.user.id)
        throw Object.assign(new Error('you do not own this cell'), { status:403 });
      const puzzle = await tx.puzzle.findUnique({ where:{ hash:String(puzzleHash) } });
      if(!puzzle || puzzle.authorId !== req.user.id || puzzle.status !== 'live')
        throw Object.assign(new Error('only your own published puzzles can be placed'), { status:422 });

      const decision = canPlace(windowMap(near), x, y, JSON.parse(puzzle.portsJson));
      if(!decision.ok)
        throw Object.assign(new Error(decision.reason), { status:422 });

      // atomic guard against a concurrent place on the same plot
      const n = await tx.plot.updateMany({
        where:{ x, y, puzzleHash: null },
        data:{ puzzleHash: puzzle.hash, portsJson: puzzle.portsJson },
      });
      if(n.count !== 1)
        throw Object.assign(new Error('plot already holds a puzzle — placements are immutable'), { status:409 });
      return { x, y, puzzleHash: puzzle.hash };
    });
    res.status(201).json(result);
  } catch(e){
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* ---- stream nearby cells (free-roam) ------------------------------------- */
// GET /api/world/cells?x=0&y=0&r=2
// The streaming unit is the CELL; puzzle documents are content-addressed, so
// the client dedups and caches them by hash forever (they are immutable).
world.get('/cells', async (req, res) => {
  const x = parseInt(req.query.x) || 0, y = parseInt(req.query.y) || 0;
  const r = Math.min(parseInt(req.query.r) || 2, 4);
  const plots = await prisma.plot.findMany({
    where:{ x:{ gte:x-r, lte:x+r }, y:{ gte:y-r, lte:y+r } },
    include:{ owner:{ select:{ id:true, name:true } },
              puzzle:{ select:{ hash:true, title:true, json:true } } },
  });
  res.json({
    center:{ x, y }, r,
    cells: plots.map(p => ({
      x: p.x, y: p.y,
      owner: p.owner.name,
      puzzleHash: p.puzzleHash,
      ports: p.portsJson ? JSON.parse(p.portsJson) : null,
      puzzle: p.puzzle ? JSON.parse(p.puzzle.json) : null,
      title: p.puzzle ? p.puzzle.title : null,
    })),
  });
});

/* ---- zoomed-out map ------------------------------------------------------ */
// GET /api/world/map  — every claimed cell, its author, whether it holds a
// puzzle. Fine to ~100k cells (a few hundred KB); the tiling plan for beyond
// that lives in docs/phase3-streaming.md.
world.get('/map', async (_req, res) => {
  const plots = await prisma.plot.findMany({
    select:{ x:true, y:true, puzzleHash:true, owner:{ select:{ name:true } } },
    orderBy:[{ y:'asc' }, { x:'asc' }],
  });
  res.json({
    cells: plots.map(p => ({ x:p.x, y:p.y, author:p.owner.name, placed:!!p.puzzleHash })),
  });
});
