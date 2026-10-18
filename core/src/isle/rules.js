// @klar/core — Isle rules. Pure and deterministic: step(level, state, move) is
// the ONLY way the world changes, so the game, the solver and solution replay
// can never disagree. One keypress = one move = one step().
//
// THE RULES (the whole game, in plain words — keep this list short):
//  1. Move one tile N/S/E/W. You can walk onto floor at the SAME height, hop
//     DOWN one level onto a lower tile, or climb using a ramp. Never climb a
//     ledge without a ramp. Ramps are only used along their slope, not sideways.
//  2. Walk into a crate to push it one tile (same height, or off a one-level
//     ledge). A crate pushed into water sinks and becomes floor.
//  3. Ice keeps you (and crates) sliding until something stops you.
//  4. Gates are open while EVERY plate is pressed — by you or a crate.
//  5. Stand on a lever and press Use (X) to flip all bridges: '=' rise/sink,
//     '_' do the opposite. A crate on a sinking bridge drops in and stays as a
//     permanent stepping block — the one way to keep a crossing through a flip.
//  6. Keys open doors (one key per door). Stepping into a portal arch sends you
//     to its twin.  7. Reach a goal to clear the isle.
import { MOVE_DIRS, OPP } from './format.js';

export function initialState(level){
  return { p:level.start, crates:level.crates.slice(), filled:[], keys:0, got:[], opened:[], flip:false };
}

const clone = s => ({ p:s.p, crates:s.crates.slice(), filled:s.filled.slice(), keys:s.keys,
                      got:s.got.slice(), opened:s.opened.slice(), flip:s.flip });
const sorted = a => a.slice().sort((x,y) => x-y).join(',');
export const stateKey = s => `${s.p}|${sorted(s.crates)}|${sorted(s.filled)}|${s.keys}|${sorted(s.got)}|${sorted(s.opened)}|${s.flip?1:0}`;

export function neighbor(level, i, m){
  const x = i % level.w + MOVE_DIRS[m][0], z = ((i / level.w) | 0) + MOVE_DIRS[m][1];
  return (x < 0 || z < 0 || x >= level.w || z >= level.h) ? -1 : z*level.w + x;
}

export const bridgeUp = (cell, s) => cell.on ? !s.flip : s.flip;

// Gates read the occupancy at the START of a move: stand on the plate, step
// into the gate. A gate that closes on you never traps you — leaving is free.
export function gatesOpen(level, s){
  return level.plates.length > 0 && level.plates.every(i => i === s.p || s.crates.includes(i));
}

// Is cell i a floor the player may stand on (ignoring heights) in state s?
function walkable(level, s, i, gateOpen){
  const c = level.cells[i];
  switch(c.kind){
    case 'ground': case 'goal': case 'plate': case 'lever': case 'ice':
    case 'portal': case 'ramp': return true;
    case 'water':  return s.filled.includes(i);
    case 'bridge': return bridgeUp(c, s) || s.filled.includes(i);
    case 'gate':   return gateOpen || s.p === i;
    case 'door':   return s.opened.includes(i) || s.keys > 0;
    default:       return false;               // void, rock, tree
  }
}

// Height the walker is at when LEAVING cell c in direction m / ENTERING it.
// Ramps are one level tall and only usable along their slope.
const exitH  = (c, m) => c.kind !== 'ramp' ? c.h : m === c.dir ? c.h + 1 : m === OPP[c.dir] ? c.h : null;
const entryH = (c, m) => c.kind !== 'ramp' ? c.h : m === c.dir ? c.h : m === OPP[c.dir] ? c.h + 1 : null;

// -> 'flat' | 'ramp' | 'down' | null
function heightStep(a, b, m){
  const ea = exitH(a, m), eb = entryH(b, m);
  if(ea == null || eb == null) return null;
  if(ea === eb) return (a.kind === 'ramp' || b.kind === 'ramp') ? 'ramp' : 'flat';
  if(ea === eb + 1 && a.kind !== 'ramp' && b.kind !== 'ramp') return 'down';
  return null;
}

function playerCanEnter(level, s, from, to, m, gateOpen){
  if(to < 0 || !walkable(level, s, to, gateOpen)) return null;
  return heightStep(level.cells[from], level.cells[to], m);
}

// Can a crate move from -> to? Crates never use ramps or portals, never cover
// goals, levers or uncollected keys. Returns null, 'move' or 'sink'.
function crateCanEnter(level, s, from, to, gateOpen){
  if(to < 0 || to === s.p || s.crates.includes(to)) return null;
  const a = level.cells[from], b = level.cells[to];
  if(b.kind === 'ramp' || !(b.h === a.h || b.h === a.h - 1)) return null;
  switch(b.kind){
    case 'ground': return level.keys.includes(to) && !s.got.includes(to) ? null : 'move';
    case 'plate': case 'ice': return 'move';
    case 'water':  return s.filled.includes(to) ? 'move' : 'sink';
    case 'bridge': return (bridgeUp(b, s) || s.filled.includes(to)) ? 'move' : null;
    case 'gate':   return gateOpen ? 'move' : null;
    case 'door':   return s.opened.includes(to) ? 'move' : null;
    default:       return null;                // goal, lever, portal, rock, tree, void
  }
}

