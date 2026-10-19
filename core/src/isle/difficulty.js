// @klar/core — Difficulty (decision K3, docs/proposals/depth-and-weight.md §4).
// Every isle has a score from 0 to 100 that EVOLVES: it starts from the maker's
// gut call (a declared tier) and real player results take over as plays
// accumulate. Never derived from tile counts or layout — only from what the
// solver can prove about decisions (the audit) and what players actually did.
// Pure and isomorphic: the builder, the cards, the daily pick and the tools
// all call these functions, so they can never disagree.
import { MOVES } from './format.js';
import { initialState, step, stateKey } from './rules.js';

// Tier bands on the score. `id` is what isle files store in `tier`.
export const TIERS = [
  { id:'breeze',   name:'Breeze',   min:0,  max:15 },
  { id:'easy',     name:'Easy',     min:15, max:35 },
  { id:'tricky',   name:'Tricky',   min:35, max:55 },
  { id:'hard',     name:'Hard',     min:55, max:72 },
  { id:'fiendish', name:'Fiendish', min:72, max:88 },
  { id:'mythic',   name:'Mythic',   min:88, max:100 },
];
export const TIER_IDS = TIERS.map(t => t.id);
export const tierById = id => TIERS.find(t => t.id === id) || null;
export const tierOf = score => TIERS.find(t => score < t.max) || TIERS[TIERS.length - 1];
const mid = t => (t.min + t.max) / 2;

export const PRIOR_WEIGHT = 20;     // K: the maker's gut counts like 20 players
export const AUDIT_LIMIT = 200000;  // same budget as the PR gate and the server

/* ---------------- the audit: how much THINKING an isle needs ---------------- */
// Maps every reachable state, then measures decisions rather than size:
//   states  reachable world states            deadPct  % of them that can no longer win
//   traps   steps on a par route where some legal move leads into a dead state
//   away    par-route moves that INCREASE Pip's distance to the goal (counter-intuitive)
//   greedy  does "always step closer to the goal, never revisit" win? (true = too obvious)
//   routes  number of distinct shortest solutions (1 = one clever answer)
// Lean on memory: a node keeps only its key, Pip's tile and its out-edges.
// -> { states, deadPct, traps, away, greedy, routes, par, capped }
export function auditIsle(level, { maxStates = AUDIT_LIMIT } = {}){
  const goals = level.goals.map(g => [g % level.w, (g / level.w) | 0]);
  const dist = i => { const x = i % level.w, z = (i / level.w) | 0; return Math.min(...goals.map(([a, b]) => Math.abs(a - x) + Math.abs(b - z))); };

  const s0 = initialState(level), k0 = stateKey(s0);
  const id = new Map([[k0, 0]]), pos = [s0.p], won = [false], out = [[]], todo = [s0];
  for(let n = 0; n < todo.length; n++){
    const s = todo[n]; todo[n] = null;
    if(won[n]) continue;
    for(const m of MOVES){
      const r = step(level, s, m); if(!r.ok) continue;
      const k = stateKey(r.state);
      let t = id.get(k);
      if(t === undefined){
        if(id.size >= maxStates) return { states:id.size, deadPct:null, traps:null, away:null, greedy:null, routes:null, par:null, capped:true };
        t = id.size; id.set(k, t); pos.push(r.state.p); won.push(r.won); out.push([]); todo.push(r.state);
      }
      out[n].push(t);
    }
  }
  const N = pos.length, rev = Array.from({ length:N }, () => []);
  for(let n = 0; n < N; n++) for(const t of out[n]) rev[t].push(n);
  // distance-to-win by reverse BFS; alive = can still reach a win
  const toWin = new Int32Array(N).fill(-1), q = [];
  for(let n = 0; n < N; n++) if(won[n]){ toWin[n] = 0; q.push(n); }
  for(let i = 0; i < q.length; i++) for(const p of rev[q[i]]) if(toWin[p] < 0){ toWin[p] = toWin[q[i]] + 1; q.push(p); }
  const alive = n => toWin[n] >= 0;
  if(!alive(0)) return { states:N, deadPct:100, traps:0, away:0, greedy:false, routes:0, par:null, capped:false };
  let dead = 0; for(let n = 0; n < N; n++) if(!alive(n)) dead++;

  // number of shortest routes (memoised; can be large, so it saturates)
  const memo = new Map();
  const routes = n => {
    if(won[n]) return 1;
    if(memo.has(n)) return memo.get(n);
    let c = 0; for(const t of out[n]) if(toWin[t] === toWin[n] - 1) c += routes(t);
    c = Math.min(c, 1e9); memo.set(n, c); return c;
  };
  // walk one par route (first shortest move in MOVES order)
  let n = 0, traps = 0, away = 0;
  while(!won[n]){
    if(out[n].some(t => !alive(t))) traps++;
    const t = out[n].find(t => toWin[t] === toWin[n] - 1);
    if(dist(pos[t]) > dist(pos[n])) away++;
    n = t;
  }
  // the greedy player: always the unvisited move that ends closest to a goal
  let g = s0, gk = k0, seen = new Set([k0]), greedy = false;
  for(let i = 0; i < 300 && !greedy; i++){
    let best = null;
    for(const m of MOVES){
      const r = step(level, g, m); if(!r.ok) continue;
      const k = stateKey(r.state); if(seen.has(k)) continue;
      if(!best || dist(r.state.p) < dist(best.r.state.p)) best = { r, k };
    }
    if(!best) break;
    g = best.r.state; gk = best.k; seen.add(gk); greedy = best.r.won;
  }
  return { states:N, deadPct:Math.round(100 * dead / N), traps, away, greedy, routes:routes(0), par:toWin[0], capped:false };
}

