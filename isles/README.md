# Isles

Every isle is a small grid written as text. This folder holds the **community** isles —
`community/<github-username>/<id>.json` — which are bundled into the game with credit to
their author. The official isles live in `core/src/isle/isles.js`.

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
| `r` `r` | a third pair of arches (maps only) |
| `a` | Sky Scales pan A (maps only) — the height digit is its base, 1–4 |
| `b` | Sky Scales pan B (maps only) — the height digit is its base, 1–4 |
| `-` | empty sky (no tile) |

Moves in a `solution`: `U` `D` `L` `R` = north / south / west / east, `X` = use (pull a lever).

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
- Pans (`a`, `b`) and arch C (`r`) exist only in maps. A one-storey map at `[0, 0, 0]` is
  fine when you want scales on a single isle.
- A v5 isle (`"rows"`) is valid forever and keeps its exact content hash.
- A pan is plain ground: one token can't be a pan and water, ice, a plate, a crate, a
  start, a goal or a key at once (`a~`, `Ca` … are rejected with a clear error).
- If one pan exists the other must too. Each pan can span several tiles.

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

These rules are implemented once, in `core/src/isle/rules.js`, and used by the game, the
solver, the PR checks and the server.

## For builder bots

The format is deliberately small enough to generate from a sentence. A generator should:
emit `rows` with the tiles above, then call `parseIsle` and `solveIsle` from `@klar/core` and
**repair or reject** anything that fails — never ship an unverified isle. `checkCommunityIsle`
gives the exact verdict CI uses.
