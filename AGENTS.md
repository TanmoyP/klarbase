# Klarbase — Agent Orientation

> Read this file first when you start working on this project. It is written for AI coding agents and assumes no prior knowledge of the codebase.

## Project overview

Klarbase is a browser game of impossible architecture. Players build small isometric grid puzzles with Monument Valley-style optical-illusion seams, publish them as immutable content-addressed documents, and place them into a shared walkable lattice world.

The repository is an npm workspaces monorepo with three packages:

- `@klar/core` — pure, zero-dependency logic (components, validator, traversal graph, solver, schema/hash, ports, lattice rules). This is the single source of truth for the whole system.
- `@klar/server` — Express 4 + Prisma + better-auth (Google and GitHub OAuth). Hosts the HTTP API and, in production, serves the built client.
- `@klar/client` — Vite + three.js browser app. Contains the editor, player, publish/browse flows, and the Phase 3 world (free-roam + map views).

The engineering source of truth is `ENGINEERING.md`. The design source of truth is `docs/phase0-spec-v4.5.md`. Treat those as authoritative for deeper details.

## Repository layout

```
klarbase/
├── package.json                 # root workspace manifest
├── core/                        # @klar/core
│   ├── src/
│   │   ├── index.js             # barrel export
│   │   ├── components.js        # palette, TYPES table, occupancy, walk nodes
│   │   ├── validate.js          # validate() — security boundary
│   │   ├── graph.js             # buildGraph() — projection + all edge kinds
│   │   ├── solve.js             # BFS solvability (free-turn + per-yaw)
│   │   ├── schema.js            # canonical serialization + SHA-256 content hash
│   │   ├── ports.js             # plot-to-plot port contract
│   │   └── lattice.js           # world claim/placement rules
│   └── test/run.mjs             # zero-dependency test suite
├── server/                      # @klar/server
│   ├── Dockerfile               # single-service prod image
│   ├── prisma/schema.prisma     # auth + app tables
│   └── src/
│       ├── index.js             # app wiring + static client + error handler
│       ├── auth.js              # better-auth setup + requireAuth middleware
│       ├── db.js                # PrismaClient singleton
│       ├── middleware.js        # rate limiters
│       └── routes/
│           ├── puzzles.js       # publish gate / browse / fetch / delete / report
│           └── world.js         # claim / place / stream / map
├── client/                      # @klar/client
│   ├── index.html               # shell + CSS
│   ├── vite.config.js           # dev proxy /api → :3000
│   └── src/
│       ├── main.js              # boot, auth, routing, platform flows
│       ├── sandbox.js           # Phase 1 editor/player (~1020 lines)
│       ├── auth.js              # better-auth vanilla client
│       ├── net.js               # fetch wrapper for /api
│       └── world/
│           ├── roam.js          # free-roam streaming (R=2 window)
│           └── mapview.js       # lattice map view
├── docs/                        # design docs and strategy essays
└── prototypes/phase1.html       # frozen Phase 1 artifact — regression reference
```

## Technology stack

- Runtime: Node.js 20+ (root `package.json` and CI use Node 20)
- Package manager: npm with workspaces (`core`, `server`, `client`)
- Module system: ESM (`"type": "module"` everywhere)
- Server: Express 4, Prisma 6, better-auth 1.4.22, express-rate-limit
- Database: PostgreSQL 16 (docker-compose locally; Neon pooled + direct in production)
- Client: Vite 6, three.js 0.170
- Auth: OAuth via better-auth (GitHub + Google)
- CI: GitHub Actions (`.github/workflows/ci.yml`)
- Deployment: Railway via `server/Dockerfile`; `railway.json` configures build and healthcheck

## Build and test commands

```bash
# Core test suite — zero dependencies, runs the project's truth assertions
node core/test/run.mjs
# or
npm test

# Syntax sanity — what CI runs (also available as `npm run check`)
node --check server/src/index.js
node --check server/src/routes/puzzles.js
node --check server/src/routes/world.js
node --check client/src/main.js
node --check client/src/sandbox.js
node --check client/src/world/roam.js
node --check client/src/world/mapview.js

# Local development
npm install                         # installs all workspaces
docker compose up db -d             # local Postgres
npm run prisma:migrate -w @klar/server   # first run: add --name init
npm run dev:server                  # Express API on :3000
npm run dev:client                  # Vite on :5173, proxies /api to :3000
```

### Environment setup

Copy `.env.example` to `.env` and fill in:

- `DATABASE_URL` / `DIRECT_URL` — Postgres URLs. Locally both point at `postgresql://klar:klar@localhost:5432/klarbase`. In production `DATABASE_URL` is the pooled connection and `DIRECT_URL` is the direct connection (used only by migrations).
- `BETTER_AUTH_SECRET` — generate with `openssl rand -hex 32`.
- `BETTER_AUTH_URL` — `http://localhost:3000` locally; production origin in deploy.
- `CLIENT_ORIGIN` — `http://localhost:5173` locally; production origin in deploy.
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth app credentials.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth credentials (optional).

## Testing strategy

