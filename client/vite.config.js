import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// sitemap.xml — built from the same isle files the client bundles (official
// chapters, community isles, hand-made dailies), so every playable page is listed
// without hand edits. Past dailies only: live never opens today's or a future date
// by its own URL. No <lastmod> — a build date on every URL would be a guess.
const SITE = 'https://klarbase.dev';
const ISLES = fileURLToPath(new URL('../isles/', import.meta.url));
const json = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const dirs = d => fs.readdirSync(d, { withFileTypes:true }).filter(e => e.isDirectory()).map(e => e.name);
function sitemapXml(){
  const today = new Date().toISOString().slice(0, 10);
  const paths = ['/', '/play', '/daily', '/community', '/create', '/how-to-build', '/privacy'];
  for(const ch of json(path.join(ISLES, 'official/chapters.json'))) for(const id of ch.isles) paths.push(`/isle/${id}`);
  for(const a of dirs(path.join(ISLES, 'community')))
    for(const f of fs.readdirSync(path.join(ISLES, 'community', a)).filter(f => f.endsWith('.json'))){
      const d = json(path.join(ISLES, 'community', a, f)); if(d.author && d.id) paths.push(`/c/${d.author}/${d.id}`);
    }
  for(const f of fs.readdirSync(path.join(ISLES, 'daily'))){ const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f); if(m && m[1] < today) paths.push(`/daily/${m[1]}`); }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map(p => `  <url><loc>${SITE}${p}</loc></url>`).join('\n')}\n</urlset>\n`;
}
const sitemap = () => ({
  name:'klarbase-sitemap',
  configureServer(server){ server.middlewares.use('/sitemap.xml', (_req, res) => { res.setHeader('content-type', 'application/xml'); res.end(sitemapXml()); }); },
  generateBundle(){ this.emitFile({ type:'asset', fileName:'sitemap.xml', source:sitemapXml() }); },
});

export default defineConfig({
  plugins: [sitemap()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },   // dev: same-origin, no CORS
  },
  build: { outDir: 'dist', sourcemap: true, target: 'es2022' },  // top-level await
});
