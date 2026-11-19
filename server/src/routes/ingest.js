// PostHog reverse proxy: /ingest/* -> PostHog EU. Same-origin for the browser (no
// third-party request, fewer blockers), and — the point — the player's IP, cookies and
// auth never reach PostHog: only an allow-list of headers is forwarded, so PostHog sees
// our server as the sender. Mounted BEFORE express.json (it needs the raw body).
//   /ingest/static/*  -> https://eu-assets.i.posthog.com/static/*   (assets)
//   /ingest/*         -> https://eu.i.posthog.com/*                 (capture)
import express, { Router } from 'express';
import { ingestLimiter } from '../middleware.js';

const API = 'https://eu.i.posthog.com';
const ASSETS = 'https://eu-assets.i.posthog.com';
const FORWARD = ['content-type', 'content-encoding', 'user-agent'];   // everything else is dropped

// Pure (tested): the only request headers that go upstream. Notably NOT cookie,
// authorization, x-forwarded-for, x-real-ip, cf-connecting-ip, forwarded.
export function forwardHeaders(reqHeaders = {}){
  const out = {};
  for(const k of FORWARD){ const v = reqHeaders[k]; if(typeof v === 'string' && v) out[k] = v; }
  return out;
}
// '/ingest/static/x.js?v=1' -> asset URL; '/ingest/e/?ip=0' -> capture URL.
export function upstreamUrl(originalUrl){
  const rest = originalUrl.replace(/^\/ingest/, '') || '/';
  return (rest.startsWith('/static/') ? ASSETS : API) + rest;
}

export const ingest = Router();
// inflate:false — the body goes upstream exactly as received, so the forwarded content-encoding stays true.
ingest.use(ingestLimiter, express.raw({ type:'*/*', limit:'1mb', inflate:false }));
ingest.all('*', async (req, res) => {
  const hasBody = !['GET', 'HEAD'].includes(req.method) && Buffer.isBuffer(req.body) && req.body.length > 0;
  try {
    const up = await fetch(upstreamUrl(req.originalUrl), {
      method:req.method, headers:forwardHeaders(req.headers), body:hasBody ? req.body : undefined,
      redirect:'manual', signal:AbortSignal.timeout(10000),
    });
    const body = Buffer.from(await up.arrayBuffer());
    res.status(up.status);
    const ct = up.headers.get('content-type'); if(ct) res.set('content-type', ct);
    res.set('cache-control', up.headers.get('cache-control') || 'no-store').send(body);
  } catch { res.status(502).json({ error:'analytics upstream unavailable' }); }
});