// One move. Returns { ok:false } for a blocked move (state untouched), else
// { ok:true, state, events, won }. events drive animation, in play order:
//   walk{from,to,kind} slide{from,to} tp{from,to} push{from,to} cslide{from,to}
//   sink{at} fall{at} key{at} door{at} toggle{flip} gate{open} win
export function step(level, s0, move){
  const before = gatesOpen(level, s0);
  const events = [];
  let s;

  if(move === 'X'){
    if(!level.levers.includes(s0.p)) return { ok:false };
    s = clone(s0);
    s.flip = !s.flip;
    events.push({ t:'toggle', flip:s.flip });
    for(let j = s.crates.length - 1; j >= 0; j--){
      const at = s.crates[j], c = level.cells[at];
      if(c.kind === 'bridge' && !bridgeUp(c, s) && !s.filled.includes(at)){
        events.push({ t:'fall', at }); s.crates.splice(j, 1); s.filled.push(at);
      }
    }
  } else {
    const dir = MOVE_DIRS[move];
    if(!dir) return { ok:false };
    const to = neighbor(level, s0.p, move);
    const kind = playerCanEnter(level, s0, s0.p, to, move, before);
    if(!kind) return { ok:false };
    s = clone(s0);

    // push a crate standing in the way
    const cj = s.crates.indexOf(to);
    if(cj >= 0){
      const beyond = neighbor(level, to, move);
      const r = crateCanEnter(level, s, to, beyond, before);
      if(!r) return { ok:false };
      events.push({ t:'push', from:to, to:beyond });
      s.p = to;                                   // player follows into the vacated tile
      if(r === 'sink'){ s.crates.splice(cj, 1); s.filled.push(beyond); events.push({ t:'sink', at:beyond }); }
      else {
        s.crates[cj] = beyond;
        let cur = beyond;                         // crates slide on ice too
        while(level.cells[cur].kind === 'ice'){
          const nx = neighbor(level, cur, move);
          const rr = crateCanEnter(level, s, cur, nx, before);
          if(!rr) break;
          events.push({ t:'cslide', from:cur, to:nx });
          if(rr === 'sink'){ s.crates.splice(cj, 1); s.filled.push(nx); events.push({ t:'sink', at:nx }); break; }
          s.crates[cj] = nx; cur = nx;
        }
      }
    }
    s.p = to;
    events.push({ t:'walk', from:s0.p, to, kind });
    enter(level, s, to, events);

    // ice slide: keep going until blocked or off the ice
    let cur = s.p;
    while(level.cells[cur].kind === 'ice' && !events.some(e => e.t === 'tp')){
      const nx = neighbor(level, cur, move);
      if(nx < 0 || s.crates.includes(nx)) break;
      if(!playerCanEnter(level, s, cur, nx, move, before)) break;
      events.push({ t:'slide', from:cur, to:nx });
      s.p = nx; cur = nx;
      enter(level, s, nx, events);
      cur = s.p;
    }
  }

  const after = gatesOpen(level, s);
  if(after !== before) events.push({ t:'gate', open:after });
  const won = level.goals.includes(s.p);
  if(won) events.push({ t:'win' });
  return { ok:true, state:s, events, won };
}

// Effects of arriving on a tile: doors spend a key, keys are picked up,
// portals send you to the twin arch (unless a crate blocks it).
function enter(level, s, i, events){
  const c = level.cells[i];
  if(c.kind === 'door' && !s.opened.includes(i)){ s.keys--; s.opened.push(i); events.push({ t:'door', at:i }); }
  if(level.keys.includes(i) && !s.got.includes(i)){ s.got.push(i); s.keys++; events.push({ t:'key', at:i }); }
  if(c.kind === 'portal'){
    const tw = level.twin[i];
    if(tw != null && !s.crates.includes(tw)){ s.p = tw; events.push({ t:'tp', from:i, to:tw }); }
  }
}

// Replay a move string. -> { won, state, applied, failedAt }
export function simulate(level, moves){
  let s = initialState(level);
  for(let k = 0; k < moves.length; k++){
    const r = step(level, s, moves[k]);
    if(!r.ok) return { won:false, state:s, applied:k, failedAt:k };
    s = r.state;
    if(r.won) return { won:true, state:s, applied:k + 1, failedAt:-1 };
  }
  return { won:false, state:s, applied:moves.length, failedAt:-1 };
}