- `@klar/core` has a zero-dependency Node test suite in `core/test/run.mjs`. It currently runs **57 assertions, 0 failures**. CI runs it on every push and PR.
- The server and client are not covered by automated tests yet; CI only syntax-checks them with `node --check`. The milestone acceptance test is an end-to-end manual smoke: register → publish → play shared link → claim `(0,0)` → place → walk in World → view on Map.
- The `prototypes/phase1.html` frozen artifact is the regression reference for the Phase 1 editor/player look-and-feel.

## Code organization

The one architectural rule is: **never reimplement `@klar/core` logic.** The core is imported by three call sites:

1. Client editor (`client/src/sandbox.js`) — pre-commit validation.
2. Client player (`client/src/sandbox.js` and `client/src/world/roam.js`) — traversal.
3. Server publish gate (`server/src/routes/puzzles.js`) — validation + solvability.

If the server's verdict can differ from the client's, publishing is broken.

### Core modules

- `components.js` — component palette, `TYPES` table defining occupancy and walk nodes, plot dimensions (`PLOT.size = [16,12,16]`), and helper key functions.
- `validate.js` — `validate(comps)`: bounds, overlap, support (must reach `y=0`), spawn/goal counts, malformed shapes. Returns `{ok, errors, warnings}`.
- `graph.js` — `buildGraph(comps, allowList)`: geometric flat/half/stair edges, illusion candidate detection, yaw-masked authored seams.
- `solve.js` — `solve()` (free turning), `solveAtYaw()` (fixed camera), `solveReport()`.
- `schema.js` — canonical JSON, stable stringify, pure-JS SHA-256, `contentHash()`.
- `ports.js` — `computePorts()` and `portsMatch()` for shared plot edges.
- `lattice.js` — `canClaim()` and `canPlace()` rules over an in-memory plot map.

### Server routes

- `POST /api/puzzles` — publish gate. Validates, solves, hashes, deduplicates, stores.
- `GET /api/puzzles?cursor&limit&author=me` — browse with cursor pagination.
- `GET /api/puzzles/:hash` — public playable document (404 if hidden).
- `DELETE /api/puzzles/:hash` — own only; blocked if placed in the world.
- `POST /api/puzzles/:hash/report` — moderation report; 3 distinct reports auto-hide.
- `POST /api/world/claims` — claim a free cell adjacent to the world.
- `POST /api/world/plots/:x/:y/place` — place a published puzzle into an owned empty cell.
- `GET /api/world/cells?x&y&r` — stream a Chebyshev window around `(x,y)`.
- `GET /api/world/map` — every claimed cell + author + placed flag.
- `GET /api/health` — healthcheck returning `{"ok":true}`.

## Code style guidelines

Match the existing style rather than imposing a new one:

- `@klar/core`: terse, banner-commented modules. Comments explain the non-obvious (maths, parity law, socket model), not the syntax.
- Functional, small modules. Avoid speculative abstraction and unrequested config knobs.
- Surgical changes: every changed line traces to the request. Do not refactor untouched code or "improve" adjacent style. If you spot dead code, mention it; don't delete it silently.
- Integer grid, 90° yaw only. No floats in geometry. This keeps illusion detection exact.
- `@klar/core` stays pure: no DOM, no I/O, no three.js, no globals. If it needs a browser API, it doesn't belong there.

## Security considerations

- **The publish gate (`server/src/routes/puzzles.js`) is the security boundary.** Client-side validation is UX only. Anything stored in the database has passed server-side `validate()` and `solveReport()`.
- All mutating routes (`publish`, `delete`, `report`, `claim`, `place`) require login via `requireAuth`.
- Rate limiting is applied per action: publishing (20/hr), reports (30/hr), world actions (60/hr).
- Puzzle documents are content-addressed by SHA-256. Identical content produces the same hash and is deduplicated; edits produce a new hash.
- Placed plots are immutable: once a `Plot.puzzleHash` is set, the API provides no mutation path. This protects neighbouring plots from rotting.
- Never run destructive SQL or migrations against the production `DATABASE_URL` / `DIRECT_URL`; those point at the live Neon database. Local dev uses the docker-compose Postgres only.
- `.env` and `dist/` are gitignored. Do not commit secrets or generated build outputs.

## Deployment process

The production shape is one Docker service serving API + built client, with a managed Postgres behind it. No CORS surface is required.

1. Build the production image: `server/Dockerfile` builds `@klar/client`, installs dependencies, generates Prisma client, and runs `prisma migrate deploy` on boot.
2. Railway reads `railway.json` and deploys from `server/Dockerfile`. Healthcheck path is `/api/health`.
3. Required environment variables are listed in `.env.example` and `DEPLOYMENT.md`.
4. After deploy, verify `GET /api/health` returns `{"ok":true}` before considering a change complete.

## Useful conventions

- The product/UI term for a published build is a **maquette**; the internal code name remains `Puzzle` (table, routes, variables). Do not rename code symbols in passing.
- A **seam** is an authored illusion edge. Seams are plot-local and never cross plot boundaries.
- A **port** is a boundary walk node that can step flat into a neighbouring plot.
- When editing `ENGINEERING.md` or `AGENTS.md`, keep them coherent and up to date if you change architecture, data model, maths, or deployment.
