# Phase 2 Kickoff — Platform Layer (backend, auth, sharing, repo)

Paste this whole file into Claude Code as the opening brief. It pins the work to **spec v4.5** (`phase0-spec-v4.5.md`) and the verified **Phase 1 prototype v4** (`phase1-prototype-v4.html`). Both are in the repo.

## 0. Where we are

Phase 1 is done and verified: a single-file Three.js prototype implementing the editor doctrine (§12 of the spec), the directed-attachment stair model (§2 rule 2), the traversal graph with allowlisted illusion seams (§3), and three teaching presets. It runs in a browser with no build step and no server. Its logic is correct — a 27-assertion Node harness and browser E2E runs say so — but it lives inside one HTML file, which is now ~1,300 lines. That, plus the fact that **auth and a database cannot happen in a browser artifact at all**, is the switch signal. Phase 2 is the platform.

## 1. Goal of Phase 2

One milestone loop, working end to end:

> Build a puzzle in the editor → publish → the server validates *and solves* it → a share link `/p/:hash` opens it in a fresh browser → a stranger plays it to the win.

When that loop works for a second account, Phase 2's core is done. Everything else — the world lattice, water, ratings — is explicitly later.

## 2. Repo layout

```
prototypes/phase1.html        frozen Phase 1 artifact — the reference implementation, do not refactor it
core/                         pure logic, no DOM, no I/O — THE single source of truth
  schema.js                   v4 schema + canonical serialization + content hash
  validate.js                 validate() — ported character-for-character in behaviour
  graph.js                    buildGraph() — nodes, geometric edges, illusion seams
  solve.js                    BFS solvability per yaw state
core/test/                    the 27-assertion harness from Phase 1, ported day one
client/                       the editor/player, re-skinned to import from core/
server/                       API, auth, DB
  publish.js                  the publish gate — runs core/validate + core/solve server-side
README.md, .gitignore, CI     CI runs core/test on every push
```

## 3. The one architectural rule

**One source of truth, three call sites.** `core/` is imported by (a) the client editor for pre-commit validation, (b) the client player for traversal, (c) the server publish gate. Never reimplement validation on the server in another language "for now" — if the server's verdict can differ from the client's, publishing is broken, and players will publish puzzles the server would reject or vice versa. Port `core/` first, port the Phase 1 test harness alongside it, and do not write a line of server code until the harness passes against the ported modules.

## 4. Tasks in order

1. **Init repo + CI.** README, .gitignore (node_modules, .env), GitHub Actions job that runs `core/test`.
2. **Port `core/`.** Extract `validate()`, `buildGraph()`, solvability BFS, and canonicalization/content-hash from `prototypes/phase1.html` into pure modules. No DOM, no Three.js, no globals — the Phase 1 harness extracts these by textual anchors; the port makes that extraction permanent and explicit.
3. **Port the test harness.** 27 assertions, including per-yaw solvability BFS for all three presets and the synthetic stair-flank rig. These pass today against the prototype; they must pass against `core/` unchanged.
4. **Server skeleton.** Node + your choice of framework; Postgres. Tables: `users(id, github_id, name, created_at)`, `puzzles(hash PK, author_id, title, json, created_at)`. The hash is the v4 content hash — dedup and immutable addressing for free.
5. **Auth.** GitHub OAuth first (the audience is builders; one provider is enough to ship). Sessions as signed cookies. No roles, no profiles beyond display name.
6. **Publish gate.** `POST /publish` → canonicalize → run `core/validate` (must be zero errors) and `core/solve` (solvable at ≥1 yaw) → store keyed by hash → return `/p/:hash`. Rejections return the spec's validator codes verbatim so the client can render them in-place.
7. **Share/play route.** `GET /p/:hash` serves the client in play mode with the puzzle loaded. No account required to *play* a shared puzzle.
8. **Client rewire.** The Phase 1 client, now importing `core/`, plus a Publish button that calls the gate and surfaces rejection codes.

## 5. Explicitly NOT Phase 2

- **World lattice / plot claims** (Phase 3) — needs shared mutable state across users and deserves its own spec revision. Do not stub tables for it "just in case."
- **Water, rotors, flow** — a parallel client-side track, independent of the platform; the publish gate already handles them correctly by ignoring components it doesn't know, as long as unknown types are a validation *error* (they are: the schema is closed).
- **Ratings, discovery, browsing** — meaningless until strangers are publishing.
- **Editor feature work** — the editor doctrine is settled (§12); resist reopening it while standing up the platform.

## 6. Definition of done

- `core/test` green in CI on every push.
- The milestone loop from §1 completed by a second GitHub account from a fresh browser.
- A published puzzle that fails server-side validation is rejected with the same codes the editor shows — verified by deliberately publishing a broken draft from the client (which allows broken drafts per §12; the gate is what refuses them).
- `prototypes/phase1.html` still runs standalone, untouched, as the regression reference.

## 7. Numbers to keep you honest

- Core port: ~400 lines of pure logic. If it grows past ~600, something non-core crept in.
- Publish gate latency target: <100 ms for a 100-component puzzle (BFS over 4 yaw states is tiny; if it's slow, the port is wrong, not the algorithm).
- The spec is `phase0-spec-v4.5.md`. If a decision isn't in it, the answer is "defer," not "improvise."
