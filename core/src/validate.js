// @klar/core — validator. Pure. This module is the project's security boundary:
// the server publish gate runs THIS code, never a reimplementation (spec v4.5 §13).
// Base logic ported byte-faithfully from prototypes/phase1.html, then hardened:
// unknown types / malformed shapes are validation errors, never thrown exceptions,
// and unmated stairs surface the spec's W_STAIR_OPEN warning.
import { ck, nk, TYPES, PLOT } from './components.js';
import { buildGraph } from './graph.js';

export const MAX_COMPONENTS = 2000;   // DoS guard for the publish gate

// Support rule: every solid cell must belong to a face-connected cluster that
// touches y === 0. This is stricter than "solid below" (no floating islands)
// and looser (cantilevers and bridges are legal), which is what the spec's
// support-chain rule actually means.
export function validate(comps){
  const errors = [], warnings = [];
  if(!Array.isArray(comps)) return { ok:false, errors:[{code:'E_SHAPE'}], warnings };
  if(comps.length > MAX_COMPONENTS) errors.push({code:'E_TOO_MANY'});
  const seen = new Map();
  for(const c of comps){
    if(!c || !TYPES[c.t]){ errors.push({code:'E_TYPE', id:c && c.i}); continue; }
    if(!Array.isArray(c.p) || c.p.length!==3 || c.p.some(v=>!Number.isInteger(v))){
      errors.push({code:'E_SHAPE', id:c.i}); continue;
    }
    if(c.r!=null && (!Number.isInteger(c.r) || c.r<0 || c.r>3)){
      errors.push({code:'E_SHAPE', id:c.i}); continue;
    }
    for(const [x,y,z] of TYPES[c.t].occ(c)){
      if(x<0||z<0||y<0||x>=PLOT.size[0]||y>=PLOT.size[1]||z>=PLOT.size[2])
        errors.push({code:'E_BOUNDS', id:c.i});
      const k = ck(x,y,z);
      if(seen.has(k)) errors.push({code:'E_OVERLAP', id:c.i});
      seen.set(k,c.i);
    }
  }
  // flood fill from ground
  const reach = new Set(), stack = [];
  for(const [k,id] of seen){ if(k.split(',')[1]==='0'){ reach.add(k); stack.push(k); } }
  while(stack.length){
    const [x,y,z] = stack.pop().split(',').map(Number);
    for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
      const k = ck(x+dx,y+dy,z+dz);
      if(seen.has(k) && !reach.has(k)){ reach.add(k); stack.push(k); }
    }
  }
  for(const [k,id] of seen) if(!reach.has(k)) errors.push({code:'E_FLOATING', id});

  const valid = comps.filter(c=>c && TYPES[c.t]);
  const spawns = valid.filter(c=>c.t==='spawn').length;
  const goals  = valid.filter(c=>c.t==='goal').length;
  if(spawns !== 1) errors.push({code:'E_SPAWN_COUNT'});
  if(goals   <  1) errors.push({code:'E_NO_GOAL'});

  // W_STAIR_OPEN — a stair mated at neither end connects to nothing (spec v4.4).
  // A warning, not an error: it can be a deliberate mid-draft state.
  if(errors.length===0 && comps.length){
    const g = buildGraph(comps, []);
    for(const c of comps){
      if(c.t !== 'stairs') continue;
      const top = g.nodes.get(ck(c.p[0], c.p[1]+1, c.p[2]));
      if(!top) continue;
      const es = g.edges.get(nk(top)) || [];
      if(!es.some(e=>e.kind==='stair'||e.kind==='flat'))
        warnings.push({code:'W_STAIR_OPEN', id:c.i});
    }
  }
  return { ok: errors.length===0, errors, warnings };
}

export const ERR_TEXT = {
  E_BOUNDS:'outside the plot', E_OVERLAP:'two things in one cell',
  E_FLOATING:'floating — nothing holds it up', E_SPAWN_COUNT:'needs exactly one spawn',
  E_NO_GOAL:'needs at least one goal', E_TYPE:'unknown component type',
  E_SHAPE:'malformed component', E_TOO_MANY:'too many components',
  W_STAIR_OPEN:'stair connects to nothing — it only joins end to end',
};
