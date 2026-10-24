// How to build — the builder's guide, one entry per palette tool (keyed by the
// tool ids in builder.js TOOLS, whose icons and labels it reuses). The facts
// restate isles/README.md "The rules" for builders; if a rule changes there, it
// changes here too. Static text only — no solutions, no routes.

// code: the file character(s) · summary: one line (also the palette tooltip)
// what: the behaviour · meta: what the file stores, limits · tip: how to use it
// tags: badges — 'blocks' | 'walk' | 'push' | 'space' | 'maps'
export const GUIDE = {
  // ---- the grid ----
  '.': { code:'.', tags:['walk'], summary:'Plain floor. Pip walks on it at its height.',
    what:'The basic floor tile. Pip can walk onto floor at the same height and hop down one level, but never climb a ledge without a ramp.',
    meta:'Height digit 0–5 after the character (<code>.2</code> = ground two levels up). No digit = height 0.',
    tip:'Build the shape first in ground, then raise tiles to make ledges. Height is where most puzzles come from.' },
  ',': { code:',', tags:['walk'], summary:'Ground with flowers. Decoration only.',
    what:'Exactly like ground: walkable, pushable onto, same rules. It only looks different.',
    meta:'Takes a height digit like ground.',
    tip:'Use flowers to make an isle feel lived-in, or to quietly draw the eye along the real path.' },
  '-': { code:'-', tags:[], summary:'Erase: empty sky, no tile.',
    what:'Removes the tile. Pip can’t step into the sky, and a crate pushed toward it stops.',
    meta:'Written as <code>-</code>. Right-click any cell to erase without switching tools.',
    tip:'Cut corners and holes out of the rectangle so the isle has a shape. The sky is a wall that reads as an edge.' },
  '^+': { code:'0–5', tags:[], summary:'Raise a tile one level (max 5).',
    what:'Adds one to the height digit of whatever you paint over. Empty sky can’t be raised.',
    meta:'Heights run 0–5. A pan’s base must be 1–4.',
    tip:'One-level steps make one-way drops (Pip hops down but can’t climb back), the simplest way to make order matter.' },
  '^h': { code:'0–5', tags:[], summary:'Lower a tile one level (min 0).',
    what:'Subtracts one from the height digit of whatever you paint over.',
    meta:'Stops at 0.',
    tip:'Drag across a whole row to sink a channel, then bridge it with a ramp or a pushed crate.' },

  // ---- terrain ----
  '#': { code:'#', tags:['blocks'], summary:'Rock. Blocks Pip and crates.',
    what:'A solid block. Nothing walks or slides through it. It stops ice slides, gust lines and glides.',
    meta:'Takes a height digit (the floor it stands on).',
    tip:'Put rocks where a slide or a push should stop, so ice has a landing spot and crates can’t be shoved off the edge.' },
  'T': { code:'T', tags:['blocks'], summary:'Tree. Blocks like a rock.',
    what:'Same rule as a rock: solid, stops slides, gusts and glides.',
    meta:'Takes a height digit.',
    tip:'Trees and rocks behave the same, so pick whichever fits the theme. Trees read well as soft walls along a path.' },
  '~': { code:'~', tags:['blocks'], summary:'Water. Blocks, until a crate sinks in.',
    what:'Pip can’t enter water. A crate pushed into water sinks and becomes floor at that spot. A buoy pushed in floats as a stepping stone.',
    meta:'The height digit is the water’s surface; a sunk crate becomes floor at that height.',
    tip:'Classic idea: one crate, one gap. Give the player exactly as many crates as gaps, so a wasted push means a restart.' },
  '*': { code:'*', tags:['walk'], summary:'Ice. Pip and crates slide until stopped.',
    what:'Stepping onto ice keeps you moving in that direction until something stops you: a rock, a tree, a crate, a ledge up, or the end of the ice.',
    meta:'Takes a height digit. Crates slide too.',
    tip:'Make the player plan where a slide stops. A crate or rock placed as a “stopper” turns open ice into a precise puzzle.' },
  'ramp': { code:'^ v < >', tags:['walk'], summary:'Stairs. Climb one level toward the arrow.',
    what:'The only way up. A ramp sits at the lower height: walk onto it in the arrow’s direction and step off onto floor one level higher. Walking it backwards takes you down. It can’t be used sideways, and crates never use ramps.',
    meta:'<code>^</code> north · <code>v</code> south · <code>&lt;</code> west · <code>&gt;</code> east, plus the height digit of its low end. Click the Ramp tool again (or press R) to turn it.',
    tip:'A single ramp to a high goal is a natural “last step”. Hide it behind a gate or a crate puzzle.' },

  // ---- start & goal ----
  'S': { code:'S', tags:['walk'], summary:'Where Pip starts. Exactly one.',
    what:'Pip’s starting tile. It’s ordinary ground afterwards.',
    meta:'Exactly one start per isle or map. Painting a new one moves it. Pip may not start where a hazard can reach.',
    tip:'Start the player where they can see the goal and what stands between them. The first glance is the first clue.' },
  'G': { code:'G', tags:['walk'], summary:'The glowing star. Reach any goal to win.',
    what:'Stepping onto a goal clears the isle.',
    meta:'At least one. Takes a height digit, so a raised goal needs a way up.',
    tip:'Several goals are allowed, but one goal usually makes a cleaner puzzle. Raise it to make the climb part of the solution.' },

  // ---- pieces & switches ----
  'C': { code:'C', tags:['push'], summary:'Crate. Pushed by walking into it.',
    what:'Walk into a crate to push it one tile, onto the same height or off a one-level ledge. It can’t be pushed up a ledge, onto a ramp or through an arch. In water it sinks and becomes floor. On ice it slides. It presses plates.',
    meta:'Sits on ground: the height digit is the floor under it. At most 8 crates and buoys in all.',
    tip:'Corners are traps: a crate pushed into a corner is stuck. Use that so a careless push costs the run.' },
  'o': { code:'o', tags:['walk'], summary:'Pressure plate. Pressed by Pip or a crate.',
    what:'A plate is pressed while Pip (on foot or holding a stone) or a crate stands on it. Gates open only while every plate on the isle is pressed.',
    meta:'Takes a height digit. Buoys and balloon-Pip don’t press plates.',
    tip:'Two plates, one crate: the player must hold one with their feet and park the crate on the other, then work out how to leave.' },
  'D': { code:'D', tags:['blocks'], summary:'Gate. Open while every plate is pressed.',
    what:'Closed, it blocks like a rock. Open, it is floor. It reads the plates at the start of each move.',
    meta:'An isle with a gate needs at least one plate.',
    tip:'Put the gate where Pip must walk off the plate to pass. The player then needs a crate to hold it.' },
  'L': { code:'L', tags:['walk', 'space'], summary:'Lever. Stand on it and press Space to flip every bridge.',
    what:'Use (Space) while standing on a lever flips every bridge on the isle: up bridges sink, sunk bridges rise.',
    meta:'All levers flip all bridges. There are no channels.',
    tip:'Make the lever and the bridge far apart, so the player has to think about which side they’ll be on after the flip.' },
  '=': { code:'=', tags:['walk'], summary:'Bridge, starts up (walkable).',
    what:'A raised bridge is floor. When a lever flips, it sinks and can’t be walked. A crate standing on a sinking bridge drops in and stays as a block.',
    meta:'Takes a height digit (the walkable height when up).',
    tip:'Pair one up bridge with one sunk bridge: every flip opens one way and closes another.' },
  '_': { code:'_', tags:['blocks'], summary:'Bridge, starts sunk (closed).',
    what:'A sunk bridge is like water: Pip can’t walk it until a lever raises it, and a crate pushed onto it sinks in and fills it for good.',
    meta:'Takes a height digit.',
    tip:'Start a shortcut sunk, so it only opens after the lever. A crate sunk into it early keeps it open whatever the lever does.' },
  'k': { code:'k', tags:['walk'], summary:'Key. Picked up by walking over it.',
    what:'Walking onto a key picks it up. Each key opens one door.',
    meta:'Sits on ground: the height digit is the floor under it.',
    tip:'Put the key behind the trickier half of the isle, so the door is a promise the player has to earn.' },
  'K': { code:'K', tags:['blocks'], summary:'Door. Uses one key.',
    what:'Walking into a door while holding a key uses the key and opens the door for good.',
    meta:'Keys and doors needn’t match in number; extra keys are fine.',
    tip:'Two doors, one key: the player must choose. Make one choice a dead end.' },
  'p': { code:'p', tags:['walk'], summary:'Arch A. Step in to appear at its twin.',
    what:'Stepping into an arch moves Pip to the other arch with the same letter. Crates never ride arches.',
    meta:'Exactly two <code>p</code> arches, or none. On a map, a pair on two different storeys is a gateway between isles.',
    tip:'Arches are great for “the goal is right there, but not from here”. Hide the twin somewhere surprising.' },
  'q': { code:'q', tags:['walk'], summary:'Arch B. A second, separate pair.',
    what:'Works like Arch A, paired only with the other <code>q</code>.',
    meta:'Exactly two, or none.',
    tip:'Two pairs let you build little loops. Make sure the player can tell the colours apart.' },

  // ---- maps only: Sky Scales ----
  'a': { code:'a', tags:['walk', 'maps'], summary:'Sky Scales pan A. The heavier pan sinks a level.',
    what:'Two pans hang from one vine. After each move, add up the weight on each pan (Pip 1, crate 1, stone-Pip 2, buoy −1, balloon-Pip 0). The heavier pan sits one level below its base, the lighter one level above, equal = both at base. Pip and crates ride along. A move is judged with the pan heights at its start.',
    meta:'Its height digit is the base, 1–4. If pan A exists, pan B must too. A pan can span several tiles, and the two pans can be on different storeys.',
    tip:'Park a crate on one pan to lift the other to a ledge you couldn’t reach, then work out how to get the crate back.' },
  'b': { code:'b', tags:['walk', 'maps'], summary:'Sky Scales pan B. The partner of pan A.',
    what:'The other side of the vine. See pan A.',
    meta:'Base height 1–4. Can’t be combined with water, ice, a plate, a crate, start, goal or key on the same tile.',
    tip:'Put the pans far apart so the player has to remember what’s weighing the other side down.' },
  'r': { code:'r', tags:['walk', 'maps'], summary:'Arch C. A third arch pair (maps only).',
    what:'Works like Arch A and B, paired only with the other <code>r</code>.',
    meta:'Exactly two, or none. Maps only.',
    tip:'On a three-isle map, give each link its own colour so the player builds a mental map.' },

  // ---- maps only: Weight II ----
  'B': { code:'B', tags:['walk', 'space', 'maps'], summary:'Balloon post. Space takes its one balloon.',
    what:'Use (Space) on the post to take its balloon. Holding it, Pip weighs 0: can’t push or press plates, is blown by gusts, and stepping off an edge becomes a glide, one level down per tile, landing on the first floor at exactly that height. Space anywhere else lets the balloon go, forever.',
    meta:'One balloon per post. Pip holds one thing at a time. Maps only.',
    tip:'A glide crosses gaps no crate can fill. Make the landing spot exact so the player has to count levels.' },
  'P': { code:'P', tags:['walk', 'space', 'maps'], summary:'Stone pile. Space takes a stone, or puts yours back.',
    what:'Holding a stone, Pip weighs 2: presses plates, sinks a pan, and can push a crate or buoy into the wind. A stone can only go back on a pile.',
    meta:'Maps only. Pip holds one thing at a time, so no stone and balloon together.',
    tip:'Weight 2 on one pan beats a crate on the other. Scales plus stones make good “which is heavier” puzzles.' },
  'u': { code:'u', tags:['push', 'maps'], summary:'Buoy. A crate on a balloon, weight −1.',
    what:'Pushed like a crate, but it floats up a one-level ledge and never drops down one. Pushed into water it floats as a stepping stone that never fills the water and only the wind can move. It presses no plates and lifts a pan.',
    meta:'Counts toward the 8 crates-and-buoys limit. Maps only.',
    tip:'The upside-down crate: use it where a crate would fall the wrong way.' },
  'vent': { code:'n e s w', tags:['walk', 'maps'], summary:'Gust vent. Blows light things one tile per move.',
    what:'Blows along a straight line over floor no higher than the vent, until a rock, tree, gate, door, ramp, the sky or the edge. After each move every light thing in the wind (balloon-Pip, and buoys Pip isn’t standing on) moves one tile downwind. A crate in the line shelters everything behind it.',
    meta:'<code>n</code> north · <code>e</code> east · <code>s</code> south · <code>w</code> west. Click the Vent tool again to turn it. Two gust lines may not cross. Pushing a crate or buoy into the wind needs a stone. Maps only.',
    tip:'A vent plus a balloon is a conveyor belt. A crate dropped into the line switches it off for everything behind.' },
  '+': { code:'+', tags:['walk', 'maps'], summary:'Seed. Optional collectible.',
    what:'Seeds never change the rules or par. The game also shows a seed par: the shortest clear that picks every seed.',
    meta:'At most 3. Maps only.',
    tip:'Put seeds just off the short route, so collecting them is its own little puzzle.' },

  // ---- maps only: cozy hazards ----
  'H': { code:'H', tags:['walk', 'maps'], summary:'Boulder ↔. Rolls east first, back and forth.',
    what:'Every move is one beat, and on each beat the boulder rolls one tile along its lane, bouncing at the ends. If it covers Pip’s tile (or swaps with Pip), Pip bonks and the move is undone. The game rings where hazards will be next. Space with nothing to use waits a beat.',
    meta:'The lane is the straight run of same-height floor through its tile. A lane of n tiles repeats every 2·(n−1) beats. Lanes may not cross, crates may not enter them, and all hazards must repeat together within 12 beats. Maps only.',
    tip:'Timing puzzles: make the player wait a beat (Space) or take a longer route to cross behind the boulder.' },
  'I': { code:'I', tags:['walk', 'maps'], summary:'Boulder ↕. Rolls south first, back and forth.',
    what:'Same as the ↔ boulder, rolling north–south.',
    meta:'Same lane and 12-beat rules as ↔. Maps only.',
    tip:'Two boulders on crossing paths are not allowed, but parallel lanes with different lengths make nice rhythms.' },
  'Y': { code:'Y', tags:['blocks', 'maps'], summary:'Thorn sweeper. Its arm turns a quarter each move.',
    what:'The bush is solid. Its arm reaches two tiles straight out, pointing north, then east, south, west, one quarter per beat (repeats every 4). The diagonals are never touched.',
    meta:'With a thorn on the isle, boulder lanes must be 2, 3, 4, 5 or 7 tiles (12-beat cycle). Crates can’t be in its reach, and Pip can’t start there. Maps only.',
    tip:'Put a thorn at a crossroads: the safe direction changes every move.' },
};

