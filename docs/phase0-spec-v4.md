# Phase 0 — Consolidated Design Spec (schemaVersion 4, revision 4.1)

Supersedes the v3 draft. Changes: water as a static flow system, a synthesized audio layer, a fully specified colour system, and four correctness fixes to the v3 schema. Component count held at 16 by cutting one type that water makes redundant.

**Revision 4.1** — the four open decisions are now closed (see §9). Ambient life is deferred out of the plot layer entirely.

**Revision 4.3** — from playtest feedback on the Phase 1 build. Stairs render two treads per cell. The half-step is added (rule 2b) and the slab justification corrected — the old one was algebraically false. Rotation clarified as stairs-only for now. Editor gains a pick tool so any component can be deleted, not only whatever sits under the cursor.

**Revision 4.2** — two corrections found by building Phase 1, both marked inline: convention B had an internally inconsistent projection, and `illusionDenylist` had the wrong polarity and is now `illusionAllowlist`. The second is a schema change, but pre-launch and pre-content, so `schemaVersion` stays at 4.

**Status: Phase 0 is closed.** Changes from here require a version bump and a stated reason.

---

## Conventions

Everything downstream depends on these four. They are not preferences.

**A. Y-up integer grid, rotation only in 90° steps about Y.** No tipping, no 45°, no free rotate. Socket math, illusion math, flow math and validation all stay exact-integer. Arbitrary rotation turns illusion detection into a floating-point tolerance problem and the "deliberate, not buggy" promise dies with it.

**B. One fixed orthographic camera: true isometric (elevation atan(1/√2) ≈ 35.264°, camera on the (1,1,1) axis), yaw quantized to 0/90/180/270.** — CORRECTED IN 4.2. Revisions 3 and 4.0 specified 2:1 dimetric (26.57°) *and* claimed (1,1,1) as the null vector. Those are incompatible: at 2:1 dimetric the null vector is (1, 1/√2, 1), which is irrational, and illusion detection would have needed a float tolerance — precisely what conventions A and B exist to prevent. True isometric makes (1,1,1) the null vector exactly, and screen position reduces to two integers:

    u = x − z              (horizontal screen axis)
    v = h2 − x − z         (vertical screen axis; h2 = height in half-cells)

Two nodes coincide on screen iff both integers match. No epsilon anywhere, at any yaw. The 2:1 ratio's only real advantage is pixel-perfect raster alignment, which is irrelevant to a WebGL renderer. Verified in the Phase 1 build.

**C. Every published puzzle is immutable.** Edits produce new versions with new content hashes. This is what makes a persistent world of independently authored content safe.

**D. The author owns pigment; the world owns light.** Surface hue, within limits, is authorship. Sky, fog, light direction, water material, and regional hue bias are world-owned and not author-editable. This single rule is the largest lever on world coherence, and it is the reason a lattice of strangers' plots can read as one valley instead of a yard sale.

---

## 1. Puzzle JSON Schema (v4)

```json
{
  "schemaVersion": 4,
  "id": "pzl_9f2c7a",
  "meta": {
    "name": "Courtyard of Forking Paths",
    "author": "user_4812",
    "created": "2026-08-19T14:03:11Z",
    "editorVersion": "1.4.0",
    "tags": ["penrose", "water", "tutorial"]
  },
  "plot": {
    "size": [24, 16, 24],
    "ports": [
      { "id": "N0", "face": "N", "u": 4, "y": 0, "type": "walk" },
      { "id": "E1", "face": "E", "u": 7, "y": 1, "type": "stair-top" },
      { "id": "S2", "face": "S", "u": 11, "y": 3, "type": "flow-out" }
    ]
  },
  "palette": {
    "family": "dusk-ochre",
    "roles": { "ground": 2, "structure": 5, "accent": 11, "void": 0 }
  },
  "audio": { "bed": "hollow", "key": 3 },
  "components": [
    { "i": 1, "t": "block",   "p": [3, 0, 4],  "r": 0, "c": "ground" },
    { "i": 2, "t": "stairs",  "p": [4, 0, 4],  "r": 1, "c": "structure" },
    { "i": 3, "t": "column",  "p": [6, 0, 6],  "r": 0, "c": "structure", "v": { "h": 3 } },
    { "i": 4, "t": "rotor",   "p": [6, 3, 6],  "r": 0, "c": "accent",    "v": { "hub": 7, "state": 0 } },
    { "i": 5, "t": "spring",  "p": [9, 6, 2],  "r": 0, "c": "structure" },
    { "i": 6, "t": "channel", "p": [9, 6, 3],  "r": 0, "c": "structure", "v": { "shape": "straight" } },
    { "i": 7, "t": "channel", "p": [9, 6, 4],  "r": 1, "c": "structure", "v": { "shape": "fall", "drop": 3 } },
    { "i": 8, "t": "basin",   "p": [9, 3, 4],  "r": 0, "c": "ground" },
    { "i": 9, "t": "spawn",   "p": [0, 0, 0],  "r": 0 },
    { "i": 10, "t": "goal",   "p": [21, 14, 21], "r": 0 }
  ],
  "illusionDenylist": [
    { "a": [12, 0], "b": [45, 2], "yaw": 1 }
  ]
}
```

