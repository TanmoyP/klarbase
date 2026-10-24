# Isles

Every isle is a small grid written as text. This folder holds the **community** isles —
`community/<github-username>/<id>.json` — which are bundled into the game with credit to
their author, `daily/YYYY-MM-DD.json` — hand-made Daily Isles — and `official/` — the
official isles (see [Official isles](#official-isles)). All three use the same format.

How to contribute one: press **Propose on GitHub** in the game's builder — it checks the isle
and opens a prefilled pull request on GitHub. Details: [CONTRIBUTING.md](../CONTRIBUTING.md).

## The format

```
"rows": [
  "-  ,1 G1 -",        row 0 = north (far from the camera)
  "-  .1 ^  -",        column 0 = west
  ".  C  .  ~",
  "S  ,  p  ."
]
```

Each token is **one tile character + an optional height digit** (`0`–`5`, default `0`).

| Tile | Meaning |
|---|---|
| `.` | ground |
| `,` | ground with flowers (decoration, walkable) |
| `S` | start (exactly one) |
| `G` | goal (at least one) |
| `#` | rock (blocks) |
| `T` | tree (blocks) |
| `~` | water (blocks — until a crate sinks into it) |
| `*` | ice (you keep sliding) |
| `^` `v` `<` `>` | stairs climbing one level toward that direction (N, S, W, E) |
| `C` | crate (on ground) |
| `o` | pressure plate |
| `D` | gate — open while **every** plate is pressed |
| `L` | lever — stand on it and press Use to flip all bridges |
| `=` | bridge that starts **up** |
| `_` | bridge that starts **down** |
| `k` | key |
| `K` | door (uses one key) |
| `p` `p` | a pair of portal arches |
| `q` `q` | a second pair of arches |
| `r` `r` | a third pair of arches (maps only) |
| `a` | Sky Scales pan A (maps only) — the height digit is its base, 1–4 |
| `b` | Sky Scales pan B (maps only) — the height digit is its base, 1–4 |
| `B` | balloon post (maps only) — holds one balloon; Use takes it |
| `P` | stone pile (maps only) — Use takes a stone, or puts yours back |
| `u` | buoy (maps only) — a crate on a balloon, weight −1 |
| `n` `e` `s` `w` | gust vent blowing north / east / south / west (maps only) |
| `+` | seed (maps only) — optional collectible, at most 3 |
| `H` | boulder rolling ↔ (maps only) — east first, back and forth along its lane |
| `I` | boulder rolling ↕ (maps only) — south first, back and forth along its lane |
| `Y` | thorn sweeper (maps only) — a solid bush whose arm turns a quarter clockwise each move |
| `-` | empty sky (no tile) |

Moves in a `solution`: `U` `D` `L` `R` = north / south / west / east, `X` = use (a lever, a
balloon post, a stone pile, or letting a balloon go — and on an isle with hazards, Use with
nothing to use **waits a beat**).

## Archipelago maps (schemaVersion 6)

A map holds **1 to 3 isles** ("storeys"), each its own grid (≤ 14×14), placed at
`at: [x, z, altitude]` — `x`/`z` in map tiles (0–40), `altitude` in height levels (0–24),
the same unit as the height digit. One storey can float directly above another; storeys
that share map tiles must be at least **8 levels** apart so the lower one stays readable.

```json
{
  "schemaVersion": 6,
  "theme": "jungle",
  "storeys": [
    { "at": [0, 0, 0],  "rows": ["S1 C1 b1", "p1 .1 .1"] },
    { "at": [0, 0, 10], "rows": ["p3 a2 .2 G2"] }
  ]
}
```

- Exactly one `S` and at least one `G` across the whole map; at most 8 crates in all.
- Movement never crosses a storey's edge. The only way between storeys is a **gateway**:
  an arch pair (`p`, `q` or `r`) whose two arches stand on different storeys. A pair on
  one storey is an ordinary arch. Crates never ride arches, so they never change storey.
- Pans (`a`, `b`), arch C (`r`), the Weight II tiles (`B P u n e s w +`) and the hazards (`H I Y`) exist only in maps. A one-storey map at `[0, 0, 0]` is
  fine when you want scales on a single isle.
- A v5 isle (`"rows"`) is valid forever and keeps its exact content hash.
- A pan is plain ground: one token can't be a pan and water, ice, a plate, a crate, a
  start, a goal or a key at once (`a~`, `Ca` … are rejected with a clear error).
- If one pan exists the other must too. Each pan can span several tiles.

### Difficulty: the `tier` field

An optional `"tier"` is the maker's **gut call**: `breeze` · `easy` · `tricky` · `hard` ·
`fiendish` · `mythic`. Every isle shows a score from 0 to 100 and its tier
(Breeze 0–15 · Easy 15–35 · Tricky 35–55 · Hard 55–72 · Fiendish 72–88 · Mythic 88–100):

```
score = (20 · prior + n · observed) / (20 + n)
```

- **prior** = the middle of the declared tier, or — when no tier is declared — an estimate from
  the solver audit (reachable positions, trap moves, whether walking toward the star wins, how
  many shortest routes). Never from tile counts or layout.
- **observed** = what players did, from anonymous per-isle totals: clear rate, hints and
  restarts per attempt, median moves over par, median time to clear. **n** = attempts.
- The card says **settling** until 20 people have played. `tier` is presentation, like `name`:
  it never changes the isle's hash. One function computes all of this:
  `difficultyScore()` in `core/src/isle/difficulty.js`.

### Daily Isles

`isles/daily/YYYY-MM-DD.json` holds a hand-made isle for that UTC date — same format, plus a
required `tier` and an optional `catch` (the designer's note, shown only after a clear).
Details: [`daily/README.md`](daily/README.md).

### Official isles

`official/chapters.json` lists the chapters in play order — `theme`, `title`, an `id` when the
chapter is keyed by id rather than theme (`gardens`, `windward`, `night`, `confluence`), a `blurb` — and
each chapter's `isles` (ids, in play order). Each isle is `official/<chapter-key>/<id>.json`,
where the chapter key is the chapter's `id`, else its `theme` (so Canopy is `official/jungle/`).
An isle in an id-keyed chapter says `"chapter": "<id>"`; Confluence isles also say which two
chapters they `"joins"`. Official isles carry their verified `par` and `solution` (plus `seedPar`
when seeds change the par), the `needs` the solution must use, an optional `twist: true`, and
`catch` — the designer's note on the one idea the isle is built around. Every catch is written
first, then the filler tiles are tuned with the solver until the catch is the only way through
(from Windward on, proven with `tools/isle-lab.mjs --must`).

The game never reads these files directly: `node tools/author.mjs` renders them into
`core/src/isle/official.js` and re-solves every one (par must be the shortest, the solution must
win, every `need` must be load-bearing). CI fails if that module is stale. `catch` and the
chapter lists are not shipped to players. Ids and order matter: per-isle stats are keyed by the
id and undated Daily Isles are picked from this order, so never rename or reorder one casually.

## The rules

1. Move one tile at a time. You can walk onto floor at the **same height**, **hop down** one
   level, or **climb with stairs** — never climb a ledge. Stairs only work along their slope.
2. Walk into a crate to **push** it (same height, or off a one-level ledge). A crate pushed
   into **water sinks** and becomes floor.
3. **Ice** keeps you — and crates — sliding until something stops you.
4. **Gates** are open while every plate is pressed, by you or a crate.
5. A **lever** flips every bridge. A crate on a sinking bridge drops in and stays as a block.
6. **Keys** open doors, one key each. Stepping into an **arch** sends you to its twin.
7. Reach a **goal** to clear the isle.

**Sky Scales** (maps only). Pans `a` and `b` hang from one vine. Pip weighs 1, a crate
weighs 1. After each move settles, add up what stands on each pan: the **heavier pan sits
one level below its base, the lighter one level above, equal = both at base**. Pip and
crates on a pan ride with it. There are no cascades, and a move is judged with the pan
heights at its **start** (like gates reading plates) — so you board a pan at the height it
had before you stepped on. The pans may be on different storeys.

**Weight II** (maps only). Pip holds **one** thing. Use (`X`) on what you stand on: a lever
flips it; a **balloon post** gives its one balloon; a **stone pile** gives a stone or takes yours
back (a stone goes back only on a pile). Use anywhere else while holding a balloon lets it go — forever.

| Pip holding | weight | plates | scales | in a gust | pushes | glides |
|---|---|---|---|---|---|---|
| nothing | 1 | presses | 1 | stands | yes | no |
| balloon | 0 | no | 0 | is blown | no | yes |
| stone | 2 | presses | 2 | stands | yes, even into the wind | no |

- **Glide:** with a balloon, a step you can't walk becomes a glide — Pip drifts on, one level lower
  per tile, and lands on the first floor exactly at that height. Something 1 tall in the way (rock,
  tree, ramp, closed gate or door, crate, buoy), water at the altitude, or nothing to land on = no move.
- **Buoys** weigh −1. They're pushed like crates but float **up** a one-level ledge and never drop
  down one. Pushed into water they float — a stepping stone that never fills it and that only the
  wind can move. They press no plates and lift a pan.
- **Gusts:** a vent blows along a fixed line — over floor no higher than the vent, until a rock,
  tree, gate, door, ramp, the sky or the isle's edge. A crate in the line shelters everything
  behind it (a crate on the vent caps it). After each move every **light** thing in the wind —
  balloon-Pip, and buoys Pip isn't standing on — moves one tile downwind if it can (never off an
  edge). Two gust lines may not cross. **Brace rule:** pushing a crate or buoy that stands in the
  wind *into* the wind needs weight 2 (a stone).
- **Seeds** are optional: they never change the rules or par. The game also shows a *seed par* —
  the shortest clear that picks every seed.

**Cozy hazards** (maps only). Every move is one **beat**; on each beat every boulder rolls one
tile and every thorn arm turns a quarter. Their timing never depends on what you do, and the
game rings every tile a hazard will cover after your next move.

- **Boulder** (`H` ↔, `I` ↕): its **lane** is the straight run of same-height floor through its
  tile (ground, flowers, goal, plate, ice, lever, vent, post, pile, seed — stopped by anything
  else, a height change or the edge). It rolls east (`H`) or south (`I`) first and bounces at the
  ends: a lane of *n* tiles repeats every 2·(*n* − 1) beats. Lanes may not cross (`E_HAZARD_LANE`).
- **Thorn sweeper** (`Y`): the bush is solid. Its arm reaches **two tiles** straight out — north
  first, then east, south, west, one quarter per beat (repeats every 4). The tiles between two
  arms (the diagonals) are never touched.
- **Bonk:** if after a move a hazard covers your tile — or you and a boulder swap tiles — Pip
  bonks and the move is **undone**: it doesn't count, nothing else moved.
- **Wait:** Use (`X`, Space) with nothing to use spends a beat standing still.
- Crates and buoys never enter a hazard's tiles (a lane or any tile an arm can reach), and none
  may start on one (`E_HAZARD_PIECE`). Pip may not start where a hazard is (`E_HAZARD_START`).
- **Cycle limit:** all hazards on an isle must repeat together within **12 beats**
  (`E_CYCLE`): boulder lanes of 2–7 tiles, and with a thorn on the isle, lanes of 2, 3, 4, 5 or 7.

These rules are implemented once, in `core/src/isle/rules.js`, and used by the game, the
solver, the PR checks and the server.

## For builder bots

The format is deliberately small enough to generate from a sentence. A generator should:
emit `rows` with the tiles above, then call `parseIsle` and `solveIsle` from `@klar/core` and
**repair or reject** anything that fails — never ship an unverified isle. `checkCommunityIsle`
gives the exact verdict CI uses.
