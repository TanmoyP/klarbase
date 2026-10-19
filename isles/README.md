# Isles

Every isle is a small grid written as text. This folder holds the **community** isles —
`community/<github-username>/<id>.json` — which are bundled into the game with credit to
their author, and `daily/YYYY-MM-DD.json` — hand-made Daily Isles. The official isles live in `core/src/isle/isles.js`.

How to contribute one: see [CONTRIBUTING.md](../CONTRIBUTING.md).

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
| `-` | empty sky (no tile) |

Moves in a `solution`: `U` `D` `L` `R` = north / south / west / east, `X` = use (pull a lever).

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

These rules are implemented once, in `core/src/isle/rules.js`, and used by the game, the
solver, the PR checks and the server.

## For builder bots

The format is deliberately small enough to generate from a sentence. A generator should:
emit `rows` with the tiles above, then call `parseIsle` and `solveIsle` from `@klar/core` and
**repair or reject** anything that fails — never ship an unverified isle. `checkCommunityIsle`
gives the exact verdict CI uses.