const GROUPS = [
  ['The grid', ['.', ',', '-', '^+', '^h']],
  ['Terrain', ['#', 'T', '~', '*', 'ramp']],
  ['Start & goal', ['S', 'G']],
  ['Pieces & switches', ['C', 'o', 'D', 'L', '=', '_', 'k', 'K', 'p', 'q']],
  ['Maps only: Sky Scales', ['a', 'b', 'r']],
  ['Maps only: Weight II', ['B', 'P', 'u', 'vent', '+']],
  ['Maps only: cozy hazards', ['H', 'I', 'Y']],
];
const TAG = { blocks:'blocks', walk:'walkable', push:'pushable', space:'Space', maps:'maps only' };

const card = (id, ico, label) => {
  const g = GUIDE[id];
  return `<div class="g-el" id="g-${encodeURIComponent(id)}">
    <div class="g-head"><span class="ico">${ico}</span><b>${label}</b><code>${g.code}</code>${g.tags.map(t => `<span class="g-tag ${t}">${TAG[t]}</span>`).join('')}</div>
    <p>${g.what}</p><p class="g-meta"><b>In the file:</b> ${g.meta}</p><p class="g-tip"><b>Try:</b> ${g.tip}</p></div>`;
};
const section = (title, body, open = false) => `<details class="g-sec"${open ? ' open' : ''}><summary>${title}</summary>${body}</details>`;

