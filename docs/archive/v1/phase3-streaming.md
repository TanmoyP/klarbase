# Phase 3 — streaming strategy & the "past a few hundred cells" plan

Required reading alongside `client/src/world/roam.js` and `server/src/routes/world.js`.

## Streaming strategy

**The streaming unit is the cell, not the puzzle.** The client keeps a
Chebyshev radius **R=2** window around the avatar's current plot — at most a
5×5 = 25-cell neighbourhood, typically far fewer cells since the lattice is
sparse. On every plot boundary crossing, `streamAround(cx, cy)` fetches
`GET /api/world/cells?x&y&r=2`, loads what's new, and disposes what's now
beyond R+1 (geometry and materials are explicitly destroyed).

Three properties make this cheap forever:

1. **Content-addressed puzzles.** Cells reference puzzles by content hash, and
   puzzles are immutable once published. The client caches documents by hash
   in-session (and can later persist them in the Cache API / a service
   worker). Ten cells sharing one puzzle cost one fetch, ever. Refetching a
   cell you already rendered costs a lattice row, not a document.
2. **Local graphs, stitched — never global.** Each cell's traversal graph is
   built by `@klar/core` from its own puzzle (nodes ≲ 100). Stitching adds one
   edge per matched port pair on shared edges. There is no world-sized graph
   anywhere — not in memory, not in the DB.
3. **Illusions are plot-local by construction.** An illusion edge is a
   screen-space coincidence authored inside one puzzle, and seams never cross
   plot boundaries. This is what makes streaming *safe*: unloading a distant
   cell cannot break a seam, because no seam ever spanned cells. If we ever
   relax this, streaming becomes a consistency nightmare — don't.

Movement across a boundary is a single `port` edge in the merged graph; the
avatar tweens over it like any other step, and the cell change triggers the
next stream cycle.

## When the world grows past a few hundred cells

The honest answer: **the tech barely notices; the design does.** Breakdown:

- **Client: no change.** Load is O(R²) cells and O(1) puzzle fetches per cell
  crossing, regardless of world size. A million-plot world renders exactly
  like a ten-plot one. This is the whole point of radius streaming.
- **Lattice queries: fine by construction.** Cells are fetched by
  `(x BETWEEN … AND y BETWEEN …)` on the `@@id([x,y])` primary key. At 10⁵–10⁶
  rows this is trivial for Postgres; if we ever outgrow it, a range partition
  or a spatial index is a DBA afternoon, not a redesign.
- **The map view is the first thing that bends.** The current
  `GET /api/world/map` returns every claimed cell. That's a few KB at 10³
  cells, ~1 MB at 10⁵ — acceptable far longer than intuition says. When it
  stops being acceptable: switch the map to **slippy-map tiling**
  (`/api/world/map/:z/:x/:y` returning aggregate tiles at low zoom — claim
  density per tile, not individual cells). The client already renders from a
  generic cell list, so the swap is server-side.
- **Puzzle documents move to object storage when rows get fat.** `Puzzle.json`
  in Postgres is fine to ~10⁵ rows; past that, store documents in S3/R2 keyed
  by hash (they're immutable — perfect CDN citizens) and keep only metadata in
  the row. The API shape doesn't change.
- **Discovery is the real scaling problem.** Past a few hundred plots,
  "walk from genesis" stops being how anyone explores. This is a design
  track, not an engineering one: spawn selection (enter near recent activity
  or friends, not (0,0)), featured regions, and eventually fast-travel
  between claimed neighbourhoods. Phase 3 ships walk-from-genesis; Phase 4
  is discovery.

## What we deliberately did NOT build

- No mutation path for placed plots (immutability invariant — spec §13).
- No cross-plot illusion seams (see above).
- No unclaiming of empty plots yet (trivial to add; omitted to keep the
  mutation surface minimal while moderation is unproven).
- No ratings or browsing of the world by quality — meaningless until there's
  traffic.
