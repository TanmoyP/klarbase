// Difficulty audit: how much THINKING an isle needs, beyond par. Read-only; prints a table.
//   node tools/difficulty.mjs
// The metrics come from auditIsle() in @klar/core (core/src/isle/difficulty.js):
//   states   reachable world states
//   dead%    share of reachable states from which the goal can no longer be reached
//   traps    steps on the par route where some legal move leads into a dead state
//   away     par-route moves that INCREASE Pip's distance to the goal (counter-intuitive)
//   greedy   does "always step closer to the goal" (no revisits) win?  ✓ = too obvious
//   routes   number of distinct shortest solutions (1 = one clever answer)
//   gut      the declared tier (the maker's gut call) · audit = the provisional tier
import { CURATED_ISLES, parseIsle, auditIsle, provisionalTier, tierById } from '../core/src/index.js';

const rows = CURATED_ISLES.map(isle => {
  const { level } = parseIsle({ schemaVersion:5, ...isle });
  const a = auditIsle(level);
  if(a.capped) return { id:isle.id, capped:true };
  return { id:isle.id, par:a.par, states:a.states, dead:a.deadPct + '%', traps:a.traps, away:a.away,
           greedy:a.greedy ? '✓' : '✗', routes:a.routes, gut:tierById(isle.tier)?.name || '—',
           audit:provisionalTier(a).name, twist:isle.twist ? '★' : '' };
});
console.table(rows);
const n = rows.length, avg = f => (rows.reduce((a, r) => a + r[f], 0) / n).toFixed(1);
console.log(`avg par ${avg('par')} · avg states ${avg('states')} · avg traps ${avg('traps')} · avg away ${avg('away')} · greedy wins ${rows.filter(r => r.greedy === '✓').length}/${n}`);
