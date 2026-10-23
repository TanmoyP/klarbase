// @klar/core — the curated isles. 24 main-path puzzles + one Twist per chapter, in five themed
// chapters, plus the Hanging Gardens chapter of archipelago maps (schemaVersion 6),
// each verified by the solver (core/test/isles.mjs re-checks every
// one in CI): solvable, featured mechanics load-bearing, and `solution` is the
// solver's shortest key combo — so par is exact and the replay is guaranteed.
// Moves: U D L R = north/south/west/east, X = use (lever).
// `tier` is the designer's gut call (K3, core/src/isle/difficulty.js) — presentation only,
// never part of the hash. `twist:true` marks a chapter's optional Twist isle: built around a
// written catch (comment above it) to the Hard targets checked in core/test/difficulty.mjs.
//
// Generated once from the design harness; edit freely, then run
// `node core/test/isles.mjs` — it will tell you the new par and solution.

export const CHAPTERS = [{"theme":"jungle","title":"Canopy"},{"theme":"oasis","title":"Mirage"},{"theme":"tropical","title":"Lagoon"},{"theme":"urban","title":"Rooftops"},{"theme":"mountain","title":"Summit"},
  // Phase 2 (K1 + K4): a chapter keyed by id, not theme — its isles say `chapter:'gardens'`.
  {"id":"gardens","theme":"jungle","title":"Hanging Gardens","blurb":"Sky Scales and gateways: isles on vines, weighed against each other."},
  // Phase 3 (K1, K6, K9): Weight II — what Pip carries decides where Pip can go.
  {"id":"windward","theme":"mountain","title":"Windward","blurb":"Balloons, stones, buoys and gusts: what Pip carries decides where Pip can go."},
  // Phase 5: the combination layer — isles that fuse two chapters, opened by lighting both in Your Sky.
  {"id":"confluence","theme":"oasis","title":"Confluence","blurb":"Where two chapters meet: light both constellations to open each isle."}];