### Field reasoning

**`schemaVersion` — integer, not semver.** Migrations run sequentially (3→4→5). Semver invites the fantasy of partial migrations you will never implement. One integer, one ordered chain, and content published years ago keeps loading.

**`id` — author-stable handle across versions.** The world lattice stores content hashes, never ids (see below), so immutability is enforced by construction rather than by discipline.

**No `hash` field. FIXED FROM v3.** A hash cannot live inside the document it hashes. The content address is computed over the canonical serialization and stored *outside* the document — in the lattice claim, the CDN key, the database row. Canonicalization is part of the spec, not an implementation detail: UTF-8, keys sorted lexicographically, no insignificant whitespace, integers only (no floats anywhere in the schema — this is one more reason the grid is integer), arrays in authored order. Two independent clients must produce byte-identical output or the entire immutability story silently fails.

**`plot.size` — explicit, capped at the lattice cell (24 × 16 × 24).** The author owns a bounding box larger than their geometry, because illusion design needs negative space and the lattice claim needs a fixed envelope. Origin is the min corner; all component positions are plot-local. Plots smaller than the cell sit on a world-owned plinth.

**`plot.ports` — promoted sockets, not free declarations.** Validation requires a real component socket at that boundary cell, facing outward, of the declared type. The redundancy is deliberate: it is what catches corrupted or hand-edited files. Stable string ids let a new version prove signature identity to its neighbours (§4, I4).

**`palette` — CHANGED FROM v3.** Was a flat array of theme indices. Now a `family` plus four **role-typed** slots. Rationale in §6; the schema consequence is that `components[].c` is a role name, not an integer. Roles mean an accent colour signifies the same thing in every plot by every author, which is a large usability win in a shared world and costs the author nothing.

**`audio` — new.** A per-plot ambient bed selector and a key offset within the world scale (§7). Two small integers buy acoustic identity without letting anyone author dissonance.

**`components[].v` — sparse per-type parameters.** Missing keys take defaults; unknown keys are ignored. This is the forward-compatibility story: a v4 client loads a v5 puzzle and degrades rather than refusing. Never use positional arrays for parameters — it makes adding one a breaking change.

**`spawn` and `goal` are components.** They occupy cells, expose sockets, and validate like everything else. One code path, no special cases.

**`illusionAllowlist` — INVERTED IN 4.2.** Two changes from v3's `illusionDenylist`. The granularity fix: illusion edges join *nodes*, and a rotor arm, bridge or arch contributes several, so entries are node-keyed rather than component-keyed. The polarity fix is more important, and it came out of building Phase 1 rather than out of reasoning:

**Screen-space coincidence is common, not rare.** In the Phase 1 build, a flat 7×7 plaza produced 4 coincidences and a plain three-step staircase produced 13 — regular architecture aligns with itself constantly, which in hindsight is obvious, since regularity is exactly what the projection collapses. Under an opt-out model an author would have to hunt down and suppress a dozen accidental seams per build, and every one they missed would ship as a traversable bug. That is risk #1 arriving by default, in every puzzle, forever.

So detection produces a **candidate list only**. Nothing is traversable until the author promotes it. The editor surfaces candidates; the author authors seams. This also simplifies §3's review pipeline — "confirm or deny" collapses to "confirm," and the default state of an unreviewed puzzle is safe rather than broken.

**Deliberately absent:** solutions, walkthroughs, computed graphs, flow states, thumbnails-as-data. Anything derivable is derived at load, deterministically. Save files that cache derived data rot.

---

## 2. Component / Socket Model

A **socket** is `(localCellOffset, direction, type)`. A component type is a static socket table transformed by `r`. Meshes are cosmetic; sockets are truth.

### Nine socket types

| Socket | Meaning | Carries traversal? | Carries flow? |
|---|---|---|---|
| `walk` | Flat standable surface, facing up | Yes — graph node | No |
| `stair-bottom` | Low entry face of a stair | Yes — edge endpoint | No |
| `stair-top` | High exit face, one level up | Yes — edge endpoint | No |
| `hub-anchor` | Fixed, grounded side of a rotator | No | No |
| `hub-mount` | Rotating side; the rotor's `walk` sockets do the work | No | No |
| `deco` | Cosmetic attachment point | No | No |
| `support` | Load-bearing bottom face | No | No |
| `flow-out` | Directed water exit | No | Yes — source end |
| `flow-in` | Directed water entry | No | Yes — sink end |

`flow-in`/`flow-out` mirror the existing `stair-bottom`/`stair-top` grammar deliberately. Stairs are the Y-transition verb; water is the continuity verb. Same shape, same validation machinery, no new concepts.

### Connection legality

1. `walk ↔ walk` — face-adjacent at equal Y, or stacked (top of one to `support` of another).
2. `stair-bottom ↔ walk` at the stair's own level. `stair-top ↔ walk` exactly one level above the stair base. **Stairs are the only legal FULL-level transition** — AMENDED IN 4.3, previously "the only Y-transition". No jumping, no climbing arbitrary blocks. Stairs are bidirectional: a stair's top is an ordinary walk surface, so you descend by the same edge you climb.

