// @klar/core — edge ports: the contract between neighbouring plots (Phase 3).
//
// A port is a promise that an avatar standing on a boundary walk node could
// step outward, flat, into the neighbouring plot — IF that neighbour presents
// a node at the same level on its own matching boundary. Compatibility on a
// shared edge is therefore EXACT EQUALITY of port sets, checked independently
// on both sides:
//   - A has a port B lacks  -> the avatar walks off into nothing. Broken.
//   - B has a port A lacks  -> a doorway into a wall. Equally broken.
//   - both empty            -> compatible (the common case).
// Only flat stepping crosses plots: half-steps and stairs never form ports,
// and illusion seams NEVER cross plots — a seam must survive its neighbour
// being unloaded by streaming, so it is plot-local by construction (§3, §13).
import { PLOT } from './components.js';
import { buildGraph } from './graph.js';

export const EDGES = ['n','e','s','w'];   // n = z=0 face, e = x=max, s = z=max, w = x=0
export const OPPOSITE = { n:'s', e:'w', s:'n', w:'e' };

// comps -> { n:[{off,lvl}], e:[...], s:[...], w:[...] }  (sorted, deduped)
// off = cell coordinate along the edge (z for e/w, x for n/s); lvl = h2.
export function computePorts(comps){
  const g = buildGraph(comps, []);
  const [SX,,SZ] = PLOT.size;
  const out = { n:new Map(), e:new Map(), s:new Map(), w:new Map() };
  for(const n of g.nodes.values()){
    const put = (edge, off) => out[edge].set(off+'|'+n.h2, { off, lvl:n.h2 });
    if(n.z === 0)    put('n', n.x);
    if(n.z === SZ-1) put('s', n.x);
    if(n.x === 0)    put('w', n.z);
    if(n.x === SX-1) put('e', n.z);
  }
  const sort = m => [...m.values()].sort((a,b) => a.off-b.off || a.lvl-b.lvl);
  return { n:sort(out.n), e:sort(out.e), s:sort(out.s), w:sort(out.w) };
}

// Shared-edge check. mine/theirs are computePorts() results; edge is MY edge
// facing the neighbour. Returns { ok, reason } — reason is player-readable.
export function portsMatch(mine, theirs, edge){
  const a = mine[edge], b = theirs[OPPOSITE[edge]];
  const ka = new Set(a.map(p => p.off+'|'+p.lvl));
  const kb = new Set(b.map(p => p.off+'|'+p.lvl));
  for(const p of a) if(!kb.has(p.off+'|'+p.lvl))
    return { ok:false, reason:`your ${edge} edge has a walkway at cell ${p.off}, level ${p.lvl/2} — the neighbour has no matching walkway there` };
  for(const p of b) if(!ka.has(p.off+'|'+p.lvl))
    return { ok:false, reason:`the neighbour's ${OPPOSITE[edge]} edge has a walkway at cell ${p.off}, level ${p.lvl/2} — your puzzle has no matching walkway there` };
  return { ok:true };
}
