// @klar/core — world lattice rules (Phase 3). Pure; the server executes them
// inside DB transactions. plots is a Map keyed 'x,y' -> { puzzleHash, ports }.
import { portsMatch, OPPOSITE } from './ports.js';

export const plotKey = (x,y) => x+','+y;
export const neighbours4 = (x,y) => [[x,y-1],[x+1,y],[x,y+1],[x-1,y]];
export const EDGE_OF = { '0,-1':'n', '1,0':'e', '0,1':'s', '-1,0':'w' };

// Claim rule: the world starts at genesis (0,0); after that a cell must be
// FREE and 4-adjacent to at least one existing plot. No leaps, no enclaves.
export function canClaim(plots, x, y){
  if(plots.size === 0) return { ok: x===0 && y===0, reason:'the world starts at (0,0)' };
  if(plots.has(plotKey(x,y))) return { ok:false, reason:'cell already claimed' };
  for(const [nx,ny] of neighbours4(x,y))
    if(plots.has(plotKey(nx,ny))) return { ok:true };
  return { ok:false, reason:'must touch an existing plot' };
}

// Placement rule: my plot must exist, be mine (checked by caller), be EMPTY,
// and my puzzle's ports must match every OCCUPIED neighbour. Empty/unclaimed
// neighbours impose nothing — they will be checked against me when THEY place.
// Placed plots are immutable: there is deliberately no mutation path here.
export function canPlace(plots, x, y, myPorts){
  const me = plots.get(plotKey(x,y));
  if(!me) return { ok:false, reason:'you do not own this cell' };
  if(me.puzzleHash) return { ok:false, reason:'plot already holds a puzzle — placements are immutable' };
  for(const [nx,ny] of neighbours4(x,y)){
    const nb = plots.get(plotKey(nx,ny));
    if(!nb || !nb.puzzleHash) continue;
    const edge = EDGE_OF[(nx-x)+','+(ny-y)];
    const m = portsMatch(myPorts, nb.ports, edge);
    if(!m.ok) return m;
  }
  return { ok:true };
}
