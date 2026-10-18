// @klar/core — Isle solver. Breadth-first search over the full world state
// (player, crates, filled water, keys, doors, bridge flip), so the first
// solution found is the SHORTEST one. That move string is the isle's "smart
// solution", its length is PAR, and the client replays it on demand.
import { MOVES } from './format.js';
import { initialState, step, stateKey } from './rules.js';

export const SOLVE_LIMIT = 300000;   // states explored before giving up

// -> { solvable, solution, par, explored, capped }
export function solveIsle(level, opts){ return solveFrom(level, initialState(level), opts); }

// Shortest finish from ANY state — powers in-game hints ("your best next move
// from where you stand") and tells a stuck player the honest truth.
export function solveFrom(level, s0, { maxStates = SOLVE_LIMIT } = {}){
  const k0 = stateKey(s0);
  const prev = new Map([[k0, null]]);
  let frontier = [s0], keys = [k0], explored = 0;
  while(frontier.length){
    const next = [], nextKeys = [];
    for(let n = 0; n < frontier.length; n++){
      const s = frontier[n], k = keys[n];
      for(const m of MOVES){
        const r = step(level, s, m);
        if(!r.ok) continue;
        const nk = stateKey(r.state);
        if(prev.has(nk)) continue;
        prev.set(nk, [k, m]);
        if(r.won){
          let path = '', cur = nk;
          while(prev.get(cur)){ const [pk, mv] = prev.get(cur); path = mv + path; cur = pk; }
          return { solvable:true, solution:path, par:path.length, explored, capped:false };
        }
        next.push(r.state); nextKeys.push(nk);
        if(++explored >= maxStates) return { solvable:false, solution:'', par:0, explored, capped:true };
      }
    }
    frontier = next; keys = nextKeys;
  }
  return { solvable:false, solution:'', par:0, explored, capped:false };
}

// Stars for a finished run: par -> 3, within 50% over par -> 2, else 1.
export function starsFor(moves, par){
  if(!par) return 1;
  return moves <= par ? 3 : moves <= Math.ceil(par * 1.5) ? 2 : 1;
}