2b. **Half-step — NEW IN 4.3.** Two face-adjacent walk nodes with |Δh2| = 1 connect freely. This only ever occurs between a block level and a slab level. It is not a second vertical verb competing with stairs: a stair buys a full level for one horizontal cell, a half-step buys half a level, so stairs remain strictly the efficient climb. See §5 for why slabs are unusable without it.
3. `hub-anchor ↔ hub-mount` only. Hub-to-hub forbidden. A rotor's full sweep envelope across all four states must be collision-free and inside the plot.
4. `flow-out ↔ flow-in` only, face-adjacent, at equal Y, or vertically for a `fall`-shaped channel. Flow is directed; two outs or two ins facing each other is an error, not a merge.
5. `deco` attaches to any face of anything structural and participates in nothing else — never traversal, validation, projection, or flow.
6. `support` — every non-grounded component needs an unbroken support chain to y=0 or to a `hub-anchor`. No floating geometry, *except* rotors hanging off hubs. That one explicit exception is what makes rotors feel magical rather than glitchy.
7. Two solid volumes may never occupy the same cell.

### Water rules (the ones that keep it affordable)

8. **Water never drives a rotor.** Only the player turns things. A waterwheel is the single most requested feature you must refuse: it creates a cycle where flow determines rotor state determines flow, and determinism dies.
9. **Flow is a pure function of rotor state.** `flowSolution = f(rotorStateVector)`. This is the whole reason water is affordable — it adds a mechanic without adding a dimension to the solver, because that dimension already exists.
10. **No volume accounting.** Flow is steady-state topology, not fluid. A channel is flowing or it isn't. Cycles are legal and celebrated (see §3).
11. **Flowing water over a `walk` node resets the avatar to its last dry node.** DECIDED (§9.1); this also resolves an inconsistency in revision 4.0, which said "impassable" here and "reset" in §5. Reset is the single rule. That is water's entire interaction with traversal, and it is enough: the puzzle verb becomes *rotate to redirect the stream and open a path*. The reset must read as a stumble, never a death — see §9.1 for why this constrains the avatar.

### Validation contract

```
validate(puzzle) → { ok: bool, errors: [{ code, severity, componentIds, message }] }
```

- **Pure and total.** Depends only on the puzzle and `schemaVersion`. Never throws; malformed input yields errors. No engine, rendering, or network dependency — the same code runs in the editor for live feedback, on the server as the publish gate, and in the client at load. One source of truth, three call sites.
- **Deterministic, order-stable** error lists with machine-readable codes (`E_OVERLAP`, `E_FLOATING`, `E_PORT_MISMATCH`, `E_SWEEP_EXIT`, `E_FLOW_POLARITY`, `E_ROTOR_BUDGET`, `W_UNREACHABLE_PORT`). Codes are an API; messages are for humans.
- **Two severities.** Errors block publish. Warnings publish anyway — an author may deliberately build a one-way node.
- **Scope:** bounds, non-overlap, support chains, port/socket agreement, rotor sweep containment, **rotor budget (≤ 3 per plot)**, flow polarity and connectivity, exactly-one-spawn, at-least-one-goal, parameter sanity.
- **Out of scope:** solvability. That is `solve()` (§3), which the publish gate also runs but which is a separate, weaker promise. Integrity means "cannot collapse or corrupt." Conflating the two is how you become unable to load half your back catalogue after a rule tweak.

**Rotor budget — FIXED FROM v3.** v3 said rotors give "4 precomputed static variants," which is only true for one rotor. With N rotors the state space is 4ᴺ, and flow now depends on it too. Hard cap at 3 rotors per plot: 64 states, each with a precomputed traversal graph and flow solution, is a few hundred KB and solves instantly. Four rotors is 256 and the editor's live feedback starts to stutter. Cap it in validation, not in the UI.

---

## 3. The Traversal and Flow Graphs

### Nodes

One node per standable cell: every `walk` socket, both stair endpoints, spawn, goal. Node key is `(x, y, z, rotorStateVector)`.

### Geometric edges

