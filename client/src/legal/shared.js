// Shared bits of the legal pages. Everything that is not static text (the operator's
// details come from build-time env vars) is escaped before it becomes HTML.
export const UPDATED = '2026-11-18';
export const REPO = 'https://github.com/TanmoyP/klarbase';
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

const env = import.meta.env;
const clean = v => typeof v === 'string' ? v.trim() : '';
// The operator's details. NEVER hardcoded: they are injected at build time (see .env.example).
export const operator = () => ({
  name: clean(env.VITE_IMPRINT_NAME),
  address: clean(env.VITE_IMPRINT_ADDRESS).replace(/\\n/g, '\n'),   // real newlines or a literal \n both work
  email: clean(env.VITE_IMPRINT_EMAIL),
});
export const operatorConfigured = () => { const o = operator(); return !!(o.name && o.address && o.email); };

const lines = s => esc(s).replace(/\n/g, '<br>');
// Name, address and email as an HTML block, or a clear placeholder in an unconfigured (dev) build.
export function operatorBlock(){
  const o = operator();
  if(!operatorConfigured()) return '<p><b>Imprint not configured for this build.</b> The operator\'s name, address and email are set with the build variables <code>VITE_IMPRINT_NAME</code>, <code>VITE_IMPRINT_ADDRESS</code> and <code>VITE_IMPRINT_EMAIL</code>.</p>';
  return `<p>${lines(o.name)}<br>${lines(o.address)}<br>Email: <a href="mailto:${esc(o.email)}">${esc(o.email)}</a></p>`;
}
export const contactLine = () => { const o = operator(); return operatorConfigured() ? `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : 'the email address in the <a href="/imprint" data-go="/imprint">Imprint</a>'; };

const long = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric', timeZone:'UTC' });
export const updatedLine = d => `<p><i>Last updated ${long(d)}.</i></p>`;
export const authoritative = '<p><i>If a translation of this page ever differs from the English version, the English version is the authoritative one.</i></p>';
export const otherPages = '<p class="legal-links"><a href="/privacy" data-go="/privacy">Privacy</a> · <a href="/terms" data-go="/terms">Terms</a> · <a href="/guidelines" data-go="/guidelines">Guidelines</a> · <a href="/imprint" data-go="/imprint">Imprint</a> · <a href="/licenses" data-go="/licenses">Licences</a></p>';
