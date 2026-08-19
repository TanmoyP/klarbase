// @klar/core — traversal graph: projection, geometric edges, illusion seams. Pure.
// Ported byte-faithfully from prototypes/phase1.html (Phase 1 v4, spec v4.5).

import { ck, nk, DIRS, TYPES, PLOT, buildOccupancy } from './components.js';

/* ==================== MODULE: TraversalGraph — projection & edge building == */
// rotate (x,z) by -yaw*90 so the yaw-0 formula applies
export function rot(x,z,yaw){
  switch(((yaw%4)+4)%4){
    case 0: return [ x,  z];
    case 1: return [-z,  x];
    case 2: return [-x, -z];
    default:return [ z, -x];
  }
}
export function screenKey(n, yaw){
  const [x,z] = rot(n.x, n.z, yaw);
  return (n.h2 - x - z) * 65536 + (x - z);   // integer pair packed
}

// order-independent identity for an authored seam
export function seamKey(a,b,yaw){ return (a<b ? a+'|'+b : b+'|'+a) + '|' + yaw; }

export function buildGraph(comps, allowList){
  allowList = allowList || [];
  const solid = buildOccupancy(comps);
  const nodes = new Map();

  // One walk node per component top, if there is headroom.
  // BUGFIX: the clear cell is the cell containing the avatar's HEAD, which is
  // ceil(h2/2) — for a block that is the node's own cell, but for a slab the
  // node sits inside the slab's own cell, so the old check rejected every slab
  // and slabs silently had no walk surface at all.
  for(const c of comps){
    const n = TYPES[c.t].node(c);
    if(!n) continue;
    const clearY = Math.ceil(n.h2/2);
    if(solid.has(ck(n.x, clearY, n.z))) continue;
    if(clearY >= PLOT.size[1]) continue;
    n.comp = c;
    nodes.set(nk(n), n);
  }

  const edges = new Map();                              // nodeKey -> [{to, kind, yawMask}]
  const add = (a,b,kind,mask) => {
    if(!edges.has(a)) edges.set(a,[]);
    edges.get(a).push({to:b, kind, yawMask:mask});
  };

  // --- geometric: flat steps and half-steps ---
  // Equal height is a flat step. A half-cell difference (|dh2| === 1) is a
  // half-step, which only ever occurs between a block level and a slab level.
  // See the note on slabs: without this, slabs are unreachable and therefore
  // useless, because block nodes and slab nodes live in disjoint parity classes.
  for(const [k,n] of nodes){
    if(n.comp && n.comp.t==='stairs') continue;        // v4.4: a stair top is not a walk surface
    for(const [dx,,dz] of DIRS){
      for(const dy of [-1,0,1]){
        const m = nodes.get(ck(n.x+dx, n.y+dy, n.z+dz));
        if(!m) continue;
        if(m.comp && m.comp.t==='stairs') continue;    // v4.4: nothing attaches to a stair's flank
        const d = Math.abs(m.h2 - n.h2);
        if(d === 0){ add(k, nk(m), 'flat', 15); }
        else if(d === 1){ add(k, nk(m), 'half', 15); }
      }
    }
  }

  // --- geometric: stairs (one horizontal cell + one full level, on-axis only) ---
  // A stair at cell P facing d has exactly two sockets:
  //   bottom: the node at P-d, exactly one level below the stair top. This may
  //           be any walk node — including the previous stair's top, which is
  //           how flights chain.
  //   top:    the node at P+d, exactly level with the stair top.
  // Both edges are bidirectional in traversal. Nothing else attaches: the
  // flat pass above skips stair nodes on both sides of every test.
  for(const c of comps){
    if(c.t !== 'stairs') continue;
    const [dx,,dz] = DIRS[c.r||0];
    const top = nodes.get(ck(c.p[0], c.p[1]+1, c.p[2]));
    if(!top) continue;
    const low = nodes.get(ck(c.p[0]-dx, c.p[1], c.p[2]-dz));
    if(low && top.h2 === low.h2 + 2){
      add(nk(top), nk(low), 'stair', 15);
      add(nk(low), nk(top), 'stair', 15);
    }
    const hi = nodes.get(ck(c.p[0]+dx, top.y, c.p[2]+dz));
    if(hi && hi.h2 === top.h2){
      add(nk(top), nk(hi), 'flat', 15);
      add(nk(hi), nk(top), 'flat', 15);
    }
  }

  // --- illusion: exact screen-key coincidence, per yaw ---
  //
  // SPEC CORRECTION (v4 said `illusionDenylist`, i.e. opt-out):
  // Coincidence is not rare. A plain staircase produces 13 of these and a flat
  // plaza produces 4, because regular architecture aligns with itself constantly.
  // Under an opt-out model an author would have to hunt down a dozen accidental
  // seams per build, and every one they missed would ship as a bug — which is
  // exactly the failure mode risk #1 describes. So detection is only ever a
  // *candidate list*; nothing becomes traversable until the author promotes it.
  const candidates = [], illusion = [];
  const allow = new Set(allowList.map(s => seamKey(s.a, s.b, s.yaw)));

  for(let yaw=0; yaw<4; yaw++){
    const bucket = new Map();
    for(const [k,n] of nodes){
      const s = screenKey(n, yaw);
      if(!bucket.has(s)) bucket.set(s,[]);
      bucket.get(s).push(k);
    }
    for(const group of bucket.values()){
      if(group.length < 2) continue;
      for(let i=0;i<group.length;i++) for(let j=i+1;j<group.length;j++){
        const a = group[i], b = group[j];
        if((edges.get(a)||[]).some(e=>e.to===b)) continue;   // real adjacency wins
        candidates.push({a,b,yaw});
        if(!allow.has(seamKey(a,b,yaw))) continue;           // detected, not authored
        add(a, b, 'illusion', 1<<yaw);
        add(b, a, 'illusion', 1<<yaw);
        illusion.push({a,b,yaw});
      }
    }
  }
  return { nodes, edges, illusion, candidates, solid };
}
