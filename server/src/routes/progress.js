// Cloud-saved progress — what makes signing in worth it. One JSON save per account
// (stars, best moves/time, dailies, map exploration). The merge is the SAME core
// code the browser runs (mergeProgress), so a save can only ever gain: a clear is
// never lost, whichever device syncs first. The client's body is untrusted —
// sanitizeProgress is the gate (shape, caps, 64 KB).
//   GET /api/progress -> { data, updatedAt } | { data:null }
//   PUT /api/progress { data } -> { data, updatedAt }   (the merged save)
import { Router } from 'express';
import { mergeProgress, sanitizeProgress, MAX_BYTES } from '@klar/core';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';
import { progressLimiter } from '../middleware.js';

export const progress = Router();
progress.use(requireAuth);

progress.get('/', async (req, res, next) => {
  try {
    const row = await prisma.progress.findUnique({ where:{ userId:req.user.id } });
    res.set('Cache-Control', 'no-store').json(row ? { data:row.data, updatedAt:row.updatedAt.toISOString() } : { data:null });
  } catch(e){ next(e); }
});

progress.put('/', progressLimiter, async (req, res, next) => {
  const body = req.body && typeof req.body === 'object' ? req.body.data : null;
  if(body && JSON.stringify(body).length > MAX_BYTES) return res.status(413).json({ error:'save too large' });
  const incoming = sanitizeProgress(body);
  if(!incoming) return res.status(400).json({ error:'not a valid save' });
  try {
    const userId = req.user.id;
    // read-merge-write under a row lock: two devices syncing at once can't drop each other's clears
    const row = await prisma.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "Progress" ("userId", "data", "updatedAt") VALUES (${userId}, '{}'::jsonb, CURRENT_TIMESTAMP) ON CONFLICT ("userId") DO NOTHING`;
      const [cur] = await tx.$queryRaw`SELECT "data" FROM "Progress" WHERE "userId" = ${userId} FOR UPDATE`;
      const merged = sanitizeProgress(mergeProgress(cur && cur.data, incoming));
      if(!merged) return null;
      return tx.progress.update({ where:{ userId }, data:{ data:merged } });
    });
    if(!row) return res.status(413).json({ error:'save too large' });
    res.set('Cache-Control', 'no-store').json({ data:row.data, updatedAt:row.updatedAt.toISOString() });
  } catch(e){ next(e); }
});
