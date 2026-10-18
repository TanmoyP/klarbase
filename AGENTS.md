# Klarbase — Agent Orientation

> Read this first. Written for AI coding agents with no prior context.

## What this is
Klarbase is a cozy, turn-based browser puzzle game of floating **isles**. The player guides
**Pip** across a small grid using one key per move; isles combine stairs, ledges, crates,
water, ice, plates & gates, levers & bridges, keys & doors, and paired portal arches. Every
isle is checked by a solver: solvable, with an exact par and a shortest "smart solution".
Anyone can build isles; community isles are contributed by pull request and credited.

Authoritative docs: [`ENGINEERING.md`](ENGINEERING.md) (engineering truth),
[`isles/README.md`](isles/README.md) (format + rules), [`CONTRIBUTING.md`](CONTRIBUTING.md).
v1 history (a camera-illusion "maquette" game) is in `docs/archive/`.

## Layout
```
core/src/isle/   format.js (parse, hash) · rules.js (step) · solve.js (BFS) · contrib.js (PR rules) · isles.js (24 official)
core/src/*.js    legacy voxel engine — only for the deferred world API
core/test/       isles.mjs · run.mjs
client/src/      main.js (app) · builder.js · game/{world,props,pip,session,audio,themes}.js
server/src/      index.js · auth.js · routes/puzzles.js (isle gate) · routes/world.js (deferred)
isles/community/ <github-user>/<id>.json — bundled into the client
content/isles/   generated official-isle artifacts (deterministic)
tools/           check-isles.mjs (PR gate) · author.mjs (artifacts, --seed)
.github/         ci.yml (engine, isles, sanity) · CODEOWNERS · ruleset-main.json · PR template
```

## The one rule
**The rules exist only in `@klar/core`.** Client, builder, solver, CI checks, artifact tool and
server gate all import it. Never reimplement a rule anywhere else.

## Commands
```bash
npm install
npm test                     # 192 isle assertions + 57 legacy
node tools/check-isles.mjs   # community isles (what PRs run)
node tools/author.mjs        # official isles + artifacts
npm run dev:client           # :5173
```

## Conventions
- Product word: **isle**. Internal code word for a stored isle: `Puzzle` (table, `/api/puzzles`) — don't rename in passing.
- Moves: `U D L R` (north/south/west/east), `X` (use a lever). Row 0 = north.
- Adding a tile type or rule is a schema decision (see `CLAUDE.md` safety rule 4).
- CI must stay safe for strangers' PRs: `pull_request` trigger, read-only, no installs, no contributor code executed.
- Solutions are earned in the UI (signed in / cleared / effort) — don't expose them elsewhere.
- Update `ENGINEERING.md` (+ Session Log) when you change rules, data, content, infra or roadmap.
