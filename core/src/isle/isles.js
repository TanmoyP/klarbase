// @klar/core — the curated isles. Hand-designed puzzles in themed chapters
// (the sixth, Hanging Gardens, uses archipelago maps), each verified by the solver (core/test/isles.mjs re-checks every
// one in CI): solvable, featured mechanics load-bearing, and `solution` is the
// solver's shortest key combo — so par is exact and the replay is guaranteed.
// Moves: U D L R = north/south/west/east, X = use (lever).
//
// Generated once from the design harness; edit freely, then run
// `node core/test/isles.mjs` — it will tell you the new par and solution.

export const CHAPTERS = [{"theme":"jungle","title":"Canopy"},{"theme":"oasis","title":"Mirage"},{"theme":"tropical","title":"Lagoon"},{"theme":"urban","title":"Rooftops"},{"theme":"mountain","title":"Summit"},
  // Phase 2 (K1 + K4): a chapter keyed by id, not theme — its isles say `chapter:'gardens'`.
  {"id":"gardens","theme":"jungle","title":"Hanging Gardens","blurb":"Sky Scales and gateways: isles on vines, weighed against each other."}];

export const CURATED_ISLES = [
  // ---- Canopy (jungle) ----
  { id:'first-steps', name:'First Steps', theme:'jungle', par:4, solution:'URUU',
    needs:["walk:ramp"],
    hint:"Ramps only work along their slope. Find the one facing the goal.",
    rows:[
      '-  -  G1 -',
      '-  .  ^  -',
      ',  .  .  ,',
      '-  S  .  T',
    ] },
  { id:'ledge-drop', name:'Ledge Drop', theme:'jungle', par:11, solution:'URRRUUULLLL',
    needs:["walk:ramp","walk:down"],
    hint:"You can hop down a ledge, but never climb one. Take the high road.",
    rows:[
      'G  .  .1 .1 .1',
      '.  ,  .1 #  .1',
      '#  #  #  #  ^',
      ',  .  .  .  .',
      'T  S  .  ,  .',
    ] },
  { id:'mossy-crate', name:'Mossy Crate', theme:'jungle', par:9, solution:'URULDLUUU',
    needs:["push","sink"],
    hint:"A crate pushed into water sinks and becomes a stepping stone. Line it up first.",
    rows:[
      '-  G  #  -',
      '#  ~  #  #',
      '.  .  C  .',
      '.  ,  .  .',
      'T  .  S  ,',
    ] },
  { id:'root-bridge', name:'Root Bridge', theme:'jungle', par:12, solution:'RRUULLDLUUUU',
    needs:["push","sink","walk:down"],
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
    needs:["push","gate"],
    hint:"Gates open while every plate is pressed — and you can only stand in one place.",
    rows:[
      '#  G  #  ,  T',
      '#  D  #  .  .',
      '.  .  .  C  .',
      'o  .  ,  .  .',
      'T  .  S  .  #',
    ] },
  // ---- Mirage (oasis) ----
  { id:'mirage', name:'Mirage', theme:'oasis', par:3, solution:'RRU',
    needs:["tp"],
    hint:"Step into an arch to appear at its twin.",
    rows:[
      '-  -  -  ,  G  .',
      '-  -  -  .  p  .',
      '~  ~  ~  ~  ~  ~',
      '.  T  .  -  -  -',
      'S  .  p  -  -  -',
    ] },
  { id:'twin-mirages', name:'Twin Mirages', theme:'oasis', par:7, solution:'RRUURUL',
    needs:["tp"],
    hint:"Two pairs of arches. Ride them in the right order.",
    rows:[
      'G  .  -  -  .  q',
      ',  q  -  -  .  .',
      '-  -  -  -  p  T',
      '-  .  .  -  -  -',
      'S  .  p  -  -  -',
    ] },
  { id:'sunken-well', name:'Sunken Well', theme:'oasis', par:8, solution:'RDDLUUUU',
    needs:["tp","push","sink"],
    hint:"Arrive through the arch, then build your own way across.",
    rows:[
      '-  -  -  G  -',
      '-  -  -  ~  -',
      '.  .  -  .  p',
      '.  T  -  C  .',
      'S  p  -  .  .',
    ] },
  { id:'palm-plates', name:'Palm Plates', theme:'oasis', par:22, solution:'URRURUULDDRDLLLRRUULLU',
    needs:["push","gate"],
    hint:"One plate for the crate, one for you — so stand where the gate is close.",
    rows:[
      '#  G  #  .  .',
      '#  D  o  C  .',
      '.  .  #  .  .',
      'o  .  .  ,  .',
      'T  S  .  .  T',
    ] },
  // ---- Lagoon (tropical) ----
  { id:'tide-lever', name:'Tide Lever', theme:'tropical', par:7, solution:'UULXLUU',
    needs:["toggle"],
    hint:"Stand on the lever and press Use. Every bridge flips.",
    rows:[
      ',  G  .  T  -',
      '~  _  ~  ~  ~',
      '.  .  L  .  .',
      '~  ~  ~  =  ~',
      '-  T  .  S  .',
    ] },
  { id:'low-tide', name:'Low Tide', theme:'tropical', par:14, solution:'LUURXLUURXLLLL',
    needs:["toggle"],
    hint:"Each flip raises one bridge and sinks another. Think two flips ahead.",
    rows:[
      'G  ,  =  .  L',
      '~  ~  ~  _  ~',
      '~  ~  ~  .  L',
      '~  ~  ~  =  ~',
      '-  T  .  .  S',
    ] },
  { id:'coconut-key', name:'Coconut Key', theme:'tropical', par:17, solution:'RRUDLLUURRRRLLLUU',
    needs:["key","door"],
    hint:"Every door wants a key. Some keys want a bridge first.",
    rows:[
      ',  G  ,  -  -',
      '#  K  #  -  -',
      '.  .  .  ~  k',
      '.  T  C  ~  .',
      'S  .  .  ,  .',
    ] },
  { id:'lagoon-locks', name:'Lagoon Locks', theme:'tropical', par:16, solution:'RRRRRUULUURLLLLL',
    needs:["key","door"],
    hint:"Two keys, three doors. One door is a trap.",
    rows:[
      'G  .  K  .  .  k',
      '#  #  #  #  K  #',
      '.  .  K  .  .  .',
      '.  #  #  #  #  .',
      'S  .  .  k  .  .',
    ] },
  // ---- Rooftops (urban) ----
  { id:'rooftops', name:'Rooftops', theme:'urban', par:14, solution:'UURRURDRUULLLL',
    needs:["walk:ramp","push"],
    hint:"Clear the walkway — but never push the crate where you still need to walk.",
    rows:[
      'G3 <2 .2 .2 .2',
      '#  #  .1 .1 ^1',
      '.1 .1 C1 .1 .1',
      '^  #  #  .  .',
      'S  .  ,  .  .',
    ] },
  { id:'canal-lift', name:'Canal Lift', theme:'urban', par:8, solution:'URXLUUUU',
    needs:["toggle","fall"],
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
    needs:["tp","key","door"],
    hint:"Ride the arches out for the key, then ride them home.",
    rows:[
      'G  K  .  -  q  .',
      '.  #  p  -  .  k',
      '-  -  -  -  -  -',
      '.  .  q  -  .  .',
      'S  .  .  .  p  .',
    ] },
  { id:'night-market', name:'Night Market', theme:'urban', par:17, solution:'RRURUULDRDDLUUULU',
    needs:["tp","push","gate"],
    hint:"One plate here, one across the arches. The crate cannot travel — you can.",
    rows:[
      '#  G  #  -  .  .',
      '#  D  o  -  C  .',
      '.  .  .  -  o  .',
      '.  T  .  -  p  .',
      'S  .  p  -  -  -',
    ] },
  { id:'crosswalk', name:'Crosswalk', theme:'urban', par:24, solution:'ULULUURDRDDULDDRRRLUURUU',
    needs:["push","gate"],
    hint:"Two crates, two plates, and many ways to wedge a crate in a corner.",
    rows:[
      '.  .  .  #  G  #',
      '.  C  .  #  D  #',
      'o  .  .  .  .  .',
      '#  .  C  .  #  .',
      '.  .  S  .  .  o',
    ] },
  // ---- Summit (mountain) ----
  { id:'first-frost', name:'First Frost', theme:'mountain', par:4, solution:'LURU',
    needs:["slide"],
    hint:"Ice keeps you sliding. Rocks are your brakes.",
    rows:[
      '#  #  G  #  #',
      '#  *  *  #  #',
      '.  *  #  *  .',
      '.  *  *  *  .',
      '.  .  S  .  .',
    ] },
  { id:'glacier-stops', name:'Glacier Stops', theme:'mountain', par:9, solution:'URDLDRULU',
    needs:["slide"],
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
    needs:["slide","push"],
    hint:"No rock where you need one? Bring a crate.",
    rows:[
      '#  #  G  #  #  #',
      '.  *  *  *  *  .',
      '.  #  #  .  #  .',
      '.  ,  .  C  .  .',
      'T  .  S  .  .  #',
    ] },
  { id:'glacier-maze', name:'Glacier Maze', theme:'mountain', par:13, solution:'URURDLULURULU',
    needs:["slide"],
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
    needs:["slide","gate"],
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
    needs:["push","tp","key","door","walk:ramp"],
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
  // ---- Hanging Gardens (archipelago maps + Sky Scales, schemaVersion 6) ----
  // Each isle was designed around the catch written above it, then tuned with the
  // solver (tools/difficulty.mjs metrics) until par, traps and routes fit its tier.
  // CATCH: the pan to the star sinks under Pip alone. Weigh the other pan first — then
  // the near pan is lifted, so you must board it from the high ledge and ride it down.
  // The crate in front is in the way; the one behind it is the counterweight.
  { id:'counterweight', name:'Counterweight', theme:'jungle', chapter:'gardens', tier:'Tricky', par:15, solution:'DRUURDLDRURRRUU',
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
  { id:'high-arch', name:'High Arch', theme:'tropical', chapter:'gardens', tier:'Tricky', par:31, solution:'RRRUULLDDRRDDLLULURRRDRUDDULLUL',
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
  // CATCH: your own weight is in the way. The bridge pan must stay HIGH while you stand
  // on it: one crate on the far pan lifts it only until you step on — it takes two. And a
  // crate pushed along the far pan's row strands you on it when it sinks.
  { id:'own-weight', name:'Own Weight', theme:'jungle', chapter:'gardens', tier:'Hard', par:23, solution:'RRDDLLDRRULLURRURDURRRU',
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
  { id:'the-crane', name:'The Crane', theme:'jungle', chapter:'gardens', tier:'Hard', par:38, solution:'URRDRDDRDDRLUULUULURLLLDRRRLLDLDLLUUUU',
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
  { id:'spend-a-crate', name:'Spend a Crate', theme:'jungle', chapter:'gardens', tier:'Fiendish', par:31, solution:'URRRURDDULLDLDDRUULURRURDDDURRU',
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
  { id:'garden-lift', name:'Garden Lift', theme:'tropical', chapter:'gardens', tier:'Fiendish', par:27, solution:'RDRRURRUULLLDRDDLLDLRUURRRU',
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
  // CATCH: three isles, and Pip starts in the middle. The arch up leads straight to the
  // high pan — which sinks under you, stranding you, unless the low pan two storeys down
  // was weighed first. Down first: one crate, a cramped yard, and the pan only takes it
  // pushed up from the south.
  { id:'three-storeys', name:'Three Storeys', theme:'tropical', chapter:'gardens', tier:'Hard', par:46, solution:'UURUURRRUULLLDLDRRLUURRRDDDLULLDDLDDDRRRRDRRRU',
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
  // CATCH (the chapter's signature): the pans hang on different isles. Load the LOWER
  // isle to lift the upper one — but the low pan only takes a crate pushed up from below,
  // and the crates crowding the upper isle must be cleared without blocking the pan.
  { id:'sky-scales', name:'Sky Scales', theme:'tropical', chapter:'gardens', tier:'Mythic', par:43, solution:'DRRUUURRRDDLDLRURUULLLDDRDRULLDLLDUUURDRRRU',
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
];

export const isleById = id => CURATED_ISLES.find(i => i.id === id) || null;
