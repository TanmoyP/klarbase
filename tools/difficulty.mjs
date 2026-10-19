// Difficulty audit: how much THINKING an isle needs, beyond par. Read-only; prints a table.
//   node tools/difficulty.mjs
// metrics that track "had to think" better than par alone.
//   states   reachable world states
//   dead%    share of reachable states from which the goal can no longer be reached
//   traps    steps on the par route where some legal move leads into a dead state
//   away     par-route moves that INCREASE Pip's distance to the goal (counter-intuitive)
//   greedy   does "always step closer to the goal" (no revisits) win?  ✓ = too obvious
//   routes   number of distinct shortest solutions (1 = one clever answer)
import { CURATED_ISLES, parseIsle, initialState, step, stateKey, MOVES } from '../core/src/index.js';

const xy = (L, i) => [i % L.w, (i / L.w) | 0];
const dist = (L, i) => Math.min(...L.goals.map(g => { const [a, b] = xy(L, i), [c, d] = xy(L, g); return Math.abs(a - c) + Math.abs(b - d); }));

function audit(isle){
  const { level: L } = parseIsle({ schemaVersion:5, ...isle });
  const s0 = initialState(L), k0 = stateKey(s0);
  const node = new Map([[k0, { s:s0, out:[], won:false, d:0 }]]), q = [k0];
  for(let qi = 0; qi < q.length; qi++){
    const k = q[qi], n = node.get(k);
    if(n.won) continue;
    for(const m of MOVES){
      const r = step(L, n.s, m); if(!r.ok) continue;
      const nk = stateKey(r.state);
      if(!node.has(nk)){ node.set(nk, { s:r.state, out:[], won:r.won, d:n.d + 1 }); q.push(nk); }
      n.out.push([m, nk]);
    }
    if(node.size > 400000) return { id:isle.id, capped:true };
  }
  // alive = can still reach a win (reverse reachability)
  const rev = new Map(); for(const [k, n] of node) for(const [, t] of n.out) (rev.get(t) || rev.set(t, []).get(t)).push(k);
  const alive = new Set([...node].filter(([, n]) => n.won).map(([k]) => k)), st = [...alive];
  while(st.length){ for(const p of rev.get(st.pop()) || []) if(!alive.has(p)){ alive.add(p); st.push(p); } }
  // distance-to-win for counting shortest routes
  const toWin = new Map(); { const qq = [...alive].filter(k => node.get(k).won); qq.forEach(k => toWin.set(k, 0));
    for(let i = 0; i < qq.length; i++) for(const p of rev.get(qq[i]) || []) if(!toWin.has(p)){ toWin.set(p, toWin.get(qq[i]) + 1); qq.push(p); } }
  const par = toWin.get(k0), memo = new Map();
  const routes = k => { if(node.get(k).won) return 1; if(memo.has(k)) return memo.get(k); let c = 0;
    for(const [, t] of node.get(k).out) if(toWin.get(t) === toWin.get(k) - 1) c += routes(t); memo.set(k, c); return c; };
  // walk one par route
  let k = k0, traps = 0, away = 0;
  while(!node.get(k).won){
    const n = node.get(k);
    if(n.out.some(([, t]) => !alive.has(t))) traps++;
    const [, t] = n.out.find(([, t]) => toWin.get(t) === toWin.get(k) - 1);
    if(dist(L, node.get(t).s.p) > dist(L, n.s.p)) away++;
    k = t;
  }
  // greedy player
  let g = s0, seen = new Set([k0]), won = false;
  for(let i = 0; i < 300 && !won; i++){
    const opts = MOVES.map(m => step(L, g, m)).filter(r => r.ok && !seen.has(stateKey(r.state)))
      .sort((a, b) => dist(L, a.state.p) - dist(L, b.state.p));
    if(!opts.length) break; g = opts[0].state; seen.add(stateKey(g)); won = opts[0].won;
  }
  const dead = 100 * (node.size - alive.size) / node.size;
  return { id:isle.id, par, states:node.size, dead:dead.toFixed(0) + '%', traps, away, greedy:won ? '✓' : '✗', routes:routes(k0) };
}

const rows = CURATED_ISLES.map(audit);
console.table(rows);
const n = rows.length, avg = f => (rows.reduce((a, r) => a + r[f], 0) / n).toFixed(1);
console.log(`avg par ${avg('par')} · avg states ${avg('states')} · avg traps ${avg('traps')} · avg away ${avg('away')} · greedy wins ${rows.filter(r => r.greedy === '✓').length}/${n}`);
