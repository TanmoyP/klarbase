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
//     to its twin — on an archipelago map, an arch pair across storeys is a
//     GATEWAY, the only way between storeys.  7. Reach a goal to clear the isle.
//  Sky Scales (K1): two pans hang from one vine. After each move settles, the
//     heavier pan sits one level below its base, the lighter one level above,
//     equal = base. Whatever stands on a pan rides with it; no cascades. Pan
//     heights follow from where Pip and the crates are, so the state never grows,
//     and a move is judged with the heights at its START (like gates and plates).
//  Weight II (K1, K6, K9). Pip holds ONE thing. Use (X) on what you stand on:
//     a lever flips it; a balloon post gives its one balloon; a stone pile gives a
//     stone or takes it back (stones are returned only at a pile). Use anywhere
//     else while holding a balloon lets it go — forever.
//       holding   weight  plates  scales  gust       pushes  glides
//       nothing   1       press   1       stands     yes     no
//       balloon   0       no      0       is blown   no      yes
//       stone     2       press   2       stands     yes, even into the wind
//     GLIDE: with a balloon, a step Pip can't walk becomes a glide: Pip drifts on,
//     one level lower per tile, and lands on the first floor exactly at that
//     height (anything in the way, or nothing to land on = no move).
//     BUOYS weigh −1: pushed like crates but they float UP a one-level ledge and
//     never drop down one; pushed into water they float — a stepping stone that
//     only the wind moves. They press no plates and lift a pan.
//     GUSTS: a vent blows along a fixed line (format.js). A crate in the line
//     shelters everything behind it (a crate on the vent caps it). After each
//     move, every light thing in the wind — balloon-Pip, buoys not under Pip —
//     moves one tile downwind if it can (never off an edge). Brace rule: pushing a
//     crate or buoy that stands in the wind INTO the wind needs weight > 1 (stone).
//  Cozy hazards (K5). Boulders roll their lane and thorn sweepers turn, one beat per
//     move; where they will be is always shown. If, after a move, a hazard is on Pip's
//     tile — or Pip and a hazard swapped tiles — Pip bonks and the move is undone (it
//     doesn't count). On an isle with hazards, Use with nothing to use WAITS a beat.
//     Crates and buoys never enter a hazard's tiles. The turn counter (mod the hazards'
//     shared cycle, at most 12) is the only new state.
import { MOVE_DIRS, OPP, hazardCellsAt } from './format.js';

export function initialState(level){
  return { p:level.start, crates:level.crates.slice(), filled:[], keys:0, got:[], opened:[], flip:false,
           hold:'', buoys:(level.buoys || []).slice(), posts:[], t:0 };
}

const clone = s => ({ p:s.p, crates:s.crates.slice(), filled:s.filled.slice(), keys:s.keys,
                      got:s.got.slice(), opened:s.opened.slice(), flip:s.flip,
                      hold:s.hold, buoys:s.buoys.slice(), posts:s.posts.slice(), t:s.t });
const sorted = a => a.slice().sort((x,y) => x-y).join(',');
export const stateKey = s => `${s.p}|${sorted(s.crates)}|${sorted(s.filled)}|${s.keys}|${sorted(s.got)}|${sorted(s.opened)}|${s.flip?1:0}|${s.hold}|${sorted(s.buoys)}|${sorted(s.posts)}|${s.t}`;

// Next cell in direction m, or -1 off the grid. Never crosses a storey edge.
export function neighbor(level, i, m){
  const x = i % level.w + MOVE_DIRS[m][0], z = ((i / level.w) | 0) + MOVE_DIRS[m][1];
  if(x < 0 || z < 0 || x >= level.w || z >= level.h) return -1;
  const j = z*level.w + x;
  return level.sid && level.sid[j] !== level.sid[i] ? -1 : j;
}

export const bridgeUp = (cell, s) => cell.on ? !s.flip : s.flip;

// What things weigh (K1, K9). Heights, plates and scales read only these.
export const WEIGHT = { pip:1, crate:1, buoy:-1, balloon:0, stone:2 };
export const GUST = 1;                                   // a vent's strength (K9 brace rule)
export const pipWeight = s => s.hold === 'balloon' ? WEIGHT.balloon : s.hold === 'stone' ? WEIGHT.stone : WEIGHT.pip;