Rebuilt on edit. Same-Y four-neighbourhood between walk nodes with headroom; stair edges bottom↔top; rotor-state edges (a rotor's walk surfaces connect to whatever they face in each of its four states; riding the rotor is an edge that mutates the state vector).

### Illusion edges

Rebuilt on edit, four sets, one per yaw. Project every node centre through the fixed orthographic matrix. By convention B this is integer arithmetic. Two nodes illusion-connect **iff their projected cell footprints coincide exactly** — or, for partial-geometry components like slabs, iff the integer overlap area is at least 3/5 of the smaller footprint's integer area. **CLARIFIED FROM v3:** state it as an integer ratio comparison (`5 × overlap ≥ 3 × minArea`), never a float. The v3 draft claimed exact-integer math and then introduced a percentage; this keeps the claim true.

Filters: the pair must not already be geometrically adjacent (real adjacency always wins), and must appear in `illusionAllowlist` — detection alone never creates a traversable edge. See §1 for why this is opt-in. Each edge carries a 4-bit yaw mask. At yaw θ the active set is geometric ∪ {illusion edges with bit θ set}.

The Penrose condition falls out for free: a stair run climbing the world diagonal projects onto itself, so a loop that closes in screen space is unbounded in world space. The camera lies; the geometry is honest.

### Water flow

Rebuilt on edit, one solution per rotor state. A directed graph over `flow-out → flow-in` connections. Springs are sources, basins are sinks, channels are edges. Resolution is a reachability pass from every spring: a channel is *wet* if reachable, dry otherwise. Cycles are legal — a cycle simply stays wet forever.

**Water crosses illusion edges.** This is the payoff. A channel terminating at an illusion seam continues into the projected-coincident channel, using the same yaw-masked edge set as the avatar. Therefore, under the right yaw, a stream can flow downhill into its own source and run forever. This is Escher's *Waterfall*, and it is the game's signature image.

It also does structural work: when water crosses a seam and keeps going, a second independent system has corroborated the illusion. Players stop hunting for the trick. This is the strongest available mitigation for risk #1.

### Rebuild triggers

| Event | Cost | Action |
|---|---|---|
| Component edit | Small | Incremental geometric rebuild in the dirty region; full illusion and flow recompute |
| Camera yaw change | ~Zero | Swap active edge set, precomputed. **Never recompute at runtime.** |
| Rotor turn | ~Zero | Swap to the precomputed graph and flow solution for the new state vector |
| Load | Once | Full build: four yaw sets × up to 64 rotor states |

Full recompute per edit sounds expensive and isn't: plots cap at a few hundred components, and nodes bucket into a per-yaw screen-space hash, so candidate pairs come from hash collisions rather than an O(n²) sweep.

### Camera discipline

Yaw changes are quantized, animated smoothly between discrete states, and permitted only while the avatar is idle and not mid-crossing. Free-look is a debug tool and never a player feature. The moment the player controls the camera freely, every illusion is exposed as a trick.

### Making it read as deliberate

1. **Editor surfacing.** Detected candidates are listed with a thumbnail of each seam ("3 perspective alignments detected — 1 authored"). The author promotes the ones they meant; the rest stay inert. Publishing requires walking or auto-solving the puzzle once in-editor; any illusion edge on the solution path is auto-flagged intended.
2. **Visual grammar.** Intended seams carry a consistent tell — a faint edge shimmer that reads as *the world is doing something here* without explaining it. Denied pairs render with a small occlusion gap so they read as separate structures.
3. **Atomic crossing.** Traversing an illusion edge is one committed ~300ms animation with the camera locked and a one-time chime per seam per session. The animation is the contract: the game acknowledges the impossible step. Bugs hesitate; design commits.
4. **Occlusion discipline.** Illusion-merged pairs join a single painter-sort group while the edge is active, so draw order never flickers and betrays the seam.
5. **Water corroboration.** Where an author routes a channel across a seam, the illusion gains a second witness. Surface this in the editor as a suggestion, not a requirement.

---

## 4. The World Lattice

**Structure.** A single-layer 2D lattice of cells, each **24 × 24 footprint, 16 high**. Verticality lives inside plots; the world is flat. A 3D lattice was considered and rejected: it doubles every boundary case (ports on six faces, support across owners, culling complexity) for a payoff that reads worse under a fixed-angle orthographic camera anyway.

**Placement.** A claim is `(cellX, cellZ, contentHash, yaw)`. Claims are first-come and permanent, pointing at immutable content. Neighbouring plots load as independent sandboxes. **No component-level interaction ever crosses a cell boundary** — no physics, no support, no shared state. Only two things cross: the avatar, and water, both through declared ports.

**Port mating.** Two adjacent plots connect iff both declare facing ports, the `(u, y)` align along the shared edge after yaw transform, and types are compatible: `walk↔walk`, `walk↔stair-bottom`, `stair-top↔walk`, `flow-out↔flow-in`. Hubs, deco and support can never be ports. Any mismatch, absence, or vacant neighbour renders the port **sealed** — a door, a wall, a gate to void. Sealing is a first-class visual state, never an error. A sealed `flow-out` becomes a spillway into nothing, which is a better image than a working one.

### Invariants

- **I1 — Envelope containment.** Every plot's geometry, including all rotor sweep states, water volumes and animation envelopes, lies strictly inside its own cell, with a one-cell reserved visual margin at the boundary so that neighbouring parapets and deco never appear to touch. Verified at publish. This is load-bearing: if nothing can protrude, no plot can reach its neighbour.
- **I2 — Self-support.** Support chains may not route through a port. Every plot stands alone; deleting any neighbour leaves a structurally valid plot.
- **I3 — Self-traversal.** Every walk-type port must be reachable from spawn (warning-level if not). A sealed neighbour therefore never strands the avatar inside your plot. Global routing across the world is best-effort, computed from claims plus port matches; the world is exploration, not one giant level, so global connectivity is desirable but never guaranteed.
- **I4 — Signature stability.** A new version may keep its cell iff its port signature — the set of `(face, u, y, type)` — is unchanged. Any change forfeits the cell. Neighbours are never re-validated, never touched, never notified. The worst case of any edit anywhere is a sealed door on someone else's boundary.
- **I5 — Immutable content.** Cells reference hashes. There is no update-in-place. Rollback, caching, dedup and CDN serving all become trivial consequences.
- **I6 — Water is world-owned. NEW.** Water crossing a port carries no author state — no colour, no volume, no speed. A `flow-out` means *water leaves here*; the neighbour decides what happens next. Two authors can never disagree about water, because there is nothing to disagree about.

I1 makes breaking a neighbour physically impossible, I2 structurally impossible, I4 logically impossible, I6 semantically impossible. Four cheap layers.

**Free consequences.** Because I1 guarantees containment, the lattice cell is exactly the culling unit, the streaming unit, the audio spatialization unit, and the simulation unit. The client fully simulates the avatar's cell plus immediate neighbours and nothing else. The architecture is the optimization.

---

## 5. Component Starter Set — 16 Types

Selection principle: **components are verbs and surfaces, not set dressing.** A type earns a slot only if it changes traversal, occlusion, projection, or flow. Anything composable from existing types is out. Ornament compresses into one parameterized type.

| # | Type | Key sockets | Why |
|---|---|---|---|
| 1 | **Block** 1×1×1 | `walk`, `support` | The atom. Terrain, wall, barrier, occlusion mass. |
| 2 | **Slab** 1×1×½ | `walk`, `support` | Ledges, daises, grading — and the only access to odd screen parities. See the parity note below; the earlier justification for this component was algebraically false. |
| 3 | **Stairs** | `stair-bottom`, `stair-top` | The sole Y-verb, and the raw material of every Penrose loop. |
| 4 | **Column** (`v.h` 1–4) | `walk`, `support` | Height variance and skyline rhythm; one parameterized type replaces four. |
| 5 | **Bridge** (`v.len` 2–3) | `walk` spanning gaps | Negative space as mechanic. Gaps are half of puzzle design. |
| 6 | **Rotor hub** | `hub-anchor`, `support` | Anchor half of the one dynamic mechanic. |
| 7 | **Rotor platform** 1×3 arm | `hub-mount`, `walk` | Stepped 90° rotation gives state-space puzzles with no animation system. The hub+rotor pairing constraint is the tutorial moment. |
| 8 | **Parapet** (edge wall) | `deco`, blocks crossing | The occluder. Walls hide the seams of impossible geometry; without controlled sightline blocking, illusions read as accidents. |
| 9 | **Arch** | `walk` top, passage below | Two traversable layers in one column of cells, plus sightline framing. |
| 10 | **Panel** 1×2 backdrop | `deco` | Background control. Silhouette against sky versus against a flat panel decides whether an illusion pops or vanishes. |
| 11 | **Deco** (`v.variant`) | `deco` | All ornament in one type. Variants are parameters, not types — keeps the count honest. |
| 12 | **Spawn** | `walk` | Entry. Exactly one, validated. |
| 13 | **Goal** | `walk` | Win condition. Distinct silhouette, visible from afar; doubles as navigation beacon. |
| 14 | **Spring** — NEW | `flow-out` | Water source. Emits unconditionally; the only unconditional thing in the game. |
| 15 | **Channel** (`v.shape` ∈ straight, corner, cross, fall; `v.drop`) — NEW | `flow-in`, `flow-out` | All water routing in one parameterized type, per the Deco precedent. `fall` is the vertical drop and the Escher moment. `cross` allows two streams to pass without mixing, which is where flow puzzles get interesting. |
| 16 | **Basin** — NEW | `flow-in`, `walk` | Sink, and a walkable surface when dry. The clearest possible expression of the core water puzzle: redirect the stream, cross the basin. |

**The slab parity note — CORRECTED IN 4.3.** Earlier revisions justified slabs as letting authors "nudge projected heights into coincidence that full blocks can't reach." That is false, and the Phase 1 build proved it. Screen position is `u = x − z` and `v = h2 − x − z`, so `h2 ≡ u + v (mod 2)`. Block nodes always have even `h2`; slab nodes always have odd `h2`. **A slab node therefore can never coincide with a block node, at any yaw** — they occupy disjoint parity classes. Verified across all three Phase 1 presets: zero cross-parity coincidences, exactly as the algebra requires.

What slabs actually do is open the *other half* of screen space. With blocks alone, half of all screen positions are unreachable and no illusion can ever be authored there. Slabs unlock that half. But this is worth nothing unless slabs are reachable from block-level geometry, which is what the half-step (rule 2b) provides — without it a slab network is an isolated island and the component is dead weight. The two changes stand or fall together.

**Rotation — clarified in 4.3.** Of the Phase 1 set, only Stairs have an asymmetric socket layout, so only Stairs are meaningfully rotatable. `r` is stored on every component but inert elsewhere, and the editor should say so rather than silently swallowing the key. Rotation becomes meaningful again with Channel (`v.shape: corner`) and Rotor platform.

**Cut from v3: Hazard tile.** Water replaces it. Flowing water is now the failure state — contact resets the avatar to its last stable node — which is strictly better because the hazard is *visible, directional, and manipulable* rather than an arbitrary red square. One cut, three additions, count holds at 16.

**Still excluded, with reasons.** Movers and lifts: rotors cover dynamic traversal, and a second animation mechanic doubles validation surface. Switches and doors: a logic layer needs wires, state and timing, which is a coherent v2 expansion rather than a drip-fed one-off. Ladders: a second Y-verb that undermines stair clarity. Teleporters: they *fake* what illusion edges *earn*, and shipping them would poison the community's design culture. Waterwheels: see rule 8; this is the one you will be asked for most and must refuse most firmly.

---

## 6. Colour System

The requirement is that independently authored plots mix into a coherent valley. That is a technical constraint, not a mood.

**Perceptual space.** The global palette is defined in OKLCH, not RGB or HSL. HSL lightness lies — a saturated yellow and a saturated blue at the same nominal L read as wildly different brightness, and silhouette legibility is the entire basis of a fixed-angle orthographic game.

**Fixed lightness ladder.** Every hue family provides the same five-step lightness ramp at matched chroma. Any two palettes placed side by side therefore share value structure even when hues differ, so depth and silhouette read consistently across the lattice. This is the mechanism by which strangers' work looks composed.

**Role-typed slots, not free colours.** Four roles: `ground`, `structure`, `accent`, `void`. Authors pick a family and assign ramp steps to roles. Consequence: the accent colour means *interactive or important* in every plot in the world. A player learns the world's colour language once. Free RGB would cost you this permanently, and it is worth more than the expressiveness it trades away.

**World-owned light (convention D).** Sky gradient, fog and depth tint, light direction, shadow colour, and water material are global and not author-editable. Everything is under the same sun, which is precisely how a real valley coheres.

**Regional hue drift.** The lattice carries a slow hue bias as a function of `(cellX, cellZ)`. Authored palettes are tinted toward their region. Districts emerge — a warm quarter, a cold quarter — with zero coordination between authors and zero UI. This is the cheapest large-scale beauty in the whole design.

**Neighbour preview at claim time.** When claiming a cell, show the author their palette rendered against actual neighbours, with an optional one-click harmonize that snaps the family toward a neighbouring one. Suggest, never enforce. Enforcement kills authorship; a good default does the same work.

**Ship 8–12 families, curated, named.** Every pair must be tested adjacent. If two families clash, one of them does not ship. Curating the palette set is a design task with a real cost and it is where the game's visual identity actually lives.

---

## 7. Audio System

Sound is not decoration here — §3 already relies on an illusion chime to sell the seam. Formalizing it:

**Fully synthesized, no audio files.** Web Audio API throughout. Two reasons: a streaming shared world cannot afford asset weight per plot, and synthesis lets acoustic character be driven by the same indirection as colour, so a plot's `audio.bed` and `audio.key` are two integers rather than a megabyte.

**One scale, globally.** Everything is quantized to a single pentatonic scale with a per-plot key offset. No combination of authored plots can produce dissonance, because dissonance is not representable. This is the audio equivalent of the palette system: authors get identity, but cannot make it ugly. Non-negotiable in a UGC world.

**Three layers.**

1. **Ambient bed** — a per-plot drone selected by `audio.bed`, filtered by the world's regional character. Crossfades as the avatar moves between cells.
2. **Diegetic loops** — water flow, rotor churn. Tied to component instances, spatialized with `PannerNode`, and culled by the same cell-based logic as rendering. I1 gives you audio culling for free.
3. **Event stingers** — footfall, rotor click, illusion crossing, goal, water contact reset.

**Footsteps carry material.** Component type maps to timbre — stone, wood, hollow, wet. A free readability win: you hear that you stepped onto a rotor arm, which reinforces geometry comprehension before the eye confirms it.

**The illusion chime is the most important sound in the game.** One per seam per session, on the atomic crossing. It is the game saying *yes, that happened, it was meant to*. Budget real design time for this single sound.

**Ambient life — DEFERRED, and relocated.** Cut from the plot layer entirely. It returns later as a **world-owned, server-spawned entity** (a tree that spawns birds, placed on plinths and in the gaps between plots), alongside sky, fog and light under convention D.

This is the correct home, not merely a delay. The risk with a bird authored *inside* a plot is that it occupies the same visual category as the components around it, so players test whether it is a mechanic. World-owned ambient life is categorically not a mechanic, and players learn that category once — the same reason nobody tries to walk on the sky. It also means ambient life never touches the schema, never enters `validate()`, and never enters the solver. Zero cost to Phase 1, full atmospheric payoff later.

The rules still apply when it ships: never lands on authored geometry, never collides, never crosses an illusion seam, never appears near a goal, rare enough to feel like luck.

**Fully playable muted.** Sound reinforces information; it never carries information uniquely. Assume a meaningful fraction of players are on a laptop in a quiet room with the volume off.

---

## 8. Risk List

**1. The illusion reads as a bug, not a miracle.** The whole fantasy rests on players trusting the geometry enough to be delighted when it lies. One flickering seam, one edge that appears at yaw 90 but not 270, and every impossible staircase becomes "janky collision." *Mitigations:* exact-integer projection (convention B, with the overlap rule stated as an integer ratio); the five-stage deliberateness pipeline in §3; camera discipline as a hard product rule; water corroboration as a second independent witness; and a standing playtest question — *did they say "bug" or "whoa"* — tracked as a release gate.

**2. Editor friction kills content supply.** A UGC world with no builders is an empty map, and building illusion-aware geometry on a 3D grid is genuinely hard. *Mitigations:* the editor is the actual product. Live traversal-graph overlay, automatic illusion detection with seam thumbnails, one-click test-walk from any component, legality preview that tints invalid placements *before* commit rather than rejecting after, and live flow preview. Ship 5–10 template plots so the first session is remixing rather than a blank grid. Measure time-to-first-published-puzzle relentlessly.

**3. UGC quality and abuse at world scale.** Grief geometry, spam claims, unsolvable noise, and worse. *Mitigations:* the publish gate does the work automatically — `validate()` plus `solve()` over the full graph including illusion and flow edges means nothing enters the world malformed or unsolvable, with no human review. Claims are rate-limited and earned (publish N well-rated puzzles to unlock claim rights). Moderation acts on claims — unclaim, cell seals — never on content in place, consistent with immutability.

**4. Water becomes the thing that eats the schedule.** It is the most beautiful idea in the design and the one most likely to metastasize. The moment someone implements volume, pressure, waterwheels, or mixing, you have a fluid engine inside a puzzle game and the solver is unmaintainable. *Mitigations:* rules 8–11 in §2 are constitutional. Water is topology, not fluid: wet or dry, no volume, no speed, and never an input to rotor state. Write these as tests before writing the feature. If the flow solver is more than a reachability pass, something has gone wrong.

**5. Scope creep through the socket model.** Every mechanic anyone falls in love with arrives as "just one more socket type," and validation, solver and editor grow combinatorially until the publish gate is unmaintainable. Note that this document already went from seven socket types to nine — the pressure is real and it started immediately. *Mitigations:* treat the socket list as the project's constitution. Adding one is a schema major version, a solver update and an editor redesign, priced as such in planning. §5's exclusions are pre-negotiated answers to the most predictable requests. When v2 mechanics arrive, they arrive as one coherent expansion (the logic layer), not drip-fed.

**Dropped from v3's list: browser performance.** It was ranked fourth, but the architecture already solves it — I1 makes the cell the exact culling, streaming, simulation and audio unit; illusion and flow sets are precomputed and swapped in O(1); per-plot budgets keep draw calls flat. If it runs badly, that is an implementation failure, not a design risk. Water displaces it because water is the live design risk.

---

## 9. Decisions — Closed

### 9.1 Water resets the avatar. The avatar is cute, and that is load-bearing.

Contact with a flowing `walk` node returns the avatar to its last dry node. Puzzles get stakes; the stream becomes a thing you respect rather than ignore.

The "cute" requirement is not a separate art note — it is what makes reset survivable as a mechanic. Reset punishes, and a punishing mechanic in a contemplative game needs its edge removed somewhere. It gets removed in the avatar's reaction. Design constraints that follow:

- **The reset is a stumble, not a death.** No fade to black, no failure sound, no counter. The avatar slips, windmills, and reappears at the last dry node in roughly 600ms. Total interruption under a second.
- **The avatar reacts before the player does.** A visible beat of surprise sells it as comic rather than punitive. This is the entire mitigation, and it is worth real animation time.
- **Silhouette over detail.** Under a fixed orthographic camera at this zoom, cuteness comes from proportion and motion, not features. Large head, small body, soft ease curves, a slight settle on landing. Faces at this scale read as noise.
- **No death vocabulary anywhere.** No lives, no attempts, no score. The word "reset" should not appear in the UI at all; the animation is the entire feedback.
- **One consequence:** water may never be placed such that reset is unrecoverable. `solve()` already covers this — a state the solver cannot escape is unsolvable and blocked at publish.

### 9.2 Rotor budget: 3, with 2 as the fallback.

Ship at 3 (64 states). If editor live-feedback latency on a full plot exceeds roughly 100ms, drop to 2 (16 states) rather than optimizing — the expressive difference between two and three rotors is small, and editor responsiveness is risk #2. Instrument the recompute time from the first build so this is a measurement, not an argument.

### 9.3 Eight palette families at launch.

Curated, named, and every pair tested adjacent in the lattice. If two families clash, one does not ship — the count is a ceiling, not a target. Expand only once enough cells are claimed to show whether the world holds together.

### 9.4 Tutorial curriculum: walk → stairs → water → combine.

Three-stage onboarding, and the preset puzzles shipped with the editor follow the same arc:

1. **Basics.** Walk and stairs only. Teach movement, the Y-verb, and camera rotation. No illusion yet — establish that the geometry is trustworthy *before* breaking that trust, or the first Penrose seam reads as the game being broken rather than clever.
2. **The wow.** Water. Cause and effect, rotor redirection, and the first Escher moment — a stream crossing a seam and feeding its own source. This is the screenshot and the retention beat.
3. **The combine.** Illusion plus water plus rotors together, and the introduction of the world lattice. This is where building starts to look more interesting than playing, which is the conversion the whole project depends on.

The ordering has a design consequence worth stating: **stage 1 must be genuinely enjoyable with no illusions in it at all.** If walking and stairs are not pleasant on their own, the illusions are carrying a game that has no floor under it.

---

## 10. Vegetation

Components sprout grass and grow saplings into trees as the avatar walks the plot. The world greens behind you.

**Cost: zero schema, zero socket types, zero solver dimensions.** Vegetation is a pure presentation-layer function of node visit history, computed client-side and never serialized — the same relationship the illusion edge sets have to the puzzle data. This is what a safe addition looks like, and it is worth contrasting with water, which cost two socket types and a validation rule.

### The governing constraint

**Vegetation must never occlude.** A tree that grows into a sightline can hide or reveal an illusion seam, which is a direct hit on risk #1. Every decision below is downstream of this.

### Growth-bearing components

| Tier | Components | Notes |
|---|---|---|
| Ground (grass, moss — strictly below step height) | Block, Basin, Bridge | Bridge grows on edges and underside only, never the deck. Basin grows grass when dry and reeds when wet — a cosmetic system yielding free wet/dry readability. |
| Canopy (sapling → tree) | Column, Panel, Parapet, Deco | Panel and Parapet are safe by definition: they are already occluders, so growth on them changes nothing about what is hidden. |

**The column test.** Column is the one that produces the signature image and the only one needing a runtime check. Before a column commits to a tree rather than a shrub, project the candidate canopy footprint and test intersection against every active illusion seam's screen region at all four yaws. Any intersection → it stays a shrub, permanently, deterministically. This reuses the illusion projection machinery exactly as-is.

### Excluded, with reasons

- **Slab, Stairs** — the illusion-tuning surface and the Penrose-loop material. Both must stay geometrically legible at all times.
- **Rotor hub, Rotor platform** — a plant swinging around on a rotating arm reads absurd, and growth would visually violate the sweep envelope.
- **Arch** — the passage below must read as passable; vegetation implies blockage.
- **Goal** — needs a distinct silhouette visible from across the plot. That is the one property vegetation would destroy.
- **Spring, Channel** — water infrastructure should read clean and functional. Plants in a channel imply a blockage that does not exist.
- **Spawn** — must be instantly legible on load.

### Mechanics

- **Driver.** Per-node visit count, accumulated client-side. Stages: bare → sprout → grass → sapling → tree.
- **Deterministic seeding.** The PRNG is seeded from `(plotHash, componentId, nodeIndex)`, so a given plot grows identically for every player in every session. Growth is part of the plot's identity, not noise — and in the shared world, two players see the same trees.
- **Monotonic.** Growth never reverses, including after a water reset. It is the only thing in the game that only accumulates. Thematically this matters: the stream can send you back, but the world you have already touched stays changed.
- **Pacing — the rule most likely to be got wrong.** Growth must be slow enough to be noticed only in retrospect. A tree that appears as you step on something is a mechanic and players will farm it; a courtyard quietly greener than when you arrived is atmosphere. This is the same principle that removed ambient life from the plot layer, applied to something that survives it.
- **Author suppression.** Optional sparse parameter `v.g: 0` on any instance to disable growth. Default is enabled. Adding this key needs no version bump — unknown and missing keys already degrade gracefully per §1.

### Deferred to Phase 3: world-persistent bloom

Once the lattice exists, growth state can be aggregated server-side, keyed by content hash rather than stored in the puzzle. A heavily travelled plot becomes visibly overgrown. Popularity rendered as vegetation, with no leaderboard, no counter, and no UI at all — the world simply shows where people have been. This does not violate I5: the puzzle is still immutable; the bloom is derived world state hanging off its hash.

Not now. Noted so it is not designed out by accident.

Built against this spec, in order. Everything else is out.

- Orthographic dimetric camera, yaw quantized to four states with eased transition.
- Integer grid, placement of Block, Slab, Stairs, Column, Spawn, Goal.
- Socket legality with pre-commit tint preview.
- Traversal graph with geometric edges.
- **One working illusion seam**, with the atomic-crossing animation and chime.
- Walking avatar per §9.1 proportions.
- **Grass on Blocks only** — the minimum viable slice of §10. Cheap to build, and it tests whether "the world greens behind you" lands at all before the tree pipeline or the column occlusion test is worth writing.
- Build/play mode toggle, JSON export/import against the v4 schema.
- Three preset puzzles covering stage 1 of §9.4.

**Deferred out of Phase 1:** water and all three water components, rotors, the world lattice, ports, audio beyond the illusion chime and footsteps, palette families beyond one, canopy vegetation and the column test, ambient life, and anything server-side.

The single question Phase 1 exists to answer: **when a player crosses the seam, do they say "bug" or "whoa"?** Nothing else in this document matters if the answer is "bug."
