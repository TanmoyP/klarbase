// Licences & credits. Library licences were read from each package's package.json
// (node_modules, versions as pinned in this release) — re-check when dependencies change.
import { UPDATED, REPO, esc, updatedLine, otherPages } from './shared.js';

export const title = 'Licences';
export const updated = UPDATED;

const BROWSER = [
  ['three', '0.170', 'MIT', 'https://github.com/mrdoob/three.js'],
  ['better-auth (client)', '1.4.22', 'MIT', 'https://github.com/better-auth/better-auth'],
  ['posthog-js (only loaded when analytics is on)', '1.447', 'Apache-2.0 AND MIT', 'https://github.com/PostHog/posthog-js'],
];
const SERVER = [
  ['express', '4.x', 'MIT', 'https://github.com/expressjs/express'],
  ['better-auth', '1.4.22', 'MIT', 'https://github.com/better-auth/better-auth'],
  ['@prisma/client and prisma', '6.x', 'Apache-2.0', 'https://github.com/prisma/prisma'],
  ['express-rate-limit', '7.x', 'MIT', 'https://github.com/express-rate-limit/express-rate-limit'],
];
const list = rows => `<ul>${rows.map(([n, v, l, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a> ${esc(v)} — ${esc(l)}</li>`).join('')}</ul>`;

export const html = () => `
${updatedLine(UPDATED)}
<h3>Klarbase</h3>
<p>The game, its engine, the tools and the isles in the repository are released under the <a href="${esc(REPO)}/blob/main/LICENSE" target="_blank" rel="noopener">MIT License</a>. Isles contributed by players are released under the same licence and credit their makers. Source: <a href="${esc(REPO)}" target="_blank" rel="noopener">github.com/TanmoyP/klarbase</a>.</p>

<h3>Libraries sent to your browser</h3>
${list(BROWSER)}

<h3>Libraries on the server</h3>
${list(SERVER)}
<p>Each of these has its own dependencies, listed with their licences in the repository's lock file.</p>

<h3>Inspiration</h3>
<p>Klarbase was inspired by <i>papertrails</i> by xikhar (MIT licensed). We took ideas and techniques only — no code or assets.</p>

<h3>Art and sound</h3>
<p>All art and audio are generated in code. There are no model, texture, image or audio files.</p>

<h3>Fonts</h3>
<p>Fredoka and Nunito, both under the SIL Open Font License 1.1, are bundled with the game (via the @fontsource packages) and served from klarbase.dev.</p>
${otherPages}`;