/* ---------------- the provisional prior (§4.2 audit table) ---------------- */
// Used only when the maker declared no tier. An isle earns the HIGHEST tier
// whose bar it clears; within that band it sits by reachable states (log scale).
//   tier       states   traps  greedy  routes
//   Breeze     —        —      may     any     (also: anything greedy play solves)
//   Easy       ≥ 50     —      fails   any
//   Tricky     ≥ 300    ≥ 2    fails   ≤ 6
//   Hard       ≥ 3k     ≥ 3    fails   ≤ 4
//   Fiendish   ≥ 30k    ≥ 4    fails   ≤ 2
//   Mythic     > 150k or ≥ 6 traps, greedy fails, exactly 1 route — and, for the traps
//              path, at least the Fiendish 30k states: `traps` counts every step with ONE
//              losing move, so crate isles rack up 6+ traps at a few thousand states.
// An audit that hit its state cap is "too big to map" → Fiendish midpoint.
const BARS = [
  { id:'easy',     lo:50,    hi:300,    traps:0, routes:Infinity },
  { id:'tricky',   lo:300,   hi:3000,   traps:2, routes:6 },
  { id:'hard',     lo:3000,  hi:30000,  traps:3, routes:4 },
  { id:'fiendish', lo:30000, hi:150000, traps:4, routes:2 },
];
export function provisionalTier(audit){
  if(!audit) return tierById('easy');
  if(audit.capped) return tierById('fiendish');
  if(audit.greedy || audit.par == null) return tierById('breeze');
  if((audit.states > 150000 || (audit.traps >= 6 && audit.states >= 30000)) && audit.routes === 1) return tierById('mythic');
  let got = 'breeze';
  for(const b of BARS) if(audit.states >= b.lo && audit.traps >= b.traps && audit.routes <= b.routes) got = b.id;
  return tierById(got);
}
export function provisionalPrior(audit){
  const t = provisionalTier(audit);
  if(!audit || audit.capped || t.id === 'mythic') return mid(t);
  const b = BARS.find(x => x.id === t.id) || { lo:1, hi:50 };
  const f = Math.max(0, Math.min(1, Math.log(Math.max(audit.states, b.lo) / b.lo) / Math.log(b.hi / b.lo)));
  return Math.round((t.min + f * (t.max - t.min - 1)) * 10) / 10;
}

/* ---------------- what players did (K7 anonymous stats) ---------------- */
// Time-to-clear histogram buckets (upper bounds, seconds); the last is open.
export const TIME_BUCKETS = [15, 30, 60, 120, 300, 600, 1200, 1800, 3600, Infinity];
export const timeBucket = ms => TIME_BUCKETS.findIndex(b => ms / 1000 <= b);
export const MOVES_CAP = 500;       // move histogram keys are clamped to 1..500
const BUCKET_SECONDS = [10, 22, 45, 90, 210, 450, 900, 1500, 2700, 5400];   // a typical time in each bucket

function histMedian(h, value = Number){
  const entries = Object.entries(h || {}).map(([k, c]) => [value(k), +c || 0]).filter(([v, c]) => c > 0 && Number.isFinite(v)).sort((a, b) => a[0] - b[0]);
  const total = entries.reduce((s, [, c]) => s + c, 0);
  if(!total) return null;
  let acc = 0; for(const [v, c] of entries){ acc += c; if(acc >= total / 2) return v; }
  return entries[entries.length - 1][0];
}
const clamp01 = x => Math.max(0, Math.min(1, x));

