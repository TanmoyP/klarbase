// Per-isle comment threads. Reading is public; posting/reporting/deleting needs
// login. User data (Comment, CommentReport) cascades from User. Never returns a
// userId or email — just the display name + avatar of the author and `mine`.
//   GET    /api/comments?key&cursor&limit  -> { comments:[{ id, body, createdAt, author:{name,image}, mine }], next, count }
//   POST   /api/comments { key, body }     -> 201 { comment }     (login, 20/h)
//   DELETE /api/comments/:id               -> { ok:true }          (own only, else 404)
//   POST   /api/comments/:id/report        -> { ok:true }          (login; 3 distinct reports hide it)
// Text rules (plain text, no links, no route strings) live in comment-rules.js.
import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, sessionUser } from '../auth.js';
import { commentLimiter, reportLimiter } from '../middleware.js';
import { validIsleKey, isleExists } from './plays.js';
import { parseComment } from './comment-rules.js';

export { parseComment };
export const comments = Router();

const REPORT_AUTOHIDE = 3;          // same threshold as isles
const PAGE = 20, PAGE_MAX = 50;

const shape = (c, uid) => ({ id:c.id, body:c.body, createdAt:c.createdAt.toISOString(),
  author:{ name:c.user.name, image:c.user.image || null }, mine:!!uid && c.userId === uid });
const withUser = { user:{ select:{ name:true, image:true } } };

comments.get('/', async (req, res, next) => {
  const key = String(req.query.key || '');
  if(!validIsleKey(key)) return res.status(400).json({ error:'unknown isle key' });
  const limit = Math.min(Math.max(parseInt(req.query.limit) || PAGE, 1), PAGE_MAX);
  const where = { isleKey:key, hidden:false };
  try {
    const user = await sessionUser(req);
    const [rows, count] = await Promise.all([
      prisma.comment.findMany({
        where, orderBy:[{ createdAt:'desc' }, { id:'desc' }], take:limit + 1, include:withUser,
        ...(req.query.cursor ? { cursor:{ id:String(req.query.cursor) }, skip:1 } : {}),
      }),
      prisma.comment.count({ where }),
    ]);
    const page = rows.slice(0, limit);
    res.set('Cache-Control', 'no-store').json({
      comments: page.map(c => shape(c, user && user.id)),
      next: rows.length > limit ? page[page.length - 1].id : null,
      count,
    });
  } catch(e){ next(e); }
});

comments.post('/', requireAuth, commentLimiter, async (req, res, next) => {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  if(!validIsleKey(b.key)) return res.status(400).json({ error:'unknown isle key' });
  const c = parseComment(b.body);
  if(!c.ok) return res.status(400).json({ error:c.error });
  try {
    if(!(await isleExists(b.key))) return res.status(404).json({ error:'unknown isle' });
    const row = await prisma.comment.create({ data:{ isleKey:b.key, userId:req.user.id, body:c.body }, include:withUser });
    res.status(201).json({ comment:shape(row, req.user.id) });
  } catch(e){ next(e); }
});

comments.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const r = await prisma.comment.deleteMany({ where:{ id:String(req.params.id), userId:req.user.id } });
    if(!r.count) return res.status(404).json({ error:'not found' });
    res.json({ ok:true });
  } catch(e){ next(e); }
});

comments.post('/:id/report', requireAuth, reportLimiter, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const c = await prisma.comment.findUnique({ where:{ id }, select:{ id:true, userId:true } });
    if(!c) return res.status(404).json({ error:'not found' });
    if(c.userId === req.user.id) return res.status(400).json({ error:'that one is yours — delete it instead' });
    // one report per user: the unique pair makes a repeat a no-op, never a double count
    await prisma.commentReport.upsert({
      where:{ commentId_reporterId:{ commentId:id, reporterId:req.user.id } },
      create:{ commentId:id, reporterId:req.user.id }, update:{},
    });
    const reports = await prisma.commentReport.count({ where:{ commentId:id } });
    await prisma.comment.update({ where:{ id }, data:{ reports, ...(reports >= REPORT_AUTOHIDE ? { hidden:true } : {}) } });
    res.json({ ok:true });
  } catch(e){ next(e); }
});