// -1 | 0 | 1: which way the scales lean in state s. +1 = pan A is heavier
// (A sits at base − 1, B at base + 1); 0 = balanced (both at base).
export function panTilt(level, s){
  if(!level.pans) return 0;
  let a = 0, b = 0;
  const load = (i, w) => { const p = level.cells[i].pan; if(p === 'a') a += w; else if(p === 'b') b += w; };
  load(s.p, pipWeight(s));
  for(const c of s.crates) load(c, WEIGHT.crate);
  for(const c of s.buoys) load(c, WEIGHT.buoy);
  return Math.sign(a - b);
}
// Height of cell i with the scales leaning `tilt`. Pans move; nothing else does.
export const heightAt = (level, i, tilt) => {
  const c = level.cells[i];
  return c.pan ? c.h + (c.pan === 'a' ? -tilt : tilt) : c.h;
};

// Gates read the occupancy at the START of a move: stand on the plate, step
// into the gate. A gate that closes on you never traps you — leaving is free.
// Balloon-Pip weighs nothing and presses no plate; buoys press nothing.
export function gatesOpen(level, s){
  return level.plates.length > 0 && level.plates.every(i => (i === s.p && pipWeight(s) > 0) || s.crates.includes(i));
}

// Is cell i open water (or a sunk bridge) that nothing has filled? A buoy there floats.
const wet = (level, s, i) => { const c = level.cells[i];
  return !s.filled.includes(i) && (c.kind === 'water' || (c.kind === 'bridge' && !bridgeUp(c, s))); };
export const floating = (level, s, i) => s.buoys.includes(i) && wet(level, s, i);

// The wind at cell i in state s: the gust's direction, or null. A crate on the
// line (the vent included) shelters every tile after it.
export function windAt(level, s, i){
  const g = level.inGust && level.inGust.get(i);
  if(g === undefined) return null;
  for(const c of level.gusts[g].cells){ if(c === i) return level.gusts[g].dir; if(s.crates.includes(c)) return null; }
  return null;
}

// Is cell i a floor the player may stand on (ignoring heights) in state s?
function walkable(level, s, i, gateOpen){
  const c = level.cells[i];
  switch(c.kind){
    case 'ground': case 'goal': case 'plate': case 'lever': case 'ice':
    case 'portal': case 'ramp': case 'pan': case 'post': case 'pile': case 'vent': return true;
    case 'water':  return s.filled.includes(i) || s.buoys.includes(i);
    case 'bridge': return bridgeUp(c, s) || s.filled.includes(i) || s.buoys.includes(i);
    case 'gate':   return gateOpen || s.p === i;
    case 'door':   return s.opened.includes(i) || s.keys > 0;
    default:       return false;               // void, rock, tree
  }
}

// Height the walker is at when LEAVING cell c (standing height h) in direction
// m / ENTERING it. Ramps are one level tall and only usable along their slope.
const exitH  = (c, h, m) => c.kind !== 'ramp' ? h : m === c.dir ? h + 1 : m === OPP[c.dir] ? h : null;
const entryH = (c, h, m) => c.kind !== 'ramp' ? h : m === c.dir ? h : m === OPP[c.dir] ? h + 1 : null;

// -> 'flat' | 'ramp' | 'down' | null   (tilt = the scales at the start of the move)
function heightStep(level, from, to, m, tilt){
  const a = level.cells[from], b = level.cells[to];
  const ea = exitH(a, heightAt(level, from, tilt), m), eb = entryH(b, heightAt(level, to, tilt), m);
  if(ea == null || eb == null) return null;
  if(ea === eb) return (a.kind === 'ramp' || b.kind === 'ramp') ? 'ramp' : 'flat';
  if(ea === eb + 1 && a.kind !== 'ramp' && b.kind !== 'ramp') return 'down';
  return null;
}

function playerCanEnter(level, s, from, to, m, gateOpen, tilt){
  if(to < 0 || !walkable(level, s, to, gateOpen)) return null;
  return heightStep(level, from, to, m, tilt);
}

