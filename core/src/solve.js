// @klar/core — solvability. Pure. BFS over the traversal graph.
//
// Turning the camera is free and changes nothing but yaw, so true solvability
// is reachability using every edge whose yawMask is nonzero (`solve`). The
// publish gate accepts a puzzle solvable under that rule. `solveAtYaw` — a
// fixed camera, no turning — exists for diagnostics, tests, and future
// one-yaw challenge modes.
import { nk } from './components.js';
import { buildGraph } from './graph.js';

function endpoints(g, comps){
  let start = null; const goals = new Set();
  for(const c of comps){
    if(c.t!=='spawn' && c.t!=='goal') continue;
    const n = g.nodes.get(c.p[0]+','+(c.p[1]+1)+','+c.p[2]);
    if(!n) continue;
    if(c.t==='spawn') start = nk(n); else goals.add(nk(n));
  }
  return { start, goals };
}

function bfs(g, start, goals, usable){
  if(!start || !goals.size) return { solvable:false, path:[], kinds:[] };
  const prev = new Map([[start, null]]);
  const q = [start];
  while(q.length){
    const k = q.shift();
    if(goals.has(k)){
      const path = [], kinds = [];
      let cur = k;
      while(cur){ path.unshift(cur); const p = prev.get(cur); if(p){ kinds.unshift(p.kind); cur = p.from; } else cur = null; }
      return { solvable:true, path, kinds };
    }
    for(const e of (g.edges.get(k) || [])){
      if(!usable(e)) continue;
      if(prev.has(e.to)) continue;
      prev.set(e.to, { from:k, kind:e.kind });
      q.push(e.to);
    }
  }
  return { solvable:false, path:[], kinds:[] };
}

// Solvable when the player may turn freely: any edge with a nonzero yawMask.
export function solve(comps, allowList){
  const g = buildGraph(comps, allowList || []);
  const { start, goals } = endpoints(g, comps);
  return bfs(g, start, goals, e => (e.yawMask & 15) !== 0);
}

// Solvable at one fixed yaw (camera never turns): geometric edges (mask 15)
// plus illusion seams authored for exactly this yaw.
export function solveAtYaw(comps, allowList, yaw){
  const g = buildGraph(comps, allowList || []);
  const { start, goals } = endpoints(g, comps);
  const bit = 1 << (((yaw%4)+4)%4);
  return bfs(g, start, goals, e => (e.yawMask & bit) !== 0);
}

// Report for the publish gate / tests: one call, all yaw states + free turning.
export function solveReport(comps, allowList){
  return {
    any:   solve(comps, allowList).solvable,
    fixed: [0,1,2,3].map(y => solveAtYaw(comps, allowList, y).solvable),
  };
}
