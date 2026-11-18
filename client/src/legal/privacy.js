// Privacy policy (GDPR Art. 13). Keep in sync with ENGINEERING.md §8 "What is stored, per person"
// and with what the code really stores. Not legal advice.
import { EVENTS, analyticsState, setAnalyticsEnabled } from '../analytics.js';
import { UPDATED, REPO, esc, operatorBlock, contactLine, updatedLine, authoritative, otherPages } from './shared.js';

export const title = 'Privacy';
export const updated = UPDATED;

const eventsHtml = () => `<ul>${EVENTS.map(e => `<li><code>${esc(e.name)}</code>${e.props.length ? ` <small>(${e.props.map(esc).join(', ')})</small>` : ''} — ${esc(e.description)}</li>`).join('')}</ul>`;

export const html = () => `
${updatedLine(UPDATED)}
<p>Klarbase is a small open-source game made by one person. It collects as little as it can, sells nothing and shows no ads. This page explains what is stored, why, who handles it and what rights you have. It is written in plain language; the headings follow what the GDPR (Art. 13) asks us to tell you.</p>

<h3>1. Who is responsible</h3>
${operatorBlock()}
<p>This is the controller within the meaning of the GDPR. You can reach us at ${contactLine()}. There is no data protection officer; none is required for a project of this size.</p>

<h3>2. What we process, why, and on what legal basis</h3>

<p><b>Playing without an account</b> (legal basis: legitimate interest, Art. 6(1)(f) — we need to know how hard each isle is to balance the game).</p>
<ul>
  <li><b>On your device only:</b> your progress (stars, best moves and times), settings, the isle you are building, Daily stars and the GitHub name you type for exports are kept in your browser's local storage. They never leave your device.</li>
  <li><b>Anonymous per-isle totals:</b> when you start, clear, restart or ask for a hint on an isle, the game sends a small event (with your moves and a rough time bucket for a clear). The server only adds it to running totals for that isle. It is sent without cookies, carries no account, device ID or IP address, and cannot be traced back to you.</li>
</ul>

<p><b>Your account</b> (legal basis: performing the service you asked for, Art. 6(1)(b); security of sessions: Art. 6(1)(f)). An account is only needed to share isles, comment and keep your progress in the cloud. When you sign in with GitHub or Google we receive and keep:</p>
<ul>
  <li>your <b>name, email address and profile picture</b> from that account, the link to it and the sign-in tokens it hands us;</li>
  <li>a <b>session</b>: a random token (kept in your sign-in cookie), when it expires, and the <b>IP address and browser (user agent)</b> it was started from — used to keep accounts secure. Signing out ends the session;</li>
  <li><b>isles you share online</b> — public, with your name as the maker;</li>
  <li><b>comments</b> you post on isles — public, shown with your <b>name and profile picture</b>;</li>
  <li><b>reports</b> you file on isles or comments, kept with your account so one person cannot report the same thing repeatedly;</li>
  <li><b>cloud progress</b> — your stars, best results, Daily results and which parts of the map you have explored, so they follow you between devices.</li>
</ul>

<p><b>Feedback</b> (Art. 6(1)(a) — you choose to send it). We store your message, the page you sent it from, the reply email if you give one, and your account if you are signed in. No IP address is stored with it.</p>

<p><b>Usage analytics</b> (legal basis: legitimate interest, Art. 6(1)(f) — to see which parts of the game are used and where players get stuck, so we can improve it). This is <b>off</b> if your browser sends a Do Not Track or Global Privacy Control signal, and you can switch it off below at any time.</p>
<ul>
  <li>We use PostHog, hosted in the EU (Frankfurt). Events travel through our own server (<code>/ingest</code>), which <b>removes your IP address, cookies and any sign-in information</b> before forwarding them, so PostHog never sees your IP address.</li>
  <li>Nothing is stored on your device for this: no cookie, no local storage. The identifier lives in memory and disappears when you close or reload the page, so separate visits cannot be linked to each other. If you are signed in, events are linked to your <b>opaque account ID</b> (a random string — never your name or email).</li>
  <li>No autocapture, no session recordings, no heatmaps, no surveys, no feature flags. Only these events are ever sent, with only the properties shown:</li>
</ul>
${eventsHtml()}
<div class="legal-toggle" id="analyticsBox" style="margin:10px 0 4px"></div>

<p><b>Abuse protection</b> (Art. 6(1)(f)). To stop one address from flooding the server, it remembers IP addresses in memory for up to an hour to limit how often one address can send requests. They are never written to disk or the database.</p>

<p><b>Page views and delivery</b> (Art. 6(1)(f)). All traffic passes through Cloudflare, which processes your IP address to deliver the site and protect it. We use Cloudflare Web Analytics, which sets no cookies and does not track you across sites. Our host (Railway) also handles connection data such as IP addresses in its technical logs.</p>


<h3>3. Who receives your data</h3>
<p>These providers process data on our behalf, or — for sign-in — under their own responsibility:</p>
<ul>
  <li><b>Railway</b> — runs the game and API (servers in the United States).</li>
  <li><b>Neon</b> — hosts the database (Europe, Frankfurt, as configured in our setup notes).</li>
  <li><b>Cloudflare</b> — delivery, security and cookieless page-view statistics (global network).</li>
  <li><b>PostHog</b> — usage analytics, EU cloud (Frankfurt), via our proxy without your IP address.</li>
  <li><b>Google</b> — only if you choose to sign in with it. (The game's fonts are served from klarbase.dev itself, not from Google.) <b>GitHub</b> — only if you choose to sign in with it. They tell us who you are; their own privacy policies apply to what they do. If you open a pull request through the "propose on GitHub" button, that happens on GitHub under your own GitHub account.</li>
</ul>
<p>Your comments, isles and names are also visible to everyone who opens them. We do not sell data and do not use it for advertising.</p>

<h3>4. Transfers outside the EU/EEA</h3>
<p>Railway, Cloudflare, GitHub and Google may process data in the United States. Where that happens we rely on an adequacy decision (the EU-US Data Privacy Framework, where the provider is certified) or on the EU Standard Contractual Clauses (Art. 44 ff. GDPR). Analytics and the database stay in the EU.</p>

<h3>5. How long we keep it</h3>
<ul>
  <li><b>Local storage:</b> until you clear it in your browser.</li>
  <li><b>Anonymous isle totals:</b> kept as running sums; they contain no personal data.</li>
  <li><b>Account data</b> (profile, shared isles, comments, reports, cloud progress): until you delete your account.</li>
  <li><b>Sessions:</b> expire after 7 days of not using the game (and are renewed while you keep playing); signing out ends them at once.</li>
  <li><b>Feedback:</b> until it has been handled, then deleted; with your account if you ask for deletion.</li>
  <li><b>Analytics events:</b> kept for no longer than needed and at most 12 months; the maintainer sets this retention in PostHog.</li>
  <li><b>Rate-limit IP addresses:</b> in memory for at most an hour.</li>
</ul>

<h3>6. Cookies and storage — why there is no banner</h3>
<p>Klarbase sets <b>only strictly necessary</b> cookies: the sign-in session cookie, and a short-lived technical cookie while the GitHub/Google sign-in redirect is in progress. Your browser's local storage holds your own game (progress, settings, current draft, Daily stars, effort counters that unlock solutions, the guide-seen flag, the GitHub name you typed) and your analytics choice (<code>klarbase.v2.analytics</code>). While you sign in, the browser's session storage briefly holds the name of the provider you picked so we can count the sign-in; it is removed immediately afterwards. Because this is needed for what you asked the game to do — or stores nothing at all, as with analytics — no consent is required under § 25(2) TDDDG, so there is no cookie banner.</p>

<h3>7. Your rights</h3>
<p>Under Articles 15–21 GDPR you have the right to: <b>access</b> your data, have it <b>corrected</b>, have it <b>erased</b>, <b>restrict</b> its processing, receive it in a portable format (<b>data portability</b>), and <b>object</b> to processing based on legitimate interests (Art. 21) — for example to analytics, which you can also simply switch off below. Where we rely on your consent (feedback), you can withdraw it at any time with effect for the future. Write to ${contactLine()}; we reply within one month.</p>
<p>You also have the right to <b>complain to a supervisory authority</b>, for example in the EU country where you live or work, or the data protection authority of the German state where the operator is based.</p>

<h3>8. Getting your data deleted</h3>
<p>To delete your account, sign in and send feedback asking for it — that tells us the request really comes from you. Deleting an account removes your profile, sign-in links, sessions, shared isles, comments, reports, cloud progress and feedback. For feedback sent without signing in, tell us the reply email you used. You can also <a href="${esc(REPO)}/issues" target="_blank" rel="noopener">open an issue on GitHub</a> or write to ${contactLine()}. Anonymous isle totals contain no personal data and stay.</p>
<div class="row-btns" style="margin-top:14px"><button class="btn primary feedback-open">Send feedback</button></div>

<h3>9. Children</h3>
<p>You can play and build without an account at any age — nothing personal is collected. Signing in is meant for people aged <b>16 or over</b>. If you are younger, please ask a parent or guardian, and do not sign in on your own.</p>

<h3>10. Automated decisions</h3>
<p>There is no automated decision-making or profiling that affects you. The one automatic rule is that shared content is hidden once three different people have reported it; it concerns the content, not a profile of you, and the maintainer reviews reports.</p>

<h3>11. Changes</h3>
<p>If what we do changes, we update this page and its date. The version on this page is the current one.</p>
${authoritative}
${otherPages}`;

// Wire the analytics switch: shows the real state and flips it live.
export function mount(root){
  const box = root.querySelector('#analyticsBox'); if(!box) return;
  const say = { on:'Analytics is <b>on</b>.', off:'Analytics is <b>off</b> — nothing is sent.', dnt:'Analytics is <b>off</b> because your browser sends a Do Not Track / Global Privacy Control signal.', unconfigured:'Analytics is <b>not enabled</b> in this version of Klarbase — nothing is sent.' };
  const draw = () => {
    const s = analyticsState();
    box.innerHTML = `<p style="margin:0 0 6px">${say[s]}</p>${s === 'on' || s === 'off' ? `<button class="btn small">${s === 'on' ? 'Turn analytics off' : 'Turn analytics on'}</button>` : ''}`;
    const b = box.querySelector('button'); if(b) b.onclick = () => { setAnalyticsEnabled(s === 'off'); draw(); };
  };
  draw();
}
