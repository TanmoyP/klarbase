// Rate limits. Keyed by user id when logged in (all mutating routes are),
// falling back to IP. Publishing is the expensive/abusable action — it runs
// validation + solvability — so it gets the tightest budget.
import rateLimit from 'express-rate-limit';

const key = req => (req.user && req.user.id) || req.ip;

export const publishLimiter = rateLimit({
  windowMs: 60*60*1000, limit: 20, keyGenerator: key,
  message: { error: 'publish limit reached — 20 per hour' },
});
export const reportLimiter = rateLimit({
  windowMs: 60*60*1000, limit: 30, keyGenerator: key,
  message: { error: 'report limit reached' },
});
// Anonymous play events (K7): a real player sends a handful per isle. Keyed by
// IP in this process's memory only — never stored.
export const playLimiter = rateLimit({
  windowMs: 10*60*1000, limit: 120,
  message: { error: 'too many play events — slow down' },
});
export const worldLimiter = rateLimit({
  windowMs: 60*60*1000, limit: 60, keyGenerator: key,
  message: { error: 'too many world actions — slow down' },
});
