// Auth — better-auth, Google + GitHub OAuth. We do NOT hand-roll sessions or
// passwords (Phase 2 scope). Session cookies are managed entirely by the library.
// NOTE: better-auth moves fast — verify mount points against its current docs
// (https://better-auth.com) before first deploy. Pinned in package.json.
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { prisma } from './db.js';

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  baseURL: process.env.BETTER_AUTH_URL,          // e.g. http://localhost:3000
  secret: process.env.BETTER_AUTH_SECRET,        // openssl rand -hex 32
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },
  trustedOrigins: [process.env.CLIENT_ORIGIN || 'http://localhost:5173'],
});

export const authHandler = toNodeHandler(auth.handler);

// The signed-in user for a request, or null. For public routes that only
// reveal extra detail (e.g. an isle's solution) to signed-in players.
export async function sessionUser(req){
  try {
    const s = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    return (s && s.user) || null;
  } catch { return null; }
}

// Middleware: anonymous visitors may play the bundled presets only — every API
// route behind this gate requires a logged-in user (Phase 2 gating rule).
export async function requireAuth(req, res, next){
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if(!session || !session.user) return res.status(401).json({ error:'login required' });
    req.user = session.user;
    next();
  } catch(e){
    res.status(401).json({ error:'login required' });
  }
}
