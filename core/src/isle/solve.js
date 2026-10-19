// @klar/core — Isle solver. Breadth-first search over the full world state
// (player, crates, filled water, keys, doors, bridge flip), so the first
// solution found is the SHORTEST one. That move string is the isle's "smart
// solution", its length is PAR, and the client replays it on demand.
import { MOVES } from './format.js';
import { initialState, step, stateKey, seedsTouched } from './rules.js';

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

// Seed par (Phase 3): the shortest route that reaches a goal having stood on
// every seed. Seeds are not rule state, so the search carries them as a bitmask
// beside the state; reaching a goal early ends that branch (the run is over).
// -> { solvable, solution, par, explored, capped } | null when the isle has no seeds
export function solveSeeds(level, { maxStates = SOLVE_LIMIT } = {}){
  const n = level.seeds ? level.seeds.length : 0;
  if(!n) return null;
  const all = (1 << n) - 1, s0 = initialState(level), k0 = stateKey(s0) + '#0';
  const prev = new Map([[k0, null]]);
  let frontier = [[s0, 0, k0]], explored = 0;
  while(frontier.length){
    const next = [];
    for(const [s, mask, k] of frontier) for(const m of MOVES){
      const r = step(level, s, m);
      if(!r.ok) continue;
      let mk = mask; for(const i of seedsTouched(level, r)) mk |= 1 << level.seeds.indexOf(i);
      const nk = stateKey(r.state) + '#' + mk;
      if(prev.has(nk)) continue;
      prev.set(nk, [k, m]);
      if(r.won){
        if(mk !== all) continue;
        let path = '', cur = nk;
        while(prev.get(cur)){ const [pk, mv] = prev.get(cur); path = mv + path; cur = pk; }
        return { solvable:true, solution:path, par:path.length, explored, capped:false };
      }
      next.push([r.state, mk, nk]);
      if(++explored >= maxStates) return { solvable:false, solution:'', par:0, explored, capped:true };
    }
    frontier = next;
  }
  return { solvable:false, solution:'', par:0, explored, capped:false };
}

// Stars for a finished run: par -> 3, within 50% over par -> 2, else 1.
export function starsFor(moves, par){
  if(!par) return 1;
  return moves <= par ? 3 : moves <= Math.ceil(par * 1.5) ? 2 : 1;
}