// tools: builder.js TOOLS ([id, icon, label]) — the palette is the source of icons and names.
export function buildGuideHtml(tools){
  const byId = new Map(tools.map(([id, ico, label]) => [id, [ico, label]]));
  const els = ids => ids.filter(id => byId.has(id) && GUIDE[id]).map(id => card(id, ...byId.get(id))).join('');
  return `<div class="guide">
    ${section('Quick start', `<ol>
      <li>Pick a <b>theme</b> and a <b>name</b>, or <b>Start from</b> a remix of an official isle.</li>
      <li>Paint one <b>Start</b> 🐣 and a <b>Goal</b> ⭐. Click or drag to paint; right-click (or the Erase tool) erases.</li>
      <li>Shape the isle with ground, sky and heights, then add one mechanic and build the puzzle around it.</li>
      <li>Watch the <b>verdict</b> under the grid: solvable or not, par (the fewest moves), and how hard it looks.</li>
      <li><b>▶ Test it</b> to play your own isle, then <b>Share online</b> or <b>Export for GitHub</b>.</li></ol>`, true)}
    ${section('How the grid works', `<p>Each cell is one tile: a character plus an optional <b>height</b> digit 0–5 (<code>.2</code> = ground two levels up).
      Row 0 is north (far from the camera), column 0 is west. Isles are 3–14 tiles wide and deep (the <b>Size</b> buttons).</p>
      <p>Pip walks onto floor at the same height, hops <b>down</b> one level, and climbs only with a <b>ramp</b>. A one-level drop is a one-way door.</p>${els(GROUPS[0][1])}`)}
    ${GROUPS.slice(1).map(([title, ids]) => section(title, (title.startsWith('Maps only') ? '<p class="g-meta">Any of these turns your isle into a <b>map</b> automatically (see Maps below).</p>' : '') + els(ids))).join('')}
    ${section('Maps: several isles in one', `<p>A map holds 1–3 isles (“storeys”). Add one with the <b>Map</b> chips and place it with <b>at</b>:
      x and z in map tiles (0–40), altitude in height levels (0–24).</p>
      <ul><li>Pip never walks off a storey’s edge. The only way between storeys is a <b>gateway</b>: an arch pair whose two arches stand on different storeys.</li>
      <li>Storeys that overlap on the map must float at least 8 levels apart.</li>
      <li>Exactly one start and at least one goal across the whole map, and at most 8 crates and buoys in all.</li>
      <li>Players press <b>M</b> to see the whole map.</li></ul>`)}
    ${section('Isle settings', `<ul><li><b>Name</b>: 3–40 letters, numbers or simple punctuation.</li>
      <li><b>Theme</b>: the look of the isle and sky. It never changes the rules.</li>
      <li><b>Difficulty</b>: your gut call, Breeze → Mythic. It starts the score, and real players’ results take over as they play (after about 20 plays it’s mostly theirs). The builder warns if your call and the solver disagree a lot.</li>
      <li><b>Start from</b>: a fresh meadow, or remix any official isle to see how it’s made.</li></ul>`)}
    ${section('Verdict, par & testing', `<ul><li>The <b>verdict</b> re-solves your isle as you paint (up to 60,000 positions). <b>Deep check</b> searches up to 300,000.</li>
      <li><b>Par</b> is the fewest moves that win. Players earn ★★★ by matching it.</li>
      <li>The difficulty panel shows how the solver sees your isle, plus <b>make it harder</b> ideas (block the straight line, add risky steps, narrow it to one clever route).</li>
      <li><b>▶ Test it</b> plays your draft. Your draft is saved in this browser as you go.</li></ul>`)}
    ${section('Sharing your isle', `<ul><li><b>Share online</b> (sign in with GitHub or Google): get a link anyone can play. The server checks it again before it goes live.</li>
      <li><b>Export for GitHub</b>: add your GitHub username for credit. If it passes every check, you get the file to add at <code>isles/community/&lt;you&gt;/&lt;id&gt;.json</code> in a pull request. Merged isles ship in the game.</li>
      <li>Community isles need a solution of at least 6 moves that uses a real mechanic (plain flat walking is rejected), and must not copy an existing isle.</li>
      <li><b>Isle code</b> is the same text format as the file. Edit it directly, or paste one in. <b>JSON</b> / <b>Import</b> save and load files.</li></ul>`)}
    ${section('Design tips', `<ul><li><b>One idea per isle.</b> Find the one surprising thing and cut everything that doesn’t serve it.</li>
      <li><b>Teach, then twist.</b> Let the player see the mechanic work once, then ask them to use it the other way round.</li>
      <li><b>Make the obvious route fail.</b> If walking straight at the star wins, block that line.</li>
      <li><b>Small is fine.</b> A 5×5 isle with one crate can be harder than a 14×14 sprawl, and it’s nicer to play.</li>
      <li><b>Test as a stranger.</b> Play your isle without remembering the answer. If the first move is a guess, add a clue.</li></ul>`)}
  </div>`;
}
