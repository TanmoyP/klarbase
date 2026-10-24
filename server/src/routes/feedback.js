// Player feedback — the one way to reach the maker besides GitHub. Public, no
// login needed. Stores the message, an optional reply email and the page it was
// sent from; the user id only if they happen to be signed in (so it's deleted
// with their account). Never an IP — the limiter keeps it in memory only.
//   POST /api/feedback { message, email?, page? } -> 201 { ok:true }
//   GET  /api/feedback?limit  -> newest first; maintainer only (STATS_TOKEN bearer, else 404)
import { Router } from 'express';
import { prisma } from '../db.js';
import { sessionUser } from '../auth.js';
import { feedbackLimiter } from '../middleware.js';
import { authorized } from './stats.js';

export const feedback = Router();

export const MESSAGE_MAX = 2000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAGE = /^\/[\w\-./]{0,199}$/;

// body -> { message, email, page } | { error }. Pure; exported for tests.
export function parseFeedback(body){
  const b = body && typeof body === 'object' ? body : {};
  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if(!message) return { error:'write a message first' };
  if(message.length > MESSAGE_MAX) return { error:`keep it under ${MESSAGE_MAX} characters` };
  let email = null;
  if(b.email !== undefined && b.email !== null && b.email !== ''){
    email = typeof b.email === 'string' ? b.email.trim() : '';
    if(email.length > 254 || !EMAIL.test(email)) return { error:'that email address looks wrong' };
  }
  // the page is context only; anything odd is recorded as '/' rather than refused
  const page = typeof b.page === 'string' && PAGE.test(b.page) ? b.page : '/';
  return { message, email, page };
}

feedback.post('/', feedbackLimiter, async (req, res, next) => {
  const f = parseFeedback(req.body);
  if(f.error) return res.status(400).json({ error:f.error });
  try {
    const user = await sessionUser(req);
    await prisma.feedback.create({ data:{ ...f, userId:user ? user.id : null } });
    res.status(201).json({ ok:true });
  } catch(e){ next(e); }
});

feedback.get('/', async (req, res, next) => {
  if(!authorized(req)) return res.status(404).json({ error:'not found' });
  try {
    const take = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const rows = await prisma.feedback.findMany({ orderBy:{ createdAt:'desc' }, take,
      include:{ user:{ select:{ name:true, email:true } } } });
    res.set('Cache-Control', 'no-store').json({ feedback:rows.map(r => ({
      id:r.id, at:r.createdAt.toISOString(), page:r.page, message:r.message, email:r.email,
      user:r.user ? { id:r.userId, name:r.user.name, email:r.user.email } : null })) });
  } catch(e){ next(e); }
});
