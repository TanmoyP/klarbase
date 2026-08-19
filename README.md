# Klarbase

A browser game of impossible architecture: build grid-bound puzzles with
Monument-Valley-style illusion seams, publish them, and place them into a
shared persistent world you can walk end to end. Landing copy lives in
`docs/game-summary.md`; the design truth is `docs/phase0-spec-v4.5.md`
(copy it in from the design deliverable).

**Status: Phase 2 + 3 scaffold, ready to execute.** The logic core is complete
and tested (56/56 assertions). The server and client are fully implemented
against that core. See "Known gaps / first tasks" at the bottom.

## Layout

```
core/                 @klar/core — THE single source of truth (pure, zero deps)
  src/                components, validate, graph, solve, schema+hash, ports, lattice
  test/run.mjs        56 assertions — the project's day-one suite (node core/test/run.mjs)
server/               Express 4 + Prisma + better-auth (Google + GitHub OAuth)
  prisma/schema.prisma
  src/routes/         puzzles.js (publish gate — THE security boundary), world.js
client/               Vite + three.js
  src/sandbox.js      the verified Phase 1 game, importing its logic from @klar/core
  src/world/          roam.js (free-roam streaming), mapview.js (lattice map)
prototypes/phase1.html  frozen Phase 1 artifact — the regression reference
docs/                 game-summary.md, phase3-streaming.md
```

The one architectural rule (spec §13): **`@klar/core` is imported by the client
editor, the client player, and the server publish gate. Never reimplement any
of it.** If the server's verdict can differ from the client's, publishing is
broken.

## Quickstart (local dev)

```bash
cp .env.example .env          # fill in BETTER_AUTH_SECRET + OAuth app credentials
docker compose up db -d
npm install                   # workspaces: core, server, client
npm run prisma:migrate -w @klar/server    # creates tables (first run: --name init)
npm run dev:server            # :3000
npm run dev:client            # :5173 (proxies /api to :3000)
```

Run the core suite: `npm test` — or against a frozen checkout:
`node core/test/run.mjs`.

OAuth callbacks during dev are `http://localhost:3000/api/auth/callback/{github,google}`
(register both in the provider consoles). Anonymous visitors can play the three
bundled presets; everything else requires login (enforced server-side).

## Deploy

The production shape is **one service + managed Postgres**: the server serves
the built client statically, so there is no CORS surface.

**Railway:** new project → add Postgres plugin → add service from this repo
(Dockerfile: `server/Dockerfile`). Set env: `DATABASE_URL` (plugin reference),
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://<app>.up.railway.app`,
`CLIENT_ORIGIN` same, OAuth ids/secrets with production callbacks
`https://<app>.up.railway.app/api/auth/callback/{github,google}`. The container
boot runs `prisma migrate deploy` then serves. Point klarbase.dev at it.

**Fly.io:** `fly launch` (detects the Dockerfile) → `fly postgres create` →
attach → set the same env via `fly secrets set`. Any managed Postgres
(Neon/Supabase/Railway) works — it's a `DATABASE_URL` and nothing else.

## Endpoint map

```
POST   /api/puzzles                 publish — server validates + solves (the gate)
GET    /api/puzzles?cursor&limit    browse, cursor-paginated (live only; author=me for yours)
GET    /api/puzzles/:hash           playable document (404 when hidden, unless yours)
DELETE /api/puzzles/:hash           own only; 409 if placed in the world (immutability)
POST   /api/puzzles/:hash/report    one per user; >=3 reports auto-hides (moderation hook)
POST   /api/world/claims            claim free cell adjacent to the world (genesis: (0,0))
POST   /api/world/plots/:x/:y/place place your published puzzle — ports must match all
                                    occupied neighbours, then it's immutable
GET    /api/world/cells?x&y&r       stream window for free-roam
GET    /api/world/map               every claimed cell + author (tiling plan in docs)
```

## Known gaps / first tasks for the executing agent

1. **Run `npm install` and the first migration** — no lockfile or generated
   migration is committed yet; `prisma migrate dev --name init` creates both.
2. **Verify the better-auth version pin** against its current docs (mount
   point, `getSession` shape, client import path). It moves fast; the
   architecture doesn't depend on it.
3. **End-to-end smoke**: the core is test-verified; the Express/Prisma/better-auth
   wiring is syntax-checked but has not run against a live DB here. First task
   is the milestone loop: register → publish → `/p/:hash` plays → claim (0,0) →
   place → walk it in World → see it on the Map.
4. The sandbox UI is the Phase 1 shell with platform buttons added; the
   further split of `sandbox.js` into renderer/editor/player/ui modules is a
   mechanical follow-up — do it only after the milestone loop is green.
5. Roam rendering is deliberately lite (no grass/seam shimmer); port those
   from `prototypes/phase1.html` when the loop works.
