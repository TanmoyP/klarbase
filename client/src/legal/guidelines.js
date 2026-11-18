// Community Guidelines — the rules for comments and shared isles.
import { UPDATED, contactLine, updatedLine, otherPages } from './shared.js';

export const title = 'Community Guidelines';
export const updated = UPDATED;

export const html = () => `
${updatedLine(UPDATED)}
<p>Klarbase is a cozy place. These few rules keep it that way. They apply to comments, isle names and anything else you share. They are part of the <a href="/terms" data-go="/terms">Terms of Use</a>.</p>

<h3>Be kind</h3>
<p>Say what you liked, or what could be clearer. No insults, harassment, hate or threats — about people or groups. Disagree about a puzzle, never about a person.</p>

<h3>Don't give away routes</h3>
<p>A solution is something a player earns. Comments must not contain routes, move strings, step-by-step walkthroughs or spoilers of the solution. The game checks for this and refuses such comments; trying to sneak one past it counts as breaking the rule. Hints like "look at the plate again" are fine.</p>

<h3>No links, spam or ads</h3>
<p>No links, promotion, referral codes, repeated or copy-pasted messages, or off-topic posts.</p>

<h3>Keep personal data out</h3>
<p>Don't post other people's personal information (names, addresses, emails, accounts, photos), and don't share your own more than you want to — comments are public and show your name and picture.</p>

<h3>Report, don't retaliate</h3>
<p>If something breaks these rules, use the report button and move on. Three reports from different people hide an item automatically, and the maintainer looks at them. Don't answer in kind, and don't report in bad faith.</p>

<h3>Consequences</h3>
<p>Depending on how serious or repeated it is: content is hidden or removed, commenting or sharing is limited, or the account is closed. If you think a decision was wrong, write to ${contactLine()}.</p>
${otherPages}`;
