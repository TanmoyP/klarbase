// Terms of Use. Not legal advice; keep consistent with LICENSE / CONTRIBUTING.md and the privacy page.
import { UPDATED, REPO, esc, contactLine, updatedLine, authoritative, otherPages } from './shared.js';

export const title = 'Terms of Use';
export const updated = UPDATED;

export const html = () => `
${updatedLine(UPDATED)}
<p>These terms apply when you use Klarbase at klarbase.dev. Playing and building need no account; some features (sharing isles, comments, cloud progress) need you to sign in. By using Klarbase you agree to these terms.</p>

<h3>1. A free hobby project</h3>
<p>Klarbase is a free, open-source hobby project run by one person, provided <b>as is</b>. There is no guarantee that it is always available, free of errors, or that your data will be kept forever. Features may change or be removed. Back up isles you care about with <i>Export</i> in the builder.</p>

<h3>2. Your isles</h3>
<p>The source code and the isles in the repository are released under the <a href="${esc(REPO)}/blob/main/LICENSE" target="_blank" rel="noopener">MIT License</a>. When you share an isle online, or propose one on GitHub, you publish it under the same MIT licence, and the game shows your name as its maker. Only share isles you made yourself or have the right to share. A shared isle is identified by its content: identical isles are stored once.</p>

<h3>3. Your comments</h3>
<p>You keep the rights to what you write. By posting a comment you give Klarbase a free, worldwide, non-exclusive licence to store it and display it to other players on the isle it belongs to, together with your name and profile picture, for as long as it stays up. You can delete your account at any time (see the <a href="/privacy" data-go="/privacy">Privacy</a> page), which removes your comments.</p>

<h3>4. Conduct</h3>
<p>Be kind and play fair. The <a href="/guidelines" data-go="/guidelines">Community Guidelines</a> are part of these terms. Do not attack the service, try to bypass the publish checks, scrape it at a rate that harms it, or use it for anything unlawful.</p>

<h3>5. Moderation</h3>
<p>Signed-in players can report isles and comments. Content that three different people have reported is hidden automatically. The maintainer may also remove content, or limit or close an account, when it breaks these terms or the Guidelines, or the law — with notice where that is practical. Written reports and appeals go to ${contactLine()}.</p>

<h3>6. Availability and changes</h3>
<p>We may change, pause or end Klarbase, or these terms, at any time. If we change the terms in a way that matters, we will update the date at the top of this page; continued use after that means you accept the new version.</p>

<h3>7. Liability</h3>
<p>We are liable without limit for intent and gross negligence, for injury to life, body or health, and where mandatory law requires (for example under the Product Liability Act). For slightly negligent breaches of an essential contractual duty — one whose fulfilment makes the service possible at all — our liability is limited to the damage typical and foreseeable for a free service. Otherwise we are not liable for slightly negligent breaches. This does not limit your statutory rights.</p>

<h3>8. Law and contact</h3>
<p>German law applies, excluding rules that would take away protections you have as a consumer under the law of the country where you live; those protections stay unaffected, as do any mandatory places of jurisdiction. Questions about these terms: ${contactLine()} — see the <a href="/imprint" data-go="/imprint">Imprint</a>.</p>
${authoritative}
${otherPages}`;
