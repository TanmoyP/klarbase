// Klarbase — the one site footer. Shared by the title screen, the help modal and the legal/guideline pages.
// Internal links carry data-go: main.js's global click handler routes them in-app (no reload).
const GH = 'https://github.com/TanmoyP/klarbase';
export function siteFoot(){
  const go = (p, t) => `<a href="${p}" data-go="${p}">${t}</a>`;
  const ext = (u, t) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`;
  return `<nav class="site-foot" aria-label="About Klarbase">${[
    ext(GH, 'Open source on GitHub'), ext(GH + '/discussions', 'Discussions'),
    go('/guidelines', 'Guidelines'), go('/privacy', 'Privacy'), go('/terms', 'Terms'),
    go('/imprint', 'Imprint'), go('/licenses', 'Licences'),
  ].join('<span aria-hidden="true"> · </span>')}</nav>`;
}