// Glide (balloon only): from `from` in direction m, one level lower per tile.
// -> landing cell, or -1. Lands on walkable floor exactly at its altitude; a
// rock, tree, ramp, closed gate or door, crate or buoy is 1 tall and is cleared
// only from above it; water or floor above the altitude ends the glide.
function glideTo(level, s, from, m, gateOpen, tilt){
  const H = exitH(level.cells[from], heightAt(level, from, tilt), m);
  if(H == null) return -1;
  for(let k = 1, cur = from; ; k++){
    const nx = neighbor(level, cur, m), a = H - k;
    if(nx < 0 || a < 0) return -1;
    const c = level.cells[nx], top = heightAt(level, nx, tilt);
    if(c.kind !== 'void'){
      const piece = s.crates.includes(nx) || (s.buoys.includes(nx) && !floating(level, s, nx));
      const tall = piece || c.kind === 'rock' || c.kind === 'tree' || c.kind === 'ramp' || !walkable(level, s, nx, gateOpen) && (c.kind === 'gate' || c.kind === 'door');
      if(tall){ if(a < top + 1) return -1; }
      else if(walkable(level, s, nx, gateOpen)){ if(top === a) return nx; if(top > a) return -1; }
      else if(top >= a) return -1;                 // water at (or above) the altitude
    }
    cur = nx;
  }
}

// Can a crate move from -> to? Crates never use ramps or portals, never cover
// goals, levers or uncollected keys. Returns null, 'move' or 'sink'.
function crateCanEnter(level, s, from, to, gateOpen, tilt){
  if(to < 0 || to === s.p || s.crates.includes(to) || s.buoys.includes(to) || (level.hazardZone && level.hazardZone.has(to))) return null;
  const b = level.cells[to], ha = heightAt(level, from, tilt), hb = heightAt(level, to, tilt);
  if(b.kind === 'ramp' || !(hb === ha || hb === ha - 1)) return null;
  switch(b.kind){
    case 'ground': return level.keys.includes(to) && !s.got.includes(to) ? null : 'move';
    case 'plate': case 'ice': case 'pan': case 'vent': case 'pile': case 'post': return 'move';
    case 'water':  return s.filled.includes(to) ? 'move' : 'sink';
    case 'bridge': return (bridgeUp(b, s) || s.filled.includes(to)) ? 'move' : null;
    case 'gate':   return gateOpen ? 'move' : null;
    case 'door':   return s.opened.includes(to) ? 'move' : null;
    default:       return null;                // goal, lever, portal, rock, tree, void
  }
}

// Can a buoy move from -> to? The mirror of a crate: same height or UP one level,
// never down; onto open water it floats ('float'). Returns null, 'move' or 'float'.
function buoyCanEnter(level, s, from, to, gateOpen, tilt){
  if(to < 0 || to === s.p || s.crates.includes(to) || s.buoys.includes(to) || (level.hazardZone && level.hazardZone.has(to))) return null;
  const b = level.cells[to], ha = heightAt(level, from, tilt), hb = heightAt(level, to, tilt);
  if(b.kind === 'ramp' || !(hb === ha || hb === ha + 1)) return null;
  if(wet(level, s, to)) return 'float';
  switch(b.kind){
    case 'ground': return level.keys.includes(to) && !s.got.includes(to) ? null : 'move';
    case 'plate': case 'ice': case 'pan': case 'vent': case 'pile': case 'post': case 'water': case 'bridge': return 'move';
    case 'gate':   return gateOpen ? 'move' : null;
    case 'door':   return s.opened.includes(to) ? 'move' : null;
    default:       return null;
  }
}