export const CURATED_ISLES = [
  // ---- Canopy (jungle) ----
  { id:'first-steps', name:'First Steps', theme:'jungle', par:4, solution:'URUU',
    needs:["walk:ramp"], tier:'breeze',
    hint:"Ramps only work along their slope. Find the one facing the goal.",
    rows:[
      '-  -  G1 -',
      '-  .  ^  -',
      ',  .  .  ,',
      '-  S  .  T',
    ] },
  { id:'ledge-drop', name:'Ledge Drop', theme:'jungle', par:11, solution:'URRRUUULLLL',
    needs:["walk:ramp","walk:down"], tier:'breeze',
    hint:"You can hop down a ledge, but never climb one. Take the high road.",
    rows:[
      'G  .  .1 .1 .1',
      '.  ,  .1 #  .1',
      '#  #  #  #  ^',
      ',  .  .  .  .',
      'T  S  .  ,  .',
    ] },
  { id:'mossy-crate', name:'Mossy Crate', theme:'jungle', par:9, solution:'URULDLUUU',
    needs:["push","sink"], tier:'breeze',
    hint:"A crate pushed into water sinks and becomes a stepping stone. Line it up first.",
    rows:[
      '-  G  #  -',
      '#  ~  #  #',
      '.  .  C  .',
      '.  ,  .  .',
      'T  .  S  ,',
    ] },
  { id:'root-bridge', name:'Root Bridge', theme:'jungle', par:12, solution:'RRUULLDLUUUU',
    needs:["push","sink","walk:down"], tier:'easy',
    hint:"Crates can be pushed off a ledge too. Choose where it lands.",
    rows:[
      ',  G  .  T  -',
      '.  .  .  .  -',
      '~  ~  #  #  #',
      '.1 .1 .1 C1 .1',
      'T  .1 .1 .1 ^',
      '-  .  S  .  .',
    ] },
  { id:'fern-gate', name:'Fern Gate', theme:'jungle', par:15, solution:'URRUULDRDLLLUUU',
    needs:["push","gate"], tier:'easy',
    hint:"Gates open while every plate is pressed — and you can only stand in one place.",
    rows:[
      '#  G  #  ,  T',
      '#  D  #  .  .',
      '.  .  .  C  .',
      'o  .  ,  .  .',
      'T  .  S  .  #',
    ] },
  // TWIST (Canopy) — the catch: the gate needs a crate on BOTH plates, but the east plate can
  // only be loaded by pushing north from the spring below it. A crate has to drown so you can
  // stand there — and the one that can reach the spring is the one you parked on the south
  // plate. Spend it, then refill that plate with the far-west crate. (Phase 1, K2: written first.)
  { id:'spring-lock', name:'Spring Lock', theme:'jungle', par:33, solution:'UURLULDLLLUURDLDRRDRRRRULLULDUUUU', twist:true,
    needs:["push","sink","gate"], tier:'fiendish',
    hint:"Two plates, three crates. Not every crate gets to keep its place.",
    rows:[
      '-  -  #  G  #  -  -',
      '-  #  #  D  #  .  -',
      '.  .  ~  .  .  ~  ,',
      '.  C  ~  .  ,  T  o',
      '.  .  .  C  .  C  .',
      '.  ~  .  o  .  .  ~',
      '-  ~  .  .  S  .  -',
    ] },
  // ---- Mirage (oasis) ----
  { id:'mirage', name:'Mirage', theme:'oasis', par:3, solution:'RRU',
    needs:["tp"], tier:'breeze',
    hint:"Step into an arch to appear at its twin.",
    rows:[
      '-  -  -  ,  G  .',
      '-  -  -  .  p  .',
      '~  ~  ~  ~  ~  ~',
      '.  T  .  -  -  -',
      'S  .  p  -  -  -',
    ] },
  { id:'twin-mirages', name:'Twin Mirages', theme:'oasis', par:7, solution:'RRUURUL',
    needs:["tp"], tier:'breeze',
    hint:"Two pairs of arches. Ride them in the right order.",
    rows:[
      'G  .  -  -  .  q',
      ',  q  -  -  .  .',
      '-  -  -  -  p  T',
      '-  .  .  -  -  -',
      'S  .  p  -  -  -',
    ] },
  { id:'sunken-well', name:'Sunken Well', theme:'oasis', par:8, solution:'RDDLUUUU',
    needs:["tp","push","sink"], tier:'easy',
    hint:"Arrive through the arch, then build your own way across.",
    rows:[
      '-  -  -  G  -',
      '-  -  -  ~  -',
      '.  .  -  .  p',
      '.  T  -  C  .',
      'S  p  -  .  .',
    ] },
  { id:'palm-plates', name:'Palm Plates', theme:'oasis', par:22, solution:'URRURUULDDRDLLLRRUULLU',
    needs:["push","gate"], tier:'tricky',
    hint:"One plate for the crate, one for you — so stand where the gate is close.",
    rows:[
      '#  G  #  .  .',
      '#  D  o  C  .',
      '.  .  #  .  .',
      'o  .  .  ,  .',
      'T  S  .  .  T',
    ] },
  // TWIST (Mirage) — the catch: the arches are a revolving door. The only way onto the east
  // plates' lane is out through one arch and back through the other, and crates can't ride
  // arches — so standing on a plate is useless: both east plates must hold crates, each pushed
  // from the one side that doesn't drive it into the spring, before you take the door home.
  { id:'revolving-arch', name:'Revolving Arch', theme:'oasis', par:30, solution:'DLLLRUUUURDLDDDLRRRULDLLULURUU', twist:true,
    needs:["tp","push","gate"], tier:'hard',
    hint:"Standing on a plate only helps if you can stay there.",
    rows:[
      '#  G  #  -  .  .  .',
      '#  D  .  -  .  C  .',
      '.  .  .  -  .  o  ~',
      '.  C  ~  -  o  C  S',
      '~  .  p  -  p  .  .',
    ] },
  // ---- Lagoon (tropical) ----
  { id:'tide-lever', name:'Tide Lever', theme:'tropical', par:7, solution:'UULXLUU',
    needs:["toggle"], tier:'breeze',
    hint:"Stand on the lever and press Use. Every bridge flips.",
    rows:[
      ',  G  .  T  -',
      '~  _  ~  ~  ~',
      '.  .  L  .  .',
      '~  ~  ~  =  ~',
      '-  T  .  S  .',
    ] },
  { id:'low-tide', name:'Low Tide', theme:'tropical', par:14, solution:'LUURXLUURXLLLL',
    needs:["toggle"], tier:'easy',
    hint:"Each flip raises one bridge and sinks another. Think two flips ahead.",
    rows:[
      'G  ,  =  .  L',
      '~  ~  ~  _  ~',
      '~  ~  ~  .  L',
      '~  ~  ~  =  ~',
      '-  T  .  .  S',
    ] },
  { id:'coconut-key', name:'Coconut Key', theme:'tropical', par:17, solution:'RRUDLLUURRRRLLLUU',
    needs:["key","door"], tier:'easy',
    hint:"Every door wants a key. Some keys want a bridge first.",
    rows:[
      ',  G  ,  -  -',
      '#  K  #  -  -',
      '.  .  .  ~  k',
      '.  T  C  ~  .',
      'S  .  .  ,  .',
    ] },
  { id:'lagoon-locks', name:'Lagoon Locks', theme:'tropical', par:16, solution:'RRRRRUULUURLLLLL',
    needs:["key","door"], tier:'easy',
    hint:"Two keys, three doors. One door is a trap.",
    rows:[
      'G  .  K  .  .  k',
      '#  #  #  #  K  #',
      '.  .  K  .  .  .',
      '.  #  #  #  #  .',
      'S  .  .  k  .  .',
    ] },
  // TWIST (Lagoon) — the catch: the lever raises the goal's bridge but sinks the west bridge,
  // your only way back north. A crate waiting on that bridge at the flip drops in and stays as
  // a step — but the one crate that can get there is walled in. First drown the other two in
  // the south springs to pave a path around it, push it onto the bridge, then pull the lever.
  { id:'sunken-step', name:'Sunken Step', theme:'tropical', par:35, solution:'LDDRRDLULDUUURDDDDLLULDLURRXLLUURUU', twist:true,
    needs:["push","sink","toggle","fall"], tier:'hard',
    hint:"A bridge that sinks with a crate on it keeps the crate.",
    rows:[
      '-  ,  G  ,  -  -  -',
      '.  #  _  #  .  S  -',
      '.  .  .  #  .  C  ~',
      '~  =  #  .  .  =  .',
      '~  .  C  L  .  C  .',
      '-  .  ~  .  .  ~  -',
    ] },
  // ---- Rooftops (urban) ----
  { id:'rooftops', name:'Rooftops', theme:'urban', par:14, solution:'UURRURDRUULLLL',
    needs:["walk:ramp","push"], tier:'easy',
    hint:"Clear the walkway — but never push the crate where you still need to walk.",
    rows:[
      'G3 <2 .2 .2 .2',
      '#  #  .1 .1 ^1',
      '.1 .1 C1 .1 .1',
      '^  #  #  .  .',
      'S  .  ,  .  .',
    ] },
  { id:'canal-lift', name:'Canal Lift', theme:'urban', par:8, solution:'URXLUUUU',
    needs:["toggle","fall"], tier:'easy',
    hint:"Both bridges must be up at once. A crate on a sinking bridge stays behind as a block.",
    rows:[
      '-  ,  G  T  -',
      '~  ~  _  ~  ~',
      '-  .  .  .  -',
      '~  ~  =  ~  ~',
      '-  .  C  L  -',
      '-  .  S  .  -',
    ] },
  { id:'subway', name:'Subway', theme:'urban', par:13, solution:'URRDRULDRRULL',
    needs:["tp","key","door"], tier:'easy',
    hint:"Ride the arches out for the key, then ride them home.",
    rows:[
      'G  K  .  -  q  .',
      '.  #  p  -  .  k',
      '-  -  -  -  -  -',
      '.  .  q  -  .  .',
      'S  .  .  .  p  .',
    ] },
  { id:'night-market', name:'Night Market', theme:'urban', par:17, solution:'RRURUULDRDDLUUULU',
    needs:["tp","push","gate"], tier:'easy',
    hint:"One plate here, one across the arches. The crate cannot travel — you can.",
    rows:[
      '#  G  #  -  .  .',
      '#  D  o  -  C  .',
      '.  .  .  -  o  .',
      '.  T  .  -  p  .',
      'S  .  p  -  -  -',
    ] },
  { id:'crosswalk', name:'Crosswalk', theme:'urban', par:24, solution:'ULULUURDRDDULDDRRRLUURUU',
    needs:["push","gate"], tier:'tricky',
    hint:"Two crates, two plates, and many ways to wedge a crate in a corner.",
    rows:[
      '.  .  .  #  G  #',
      '.  C  .  #  D  #',
      'o  .  .  .  .  .',
      '#  .  C  .  #  .',
      '.  .  S  .  .  o',
    ] },
  // TWIST (Rooftops) — the catch: crates only ever go DOWN. The first crate you can drop lands
  // right on the near street plate — but it is the only one that can ever reach the far plate,
  // so push it off and all the way down the street, then refill the near plate from the roof,
  // shuffling the rooftop crates so the one stair back up stays clear.
  { id:'street-drop', name:'Street Drop', theme:'urban', par:23, solution:'ULDRDLLLUURDULDDRLUUUUU', twist:true,
    needs:["walk:ramp","walk:down","push","gate"], tier:'hard',
    hint:"Crates can drop off a roof, but they never come back up.",
    rows:[
      '-  -  G2 -  -  -',
      '-  -  ^1 -  -  -',
      '.  .  D1 .1 .  .',
      '.  .  .1 .1 C1 .1',
      '.  .  ^  C1 C1 S1',
      '.  o  .  .  o  .',
    ] },
  // ---- Summit (mountain) ----
  { id:'first-frost', name:'First Frost', theme:'mountain', par:4, solution:'LURU',
    needs:["slide"], tier:'breeze',
    hint:"Ice keeps you sliding. Rocks are your brakes.",
    rows:[
      '#  #  G  #  #',
      '#  *  *  #  #',
      '.  *  #  *  .',
      '.  *  *  *  .',
      '.  .  S  .  .',
    ] },
  { id:'glacier-stops', name:'Glacier Stops', theme:'mountain', par:9, solution:'URDLDRULU',
    needs:["slide"], tier:'easy',
    hint:"Every slide ends at a rock. Choose your stops.",
    rows:[
      '-  -  -  -  G  -  -  -',
      '-  #  *  *  *  *  *  -',
      '-  *  #  *  *  *  *  -',
      '-  #  *  *  *  *  *  -',
      '-  *  *  *  *  *  #  -',
      '-  *  *  #  *  *  *  -',
      '-  *  *  *  *  *  *  -',
      '-  -  -  -  -  S  -  -',
    ] },
  { id:'snowball', name:'Snowball', theme:'mountain', par:11, solution:'RUUDLLLUURU',
    needs:["slide","push"], tier:'easy',
    hint:"No rock where you need one? Bring a crate.",
    rows:[
      '#  #  G  #  #  #',
      '.  *  *  *  *  .',
      '.  #  #  .  #  .',
      '.  ,  .  C  .  .',
      'T  .  S  .  .  #',
    ] },
  { id:'glacier-maze', name:'Glacier Maze', theme:'mountain', par:13, solution:'URURDLULURULU',
    needs:["slide"], tier:'easy',
    hint:"Count your stops — the shortest route zig-zags.",
    rows:[
      '-  G  -  -  -  -  -  -',
      '-  *  *  *  #  *  *  -',
      '-  #  *  *  *  *  *  -',
      '-  *  *  #  #  *  *  -',
      '-  *  *  *  *  *  *  -',
      '-  #  #  *  *  *  *  -',
      '-  *  *  *  *  *  #  -',
      '-  -  S  -  -  -  -  -',
    ] },
  { id:'frozen-gate', name:'Frozen Gate', theme:'mountain', par:19, solution:'URULDRRDRULLLURRULU',
    needs:["slide","gate"], tier:'tricky',
    hint:"Slide the crate onto the plate — the ice will carry it.",
    rows:[
      '#  G  #  #  #  #',
      '#  D  *  *  *  #',
      '#  *  *  #  *  #',
      '.  *  *  *  *  o',
      '.  C  .  .  .  #',
      '#  .  S  .  .  #',
    ] },
  { id:'the-peak', name:'The Peak', theme:'mountain', par:27, solution:'LLUDRRUULUULLLLRRRRRRUULLUU',
    needs:["push","tp","key","door","walk:ramp"], tier:'tricky',
    hint:"Everything you have learned, on one mountain.",
    rows:[
      '-  -  -  G3 -  k2 q2',
      '-  -  -  ^2 -  -  -',
      '-  -  .2 .2 K2 .2 -',
      '-  -  -  -  -  ^1 -',
      'q1 .1 .1 .1 .1 .1 -',
      '-  #  #  ^  #  #  -',
      '-  *  *  *  *  *  .',
      '-  .  C  #  .  .  .',
      '-  .  .  .  S  .  -',
    ] },
  // TWIST (Summit) — the catch: one push along the ice row glides a crate straight onto the
  // plate, but the only crate that can reach that row starts two rows away, and every push on
  // ice overshoots. Ferry it — with the other crate moved aside first — onto the single tile
  // that lines it up, then slide up the same ice to the gate.
  { id:'frost-ferry', name:'Frost Ferry', theme:'mountain', par:20, solution:'LDRURUUURDLULDRDLLUU', twist:true,
    needs:["slide","push","cslide","gate"], tier:'hard',
    hint:"On ice, a push is a promise: the crate goes until something stops it.",
    rows:[
      '#  #  G  #  #  #',
      '*  *  D  *  *  *',
      '#  .  *  .  C  *',
      '.  o  *  S  *  #',
      '*  *  .  C  .  .',
      '.  .  .  *  *  *',
    ] },
  // ---- Hanging Gardens (archipelago maps + Sky Scales, schemaVersion 6) ----
  // Each isle was designed around the catch written above it, then tuned with the
  // solver (tools/difficulty.mjs metrics) until par, traps and routes fit its tier.
  // CATCH: the pan to the star sinks under Pip alone. Weigh the other pan first — then
  // the near pan is lifted, so you must board it from the high ledge and ride it down.
  // The crate in front is in the way; the one behind it is the counterweight.
  { id:'counterweight', name:'Counterweight', theme:'jungle', chapter:'gardens', tier:'tricky', par:15, solution:'DRUURDLDRURRRUU',
    needs:["scales"],
    hint:"The near pan sinks under you alone. Weigh down the other one first.",
    storeys:[{ at:[0, 0, 0], rows:[
      'T3 .3 .3 -  -  G2',
      'T3 .3 .3 T3 -  .2',
      'S3 C3 C3 .3 a2 .2',
      '.3 .3 .3 b3 -  T2',
      '-  T3 .3 -  -  -',
    ] }] },
  // CATCH: the star is upstairs past a pan that sinks under you; its partner pan is
  // downstairs, and crates never ride an arch. Set the counterweight before you go up —
  // the short lane to the pan runs past a spring that would swallow the only crate.
  { id:'high-arch', name:'High Arch', theme:'tropical', chapter:'gardens', tier:'tricky', par:31, solution:'RRRUULLDDRRDDLLULURRRDRUDDULLUL',
    needs:["scales","gateway"],
    hint:"Crates can't take the arch. Whatever weighs the far pan must be set before you leave.",
    storeys:[
      { at:[0, 0, 0], rows:[
        '#1 .1 .1 .1 -',
        '-  C1 ~1 .1 b1',
        'S1 .1 .1 .1 .1',
        '.1 .1 -  .1 .1',
        '-  .1 .1 .1 p1',
      ] },
      { at:[1, 0, 10], rows:[
        'G2 .2 -  -',
        '-  a2 .3 .3',
        '-  T3 -  p3',
      ] },
    ] },
  // CATCH: three isles, and Pip starts in the middle. The arch up leads straight to the
  // high pan — which sinks under you, stranding you, unless the low pan two storeys down
  // was weighed first. Down first: one crate, a cramped yard, and the pan only takes it
  // pushed up from the south.
  { id:'three-storeys', name:'Three Storeys', theme:'tropical', chapter:'gardens', tier:'hard', par:46, solution:'UURUURRRUULLLDLDRRLUURRRDDDLULLDDLDDDRRRRDRRRU',
    needs:["scales","gateway"],
    hint:"The pan at the top answers to the pan at the bottom.",
    storeys:[
      { at:[0, 0, 0], rows:[
        '-  .1 .1 .1 .1',
        '.1 C1 -  b1 .1',
        '.1 .1 .1 .1 .1',
        '-  .1 T1 .1 .1',
        'p1 .1 .1 -  .1',
      ] },
      { at:[6, 0, 5], rows:[
        'p2 .2 -  -',
        '.2 #2 #2 -',
        'S2 -  -  -',
        '.2 .2 .2 q2',
      ] },
      { at:[2, 1, 14], rows:[
        'q4 .4 #4 -  G3',
        'T4 .4 .4 a3 .3',
      ] },
    ] },
  // CATCH: your own weight is in the way. The bridge pan must stay HIGH while you stand
  // on it: one crate on the far pan lifts it only until you step on — it takes two. And a
  // crate pushed along the far pan's row strands you on it when it sinks.
  { id:'own-weight', name:'Own Weight', theme:'jungle', chapter:'gardens', tier:'hard', par:23, solution:'RRDDLLDRRULLURRURDURRRU',
    needs:["scales"],
    hint:"One crate lifts the bridge — until you step on it. You weigh as much as a crate.",
    storeys:[{ at:[0, 0, 0], rows:[
      '#3 #3 -  -  -  -  -',
      '-  -  .3 .3 -  -  G3',
      'S3 .3 .3 .3 a2 .3 .3',
      'C3 C3 .3 .3 -  -  -',
      '.3 .3 .3 b3 -  -  -',
      '.3 C3 .3 b3 -  -  -',
    ] }] },
  // CATCH: no push ever lifts a crate — but a pan can. Park the upstairs crate on its pan
  // while the pan is level, THEN weigh the downstairs pan with two crates: the crate rides
  // up to the spring's height and you can tip it in. In the wrong order the raised pan
  // takes no crate (and a loaded crate sinks its pan, lifting the far one out of reach).
  { id:'the-crane', name:'The Crane', theme:'jungle', chapter:'gardens', tier:'hard', par:38, solution:'URRDRDDRDDRLUULUULURLLLDRRRLLDLDLLUUUU',
    needs:["scales","gateway","sink"],
    hint:"No push can lift a crate. A pan can — if it's loaded before the other side is.",
    storeys:[
      { at:[0, 0, 0], rows:[
        '.2 T2 T2 #2 #2',
        '.2 C2 .2 .2 b1',
        'S2 C2 .2 .2 b1',
        '.2 .2 C2 .2 #2',
        'p2 T2 T2 .2 q2',
      ] },
      { at:[0, 0, 11], rows:[
        '-  -  G3 -  -',
        'q2 -  .3 -  -',
        '.2 -  ~3 -  -',
        '.2 C2 a2 -  -',
        '-  #2 .3 .3 p3',
      ] },
    ] },
  // CATCH: the far pan sits past a spring, at the end of the only lane a crate can
  // travel. The first crate down that lane is lost to the spring — spend it, and the next
  // one rolls across onto the pan. Weighed, the bridge pan meets you at your height and
  // settles to the star's; unweighed, it sinks under you.
  { id:'spend-a-crate', name:'Spend a Crate', theme:'jungle', chapter:'gardens', tier:'fiendish', par:31, solution:'URRRURDDULLDLDDRUULURRURDDDURRU',
    needs:["scales","sink"],
    hint:"The spring keeps the first crate it gets. Make it worth it.",
    storeys:[{ at:[0, 0, 0], rows:[
      '.2 C2 .2 .2 .2 -  -',
      '.2 C2 .2 .2 .2 -  G1',
      'S2 .2 .2 -  .2 a1 .1',
      '~2 .2 C2 ~2 ~2 -  -',
      '~2 .2 .2 ~2 b2 -  -',
      '~2 .2 .2 .2 .2 -  -',
    ] }] },
  // CATCH: pans on different isles, and both isles crowded. Downstairs only one crate has
  // a clean run at the low pan, from the west; upstairs two crates hem in the arch and the
  // bridge pan — clear them without parking one on the pan, whose weight would sink it.
  { id:'garden-lift', name:'Garden Lift', theme:'tropical', chapter:'gardens', tier:'fiendish', par:27, solution:'RDRRURRUULLLDRDDLLDLRUURRRU',
    needs:["scales","gateway"],
    hint:"Only one crate downstairs can reach the pan. Which one, and from where?",
    storeys:[
      { at:[0, 0, 0], rows:[
        '.1 C1 .1 .1 .1 .1',
        '.1 T1 .1 .1 b1 .1',
        'S1 .1 -  C1 .1 .1',
        'C1 .1 .1 .1 .1 .1',
        'p1 .1 T1 .1 .1 .1',
      ] },
      { at:[1, 1, 10], rows:[
        '-  .3 -  -  G2',
        '.3 C3 .3 a2 .2',
        '#3 .3 .3 -  -',
        'p3 C3 .3 -  -',
      ] },
    ] },
  // CATCH (the chapter's signature): the pans hang on different isles. Load the LOWER
  // isle to lift the upper one — but the low pan only takes a crate pushed up from below,
  // and the crates crowding the upper isle must be cleared without blocking the pan.
  { id:'sky-scales', name:'Sky Scales', theme:'tropical', chapter:'gardens', tier:'mythic', par:43, solution:'DRRUUURRRDDLDLRURUULLLDDRDRULLDLLDUUURDRRRU',
    needs:["scales","gateway"],
    hint:"Load the lower isle to lift the upper one.",
    storeys:[
      { at:[0, 0, 0], rows:[
        '.1 -  .1 .1 .1 .1',
        '.1 C1 .1 -  b1 .1',
        'S1 T1 .1 C1 .1 .1',
        '.1 C1 .1 .1 .1 -',
        'p1 -  .1 -  -  T1',
      ] },
      { at:[1, 1, 10], rows:[
        '.3 C3 .3 -  G2',
        '.3 C3 .3 a2 .2',
        '.3 .3 #3 -  T2',
        'p3 T3 #3 -  -',
      ] },
    ] },
  // ---- Windward (Phase 3, Weight II: K1, K6, K9) — maps of one storey: balloons, stones, buoys, gusts, seeds ----
  // catch: Intro: a balloon turns a step into the sky into a glide.
  { id:'lift-off', name:'Lift Off', theme:'mountain', chapter:'windward', tier:'breeze', par:6, solution:'RRXRRR', seedPar:8,
    needs:["take","glide"],
    hint:'Stand on the post and press Use to take its balloon. Then step off the edge.',
    storeys:[{ at:[0, 0, 0], rows:[
      '-  ,3 .3 -  -  -  -',
      'S3 .3 B3 .3 -  .1 G1',
      '-  .3 ,3 -  -  .1 +1',
    ] }] },
  // catch: You need the balloon for the glide, then must let it go to weigh enough for the plate.
  { id:'let-it-go', name:'Let It Go', theme:'mountain', chapter:'windward', tier:'easy', par:8, solution:'RXRRRXRR',
    needs:["take","glide","release","gate"],
    hint:'A balloon weighs nothing — not even enough to press a plate.',
    storeys:[{ at:[0, 0, 0], rows:[
      '-  ,3 -  -  -  -  -  -',
      'S3 B3 .3 -  .1 o1 D1 G1',
      '-  .3 .3 -  ,1 .1 -  -',
    ] }] },
  // catch: The crate you must clear lands on the other pan; only stone-Pip outweighs it and rides low enough to hop off.
  { id:'heavy-heart', name:'Heavy Heart', theme:'mountain', chapter:'windward', tier:'easy', par:8, solution:'RRXDRDRR',
    needs:["take","push","scales"],
    hint:'A stone weighs two. Take one from the pile before you ride the scales.',
    storeys:[{ at:[0, 0, 0], rows:[
      'S3 .3 P3 -  -  -',
      '-  .3 C3 .3 -  -',
      '-  -  b2 a2 .  G',
    ] }] },
  // catch: The crate fills the low spring; only the buoy can rise to the high one.
  { id:'buoy-bay', name:'Buoy Bay', theme:'tropical', chapter:'windward', tier:'easy', par:12, solution:'RRUUDLLUURRR', seedPar:14,
    needs:["push","sink","float"],
    hint:'Buoys float up a step that crates can’t climb — and they float on water.',
    storeys:[{ at:[0, 0, 0], rows:[
      '.1 .1 ~1 G1',
      '^  T  u  .',
      '~  C  .  .',
      'S  .  .  +',
    ] }] },
  // catch: Both crates must be in the spring before you touch the balloon on the way past.
  { id:'glide-or-push', name:'Glide or Push', theme:'mountain', chapter:'windward', tier:'tricky', par:21, solution:'RDRRDRULLURRLLXRRRRRR',
    needs:["push","sink","take","glide"],
    hint:'Holding a balloon, Pip is too light to push anything.',
    storeys:[{ at:[0, 0, 0], rows:[
      '-  .3 .3 T3 .3 .3 -  -  -  -',
      'S3 .3 B3 C3 ~3 ~3 .3 -  .1 G1',
      '-  .3 .3 C3 .3 #3 .3 -  ,1 -',
      '-  -  .3 .3 .3 -  -  -  -  -',
    ] }] },
  // catch: Cap the vent with the crate from behind, and only then take the balloon.
  { id:'tailwind', name:'Tailwind', theme:'oasis', chapter:'windward', tier:'tricky', par:25, solution:'RUURRRRRDULLLLLDDXRRRRDDD',
    needs:["push","take","glide"],
    hint:'With a balloon you can’t walk into the wind. Quiet the vent first.',
    storeys:[{ at:[0, 0, 0], rows:[
      '-  .3 .3 .3 .3 .3 .3',
      '-  .3 -  -  -  -  C3',
      'S3 B3 .3 .3 .3 .3 w3',
      '-  -  -  -  -  .3 -',
      '-  -  -  -  -  -  -',
      '-  -  -  -  ,1 .1 -',
      '-  -  -  -  -  G1 -',
    ] }] },
  // catch: The crate on B lifts A only while the buoy rides A with Pip.
  { id:'ballast', name:'Ballast', theme:'tropical', chapter:'windward', tier:'tricky', par:14, solution:'RDDRUULLUURRRR',
    needs:["push","scales"],
    hint:'A buoy on a pan lifts it. Pip and a buoy together weigh nothing.',
    storeys:[{ at:[0, 0, 0], rows:[
      '.3 .3 a2 .3 G3',
      '^2 -  a2 -  -',
      'S2 .2 u2 .2 -',
      '-  .2 .2 .2 -',
      '-  .2 C2 b2 -',
    ] }] },
  // catch: Push the buoy in, then shelter the gust at the exact move the buoy reaches the crossing.
  { id:'drift', name:'Drift', theme:'tropical', chapter:'windward', tier:'hard', par:15, solution:'RRRRDULDRRRRDDD', seedPar:19,
    needs:["push","gust","float"],
    hint:'The wind carries the buoy. A crate in the gust stills the wind behind it.',
    storeys:[{ at:[0, 0, 0], rows:[
      'S  .  .  .  .  -  -  .  +  -  -',
      '.  .  .  C  u  .  .  .  .  .  #',
      'e  ~  ~  .  ~  ~  ~  ~  ~  ~  #',
      '#  #  #  #  #  #  #  .  #  #  #',
      '-  -  -  -  -  -  -  G  -  -  -',
    ] }] },
  // catch: Stone-Pip caps one gust and loads the plate; the stone must go back before the balloon can come out.
  { id:'brace', name:'Brace', theme:'mountain', chapter:'windward', tier:'hard', par:33, solution:'DLXRRURRRLLLDRLLLXRUULXRDRRRRDDDD',
    needs:["take","drop","push","gate","glide"],
    hint:'Only a stone is heavy enough to push into the wind. Hands full? A pile takes it back.',
    storeys:[{ at:[0, 0, 0], rows:[
      'B3 D3 -  -  -  -  -',
      '-  S3 .3 C3 .3 .3 w3',
      'P3 .3 C3 .3 o3 .3 w3',
      '-  -  -  -  -  .3 -',
      '-  -  -  -  -  -  -',
      '-  -  -  -  -  .1 -',
      '-  -  -  -  -  G1 -',
    ] }] },
  // catch: A crate on A (pushed into the wind, so: stone) lifts balloon-Pip’s pan B to the one height the glide can reach from —
  // and a second crate must stand beside B, or the gust blows balloon-Pip straight off it.
  { id:'windward', name:'Windward', theme:'mountain', chapter:'windward', tier:'fiendish', par:28, solution:'DXRRRDURLLLLXRDDLXRUURRDRDDD',
    needs:["take","drop","push","scales","glide"],
    hint:'Height is range: the higher the pan, the farther the glide.',
    storeys:[{ at:[0, 0, 0], rows:[
      'S3 .3 .3 .3 .3 -  -',
      'P3 .3 C3 .3 .3 a2 w3',
      'T3 .3 #3 C3 .3 -  -',
      'B3 .3 .3 .3 b2 w3 -',
      '-  -  -  -  -  -  -',
      '-  -  -  -  -  -  -',
      '-  -  -  -  .  -  -',
      '-  -  -  ,  G  -  -',
    ] }] },

  // ---- Confluence (Phase 5): two chapters' mechanics in one isle. Existing tiles only; each
  // opens once both joined constellations are lit (sky.js). Designed by isle-smith, every catch
  // proven with `isle-lab --must` (both families load-bearing).
  // catch: The glacier loops through its arches, so nothing stops you under the star. Crates can't ride
  // arches: sink one crate to reach the other, then shove it east to park at the far arch.
  { id:'frost-mirage', name:'Frost Mirage', theme:'mountain', chapter:'confluence', joins:['oasis', 'mountain'], tier:'tricky', par:17, solution:'URDRLDDRDRUUULURU',
    needs:["tp","slide","cslide","sink"],
    hint:'An arch catches whatever the ice carries, but only you go through.',
    rows:[
      '-  -  -  -  G  -  -',
      'p  *  *  *  *  *  p',
      '.  C  .  S  -  -  -',
      '.  -  ~  -  -  -  -',
      '.  C  .  .  -  -  -',
      '.  .  .  -  -  -  -',
    ] },
  // catch: The lever lifts the star's bridge but sinks the gangway, the only high ground beside pan A.
  // Leave a crate on it to keep a step, weigh pan B with the other, then board the pan and ride down.
  { id:'drowned-gangway', name:'Drowned Gangway', theme:'tropical', chapter:'confluence', joins:['tropical', 'gardens'], tier:'hard', par:23, solution:'RULULLDRDRURXLLURLLLLLL',
    needs:["toggle","fall","scales","push"],
    hint:'Two crates, two jobs: one to weigh, one to stand on.',
    storeys:[{ at:[0, 0, 0], rows:[
      '-  -  -  -  .3 .3 .3 .3',
      'G2 _2 a2 =3 .3 C3 .3 b3',
      '-  -  -  -  .3 .3 C3 L3',
      '-  -  -  -  -  .3 S3 .3',
    ] }] },
  // catch: The crate above the star can only slide downwind, onto the post: drop a crate in the lane
  // first to stop it. Then, balloon in hand, slide onto the vent and let the gust set you on the launch tile.
  { id:'squall-line', name:'Squall Line', theme:'mountain', chapter:'confluence', joins:['mountain', 'windward'], tier:'fiendish', par:20, solution:'DDRURDLLULDXURDRURDD',
    needs:["slide","cslide","take","gust","glide"],
    hint:'On ice you never stop where you’d like, but the wind always gets the last word.',
    storeys:[{ at:[0, 0, 0], rows:[
      ',3 S3 .3 .3 .3 ,3',
      '*3 *3 *3 C3 *3 *3',
      '*3 C3 *3 *3 #3 *3',
      'B3 *3 *3 *3 C3 w3',
      '-  -  -  -  -  -',
      '-  -  -  -  G1 -',
    ] }] },
];

export const isleById = id => CURATED_ISLES.find(i => i.id === id) || null;
