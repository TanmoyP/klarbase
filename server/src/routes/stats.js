// Growth stats — aggregate counts only, for tools/growth-metrics.mjs.
// Never returns a user, an email, an id or an isle: just numbers. Off (404)
// unless STATS_TOKEN is set; callers send `Authorization: Bearer <token>`.
// Kept private so tiny early numbers aren't a public scoreboard.
import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '../db.js';

export const stats = Router();

const DAY = 24*60*60*1000;
const authorized = req => {
  const want = process.env.STATS_TOKEN;
  if(!want) return false;
  const got = Buffer.from(String(req.get('authorization') || '').replace(/^Bearer /, ''));
  const exp = Buffer.from(want);
  return got.length === exp.length && timingSafeEqual(got, exp);
};

// Express 4 doesn't catch async rejections (an unreachable DB would kill the
// process), so errors are handed to the app's error handler explicitly.
stats.get('/', async (req, res, next) => {
  if(!authorized(req)) return res.status(404).json({ error:'not found' });
  try {
    const since = new Date(Date.now() - 7*DAY);
    const [users, users7d, isles, isles7d, sharers7d] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where:{ createdAt:{ gte:since } } }),
      prisma.puzzle.count({ where:{ status:'live' } }),
      prisma.puzzle.count({ where:{ createdAt:{ gte:since } } }),
      prisma.puzzle.groupBy({ by:['authorId'], where:{ createdAt:{ gte:since } } }),
    ]);
    // sharers7d feeds the North Star (Weekly Isle Makers, marketing/PLAN.md §5)
    res.json({ at:new Date().toISOString(), users, users7d, isles, isles7d, sharers7d:sharers7d.length });
  } catch(e){ next(e); }
});
