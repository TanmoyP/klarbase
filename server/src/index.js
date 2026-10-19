// Klarbase server — Phase 2+3. Express 4 + Prisma + better-auth.
// In production this same process serves the built client (single-service
// deploy on Railway/Fly — see README), so no CORS is needed; in dev, Vite
// proxies /api here.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authHandler } from './auth.js';
import { puzzles } from './routes/puzzles.js';
import { world } from './routes/world.js';
import { stats } from './routes/stats.js';
import { plays } from './routes/plays.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);   // behind Railway/Fly edge proxies

// www.klarbase.dev → klarbase.dev. One origin only: sign-in cookies and OAuth
// callbacks are bound to BETTER_AUTH_URL, so a second hostname would break login.
app.use((req, res, next) => req.hostname.startsWith('www.')
  ? res.redirect(301, `https://${req.hostname.slice(4)}${req.originalUrl}`) : next());

// better-auth needs the RAW body — mount it before express.json()
app.all('/api/auth/*', authHandler);

app.use(express.json({ limit:'512kb' }));   // puzzles are small; cap the body

app.get('/api/health', (_req, res) => res.json({ ok:true }));
app.use('/api/puzzles', puzzles);
app.use('/api/world', world);
app.use('/api/stats', stats);
app.use('/api/plays', plays);     // anonymous per-isle play sums (K7)

// ---- static client (production build) ----
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if(fs.existsSync(clientDist)){
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'server error' });
});

const port = parseInt(process.env.PORT || '3000');
app.listen(port, () => console.log(`klarbase server on :${port}`));