// One move. Returns { ok:false } for a blocked move (state untouched), else
// { ok:true, state, events, won }. events drive animation, in play order:
//   walk{from,to,kind} glide{from,to} slide{from,to} tp{from,to,gateway?}
//   push{from,to,buoy?} cslide{from,to,buoy?} sink{at} float{at} fall{at} key{at}
//   door{at} toggle{flip} take{at,what} drop{at,what} release{at}
//   gust{from,to,buoy?} scales{from,tilt} gate{open} wait{at} hazard{turn} win
// A move that ends in a hazard returns { ok:false, bonk:{ at, turn } } (state untouched).
export function step(level, s0, move){
  const before = gatesOpen(level, s0), tilt = panTilt(level, s0);
  const events = [];
  let s;

  if(move === 'X'){
    const at = s0.p, cell = level.cells[at];
    s = clone(s0);
    if(level.levers.includes(at)){
      s.flip = !s.flip;
      events.push({ t:'toggle', flip:s.flip });
      for(let j = s.crates.length - 1; j >= 0; j--){
        const c = s.crates[j], cc = level.cells[c];
        if(cc.kind === 'bridge' && !bridgeUp(cc, s) && !s.filled.includes(c)){
          events.push({ t:'fall', at:c }); s.crates.splice(j, 1); s.filled.push(c);
        }
      }
    }
    else if(cell.kind === 'post' && !s.hold && !s.posts.includes(at)){ s.hold = 'balloon'; s.posts.push(at); events.push({ t:'take', at, what:'balloon' }); }
    else if(cell.kind === 'pile' && !s.hold){ s.hold = 'stone'; events.push({ t:'take', at, what:'stone' }); }
    else if(cell.kind === 'pile' && s.hold === 'stone'){ s.hold = ''; events.push({ t:'drop', at, what:'stone' }); }
    else if(s.hold === 'balloon'){ s.hold = ''; events.push({ t:'release', at }); }
    else if(level.hazards && level.hazards.length) events.push({ t:'wait', at });   // a beat passes
    else return { ok:false };
  } else {
    const dir = MOVE_DIRS[move];
    if(!dir) return { ok:false };
    let to = neighbor(level, s0.p, move);
    let kind = playerCanEnter(level, s0, s0.p, to, move, before, tilt);
    let glide = -1;
    if(!kind && s0.hold === 'balloon'){ glide = glideTo(level, s0, s0.p, move, before, tilt); if(glide < 0) return { ok:false }; }
    else if(!kind) return { ok:false };
    s = clone(s0);

    if(glide >= 0){ to = glide; s.p = to; events.push({ t:'glide', from:s0.p, to }); }
    else {
      // push a crate or a (grounded) buoy standing in the way; a floating buoy is floor
      const cj = s.crates.indexOf(to), bj = floating(level, s, to) ? -1 : s.buoys.indexOf(to);
      if(cj >= 0 || bj >= 0){
        if(pipWeight(s0) <= 0) return { ok:false };                               // balloon-Pip is too light to push
        if(windAt(level, s0, to) === OPP[move] && pipWeight(s0) <= GUST) return { ok:false };   // brace rule (K9)
        const beyond = neighbor(level, to, move), buoy = bj >= 0;
        const can = buoy ? buoyCanEnter : crateCanEnter;
        const r = can(level, s, to, beyond, before, tilt);
        if(!r) return { ok:false };
        events.push(buoy ? { t:'push', from:to, to:beyond, buoy:true } : { t:'push', from:to, to:beyond });
        s.p = to;                                   // player follows into the vacated tile
        const list = buoy ? s.buoys : s.crates, j = buoy ? bj : cj;
        if(r === 'sink'){ list.splice(j, 1); s.filled.push(beyond); events.push({ t:'sink', at:beyond }); }
        else {
          list[j] = beyond;
          if(r === 'float') events.push({ t:'float', at:beyond });
          let cur = beyond;                         // crates and buoys slide on ice too
          while(r !== 'float' && level.cells[cur].kind === 'ice'){
            const nx = neighbor(level, cur, move);
            const rr = can(level, s, cur, nx, before, tilt);
            if(!rr) break;
            events.push(buoy ? { t:'cslide', from:cur, to:nx, buoy:true } : { t:'cslide', from:cur, to:nx });
            if(rr === 'sink'){ list.splice(j, 1); s.filled.push(nx); events.push({ t:'sink', at:nx }); break; }
            list[j] = nx; cur = nx;
            if(rr === 'float'){ events.push({ t:'float', at:nx }); break; }
          }
        }
      }
      s.p = to;
      events.push({ t:'walk', from:s0.p, to, kind });
    }
    enter(level, s, to, events);

    // ice slide: keep going until blocked or off the ice
    let cur = s.p;
    while(level.cells[cur].kind === 'ice' && !events.some(e => e.t === 'tp')){
      const nx = neighbor(level, cur, move);
      if(nx < 0 || s.crates.includes(nx) || (s.buoys.includes(nx) && !floating(level, s, nx))) break;
      if(!playerCanEnter(level, s, cur, nx, move, before, tilt)) break;
      events.push({ t:'slide', from:cur, to:nx });
      s.p = nx; cur = nx;
      enter(level, s, nx, events);
      cur = s.p;
    }
  }

  // the move has settled: the wind blows light things one tile (unless Pip just
  // reached a goal), then the scales find their new balance (pieces ride along)
  let won = level.goals.includes(s.p);
  if(!won && level.gusts && level.gusts.length) won = blow(level, s, events);
  const tilt2 = panTilt(level, s);
  if(tilt2 !== tilt) events.push({ t:'scales', from:tilt, tilt:tilt2 });
  const after = gatesOpen(level, s);
  if(after !== before) events.push({ t:'gate', open:after });
  // the hazards' beat: one step along their cycle, then the cozy check
  if(level.hazards && level.hazards.length){
    s.t = (s0.t + 1) % level.cycle;
    const now = hazardCellsAt(level, s0.t), next = hazardCellsAt(level, s.t);
    if(next.includes(s.p) || (now.includes(s.p) && next.includes(s0.p))) return { ok:false, bonk:{ at:s.p, turn:s.t } };
    events.push({ t:'hazard', turn:s.t });
  }
  if(won) events.push({ t:'win' });
  return { ok:true, state:s, events, won };
}

