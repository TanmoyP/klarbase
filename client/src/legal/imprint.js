// Imprint (Impressum) — Angaben gemäß § 5 DDG. The operator's details come from build-time
// env vars (VITE_IMPRINT_*) and are never hardcoded in the repository.
import { UPDATED, operatorBlock, operatorConfigured, operator, esc, updatedLine, otherPages } from './shared.js';

export const title = 'Imprint';
export const updated = UPDATED;

export const html = () => {
  const o = operator();
  return `
${updatedLine(UPDATED)}
<h3>Information pursuant to § 5 DDG (Impressum)</h3>
${operatorBlock()}
<h3>Contact</h3>
${operatorConfigured() ? `<p>Email: <a href="mailto:${esc(o.email)}">${esc(o.email)}</a></p>` : '<p>Not configured for this build.</p>'}
<h3>Responsible for content (§ 18 Abs. 2 MStV)</h3>
${operatorConfigured() ? `<p>${esc(o.name)}, address as above.</p>` : '<p>Not configured for this build.</p>'}
<h3>Disclaimer</h3>
<p>Klarbase is a free, non-commercial hobby project. Isles and comments created by players are their authors' own content. If you find something unlawful, please report it with the report button or by email and we will look at it promptly.</p>
${otherPages}`;
};
