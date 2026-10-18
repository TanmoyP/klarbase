# Klarbase 🏝️

**Tiny floating isles · clever little paths.**

A cozy browser puzzle game. Guide **Pip**, a round little sprout spirit, across floating
dioramas — push crates into the water to make bridges, slide across ice, pull levers that flip
bridges, step through arches — one hop per key, to the glowing star.

- **24 hand-made isles** in five themed chapters: Canopy (jungle), Mirage (oasis), Lagoon
  (tropical), Rooftops (urban), Summit (mountain).
- **Every isle is solver-verified** — solvable, with an exact par and a replayable smart
  solution (earn it by signing in, clearing the isle, or putting in the time).
- **Build your own** in the in-game builder, share it online, or **contribute it here by pull
  request** — automated checks make sure it's solvable and fair, and you're credited by name.

Play at **[klarbase.dev](https://klarbase.dev)**. No account needed to play or build.

## Make an isle

```text
-  ,1 G1 -  -  -          an isle is just text: one tile per token,
-  .1 ^  -  -  -          row 0 is north, digits are heights
.  .  .  ~  C  .
~  ~  ~  ~  .  .
S  ,  p  -  .  p
```

Build it in the game (**Create**), press **Export for GitHub**, and open a PR that adds
`isles/community/<your-username>/<id>.json`. Full guide: **[CONTRIBUTING.md](CONTRIBUTING.md)** ·
tile reference and rules: **[isles/README.md](isles/README.md)**.

## Run it locally

Needs Node 20+.

```bash
npm install
npm run dev:client          # the game at http://localhost:5173 — play and build, no server needed
npm test                    # engine + all official isles + contribution rules
node tools/check-isles.mjs  # the same check every isle PR runs
```

The online parts (sign-in, sharing) need the server and Postgres — see [DEPLOYMENT.md](DEPLOYMENT.md).

## How it's built

```text
core/     @klar/core — the rules, the solver, the 24 official isles, the contribution rules
client/   Vite + three.js — everything is procedural: no models, no textures, no audio files
server/   Express + Prisma + better-auth — sharing isles online
isles/    community isles, credited to their authors
tools/    check-isles.mjs (the PR gate) · author.mjs (official isle artifacts)
```

The rules live in exactly one place (`core/src/isle/`). The game, the builder, the solver, the
PR checks and the server all use it, so they can never disagree. Engineering notes:
[ENGINEERING.md](ENGINEERING.md).