// The wind's turn (K6). Movers are fixed from the settled state, farthest
// downwind first so a row of buoys drifts together; each needs a free tile.
function blow(level, s, events){
  const open = gatesOpen(level, s), tilt = panTilt(level, s), movers = [];
  const pipWind = pipWeight(s) <= 0 ? windAt(level, s, s.p) : null;
  if(pipWind) movers.push({ pip:true, at:s.p, dir:pipWind });
  for(const b of s.buoys){ const d = b !== s.p && windAt(level, s, b); if(d) movers.push({ at:b, dir:d }); }
  const ahead = m => { const [dx, dz] = MOVE_DIRS[m.dir]; return (m.at % level.w) * dx + ((m.at / level.w) | 0) * dz; };
  movers.sort((a, b) => ahead(b) - ahead(a));
  for(const m of movers){
    const to = neighbor(level, m.at, m.dir);
    if(m.pip){
      if(to < 0 || s.crates.includes(to) || (s.buoys.includes(to) && !floating(level, s, to))) continue;
      if(!playerCanEnter(level, s, m.at, to, m.dir, open, tilt)) continue;
      s.p = to; events.push({ t:'gust', from:m.at, to });
      enter(level, s, to, events);
    } else {
      const r = buoyCanEnter(level, s, m.at, to, open, tilt);
      if(!r) continue;
      s.buoys[s.buoys.indexOf(m.at)] = to; events.push({ t:'gust', from:m.at, to, buoy:true });
      if(r === 'float') events.push({ t:'float', at:to });
    }
  }
  return level.goals.includes(s.p);
}

// Effects of arriving on a tile: doors spend a key, keys are picked up,
// portals send you to the twin arch (unless a crate or buoy blocks it).
function enter(level, s, i, events){
  const c = level.cells[i];
  if(c.kind === 'door' && !s.opened.includes(i)){ s.keys--; s.opened.push(i); events.push({ t:'door', at:i }); }
  if(level.keys.includes(i) && !s.got.includes(i)){ s.got.push(i); s.keys++; events.push({ t:'key', at:i }); }
  if(c.kind === 'portal'){
    const tw = level.twin[i];
    if(tw != null && !s.crates.includes(tw) && !s.buoys.includes(tw)){ s.p = tw; events.push(c.gateway ? { t:'tp', from:i, to:tw, gateway:true } : { t:'tp', from:i, to:tw }); }
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

// Seeds (Phase 3) are optional collectibles and never part of the rules or the
// state: a seed is picked when Pip stands on its tile at any point of a move
// (walking, sliding, arriving through an arch, landing a glide, blown by a gust).
// -> the seed cells this step's result touched.
export function seedsTouched(level, r){
  if(!level.seeds || !level.seeds.length || !r.ok) return [];
  const at = new Set([r.state.p]);
  for(const e of r.events) if((e.t === 'walk' || e.t === 'slide' || e.t === 'tp' || e.t === 'glide' || (e.t === 'gust' && !e.buoy))) at.add(e.to);
  return level.seeds.filter(i => at.has(i));
}