// stats: { started, cleared, hints, restarts, moves:{ "<moves>":count }, time:{ "<bucket>":count }, par }
// Each signal becomes a 0..1 "hardness"; every one is monotonic (worse results → harder):
//   not cleared   1 − clear rate                                weight .35
//   time          median time to clear, log-scaled 15 s → 30 min  weight .20
//   moves         median moves over par: par → 0, 3× par → 1     weight .20
//   hints         hints per attempt, 0 → 0, 3 → 1                weight .15
//   restarts      restarts per attempt, 0 → 0, 3 → 1             weight .10
// With no clears at all, time and moves count as fully hard (nobody got there).
// -> 0..100, or null when there are no attempts
export function observedScore(stats){
  const n = stats && +stats.started || 0;
  if(n <= 0) return null;
  const cleared = Math.min(+stats.cleared || 0, n);
  const notCleared = 1 - cleared / n;
  const hints = clamp01((+stats.hints || 0) / n / 3);
  const restarts = clamp01((+stats.restarts || 0) / n / 3);
  let moves = 1, time = 1;
  const mm = histMedian(stats.moves);
  if(cleared && mm != null) moves = stats.par > 0 ? clamp01((mm / stats.par - 1) / 2) : 0;
  const tb = histMedian(stats.time, k => BUCKET_SECONDS[+k]);
  if(cleared && tb != null) time = clamp01(Math.log(tb / 15) / Math.log(1800 / 15));
  const score = 100 * (0.35 * notCleared + 0.20 * time + 0.20 * moves + 0.15 * hints + 0.10 * restarts);
  return Math.round(score * 10) / 10;
}

/* ---------------- the score ---------------- */
// score = (K·prior + n·observed) / (K + n), K = 20, n = attempts.
// prior = midpoint of the declared tier (the maker's gut call), else the
// provisional prior from the audit, else Easy (where most isles live).
// -> { score, tier, n, settling, prior, declared }
export function difficultyScore({ tier = null, audit = null, stats = null } = {}){
  const declared = tierById(tier);
  const prior = declared ? mid(declared) : audit ? provisionalPrior(audit) : mid(tierById('easy'));
  const obs = observedScore(stats), n = obs == null ? 0 : +stats.started;
  const raw = n ? (PRIOR_WEIGHT * prior + n * obs) / (PRIOR_WEIGHT + n) : prior;
  const score = Math.round(Math.max(0, Math.min(100, raw)));
  return { score, tier:tierOf(score), n, settling:n < PRIOR_WEIGHT, prior, declared:!!declared };
}

/* ---------------- builder guidance (K2: a catch is optional) ---------------- */
// Friendly "make it harder" nudges read off the audit. Never required.
export function harderHints(audit){
  if(!audit || audit.capped || audit.par == null) return [];
  const out = [];
  if(audit.greedy) out.push('Walking straight toward the star wins — block the direct line so the way round is the way in.');
  if(audit.traps === 0) out.push('No move can go wrong — put a crate near water or a ledge, where one careless push ruins the run.');
  else if(audit.traps < 3) out.push(`Only ${audit.traps} risky step${audit.traps > 1 ? 's' : ''} on the best route — add another place where the order matters.`);
  if(audit.routes > 2) out.push(`${audit.routes > 999 ? 'Many' : audit.routes} shortest routes — narrow it to one, so there's a single clever answer.`);
  if(audit.away === 0 && !audit.greedy) out.push('The best route never steps away from the star — make the solution start by going the "wrong" way.');
  if(audit.states < 300) out.push('Few positions to explore — a second crate or a lever multiplies the possibilities.');
  return out;
}

// Non-blocking warning when the gut call and the audit disagree by 2+ tiers.
export function gutMismatch(tier, audit){
  const d = tierById(tier); if(!d || !audit) return null;
  const a = provisionalTier(audit), gap = TIER_IDS.indexOf(d.id) - TIER_IDS.indexOf(a.id);
  if(gap >= 2) return `You called it ${d.name}, but the audit reads ${a.name}${audit.greedy ? ' — walking toward the star wins' : ''}. Players will settle it either way.`;
  if(gap <= -2) return `You called it ${d.name}, but the audit reads ${a.name}. Players will settle it either way.`;
  return null;
}
