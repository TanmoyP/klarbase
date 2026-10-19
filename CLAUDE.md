# Klarbase — Claude Code Project Instructions

> Read on every session start. These OVERRIDE default behaviour.
> Start sessions from the **klarbase** folder (not another project), so tools, memory and
> launch configs belong to Klarbase alone.

---

## 🔴 CRITICAL SAFETY RULES — READ FIRST

1. **`DATABASE_URL` / `DIRECT_URL` in production point at the live Neon database.** Never run migrations, `DROP`, `DELETE`, `TRUNCATE`, seeds or destructive SQL against them. Local dev uses the docker-compose Postgres (`postgresql://klar:klar@localhost:5432/klarbase`).
2. **Never `git push --force` or `git reset --hard`** on any branch.
3. **Never push directly to `main`.** Feature branch + PR.
4. **Never add a tile type or rule without a schema decision.** The tile vocabulary and the 7 rules are the game's constitution. A new one means: `rules.js` + solver + tests + every official isle re-verified + art + builder tool + `isles/README.md` — together, priced as such.
5. **Never reimplement `@klar/core` logic.** The game, builder, solver, PR checks, artifact tool and server gate all import `core/src/isle/`. If any of them could disagree about an isle, the product is broken.
6. **Never run contributor-submitted code in CI.** Isle checks only parse JSON. Keep workflows on `pull_request` (not `pull_request_target`), read-only, with no secrets.

---

## What is Klarbase?

A cozy browser puzzle game of floating **isles**: turn-based grid puzzles (stairs, ledges,
crates, ice, plates & gates, levers & bridges, keys & doors, portal arches) played by **Pip**.
Play 24 official isles, community isles merged on GitHub, or isles shared online; build your
own. Every isle is solver-verified. Open source; contributors are credited.

**Stack:** npm workspaces — `@klar/core` (pure, zero deps), `@klar/client` (Vite + three.js,
all procedural art/audio), `@klar/server` (Express 4 + Prisma + better-auth). Neon Postgres.
Single Railway service + Cloudflare.

**Engineering source of truth: [`ENGINEERING.md`](ENGINEERING.md).** Format & rules for
players/contributors/bots: [`isles/README.md`](isles/README.md). Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## 📌 END-OF-SESSION PROTOCOL (every session)

If you changed **rules, the data model, content, infra, or the roadmap**:
1. Update the relevant section of `ENGINEERING.md`.
2. Append a dated entry to its **Session Log** (§13), newest first.

---

## Before implementing anything

1. Read `ENGINEERING.md` for the current state and the decision you're touching.
2. If it changes the rules, read constitution rule 4 above first.
3. Confirm the change keeps client, server and CI on the same `@klar/core` code path.
4. A new table storing user data needs its cascade delete and an `ENGINEERING.md` §8 update.

---

## Rules of the codebase

- **`@klar/core` is pure** — no DOM, no I/O, no three.js. Same result in browser and Node.
- **The server publish gate is the security boundary.** Client checks are UX only.
- **Content hash = identity** (`isleHash`): geometry + theme only. Immutable rows.
- **Official isles** live in `core/src/isle/isles.js`. Add or edit → `node core/test/isles.mjs`
  (it re-solves everything and prints the true par/solution) → `node tools/author.mjs` → commit `content/isles/`.
- **Community isles** live in `isles/community/<author>/<id>.json` and are judged by
  `tools/check-isles.mjs` + `core/src/isle/contrib.js`. Don't loosen a rule to let one isle in.
- **Solutions are earned** (signed in, cleared, or active-play effort). Don't add new places
  that print a route to anonymous players.
- **Playing and building are open to everyone.** Only sharing online needs login.
- **Art is procedural.** No model, texture or audio files — keep isles a few KB of text.

## Production rules (hard-won — detail in ENGINEERING.md §12)

- **better-auth stays exact-pinned at `1.4.22`** (1.7 expects `Account.issuer` → OAuth 500).
- **Deploy** is `railway up`; its `--ci` log stream can time out while the build still lands —
  verify via the served bundle hash and `GET /api/health` → `{"ok":true}`.
- Neon `DIRECT_URL` = pooled URL minus `-pooler`. OAuth callbacks must match `BETTER_AUTH_URL` exactly.
- The Dockerfile must copy `isles/` — community isles are bundled at build time.

## Code style

- Match the terse, banner-commented style of `@klar/core`. Comment the non-obvious (rules, solver budgets, why a check exists), not the syntax.
- Functional, small modules. No speculative abstraction or config knobs nobody asked for.
- **Surgical changes.** Every changed line traces to the request. Mention dead code; don't silently delete it.

## Commands

```bash
npm test                         # isle engine + official isles + contribution rules + legacy engine
node tools/check-isles.mjs       # the community-isle PR gate (or pass one file path)
node tools/author.mjs            # verify official isles, regenerate content/isles/
npm run dev:client               # play + build at :5173 (no server needed)
npm run dev:server               # API at :3000 (needs .env + docker compose up db -d)
npm run check                    # syntax sanity
```

## Token discipline

- Read narrowly: grep, then read the span you need. Core files are small; `world.js`/`main.js` are not.
- Don't re-read files you just edited. Preserve code, commands, errors and numbers exactly; compress prose.
- State assumptions and stop when confused, especially around rules and solution gating.

## Working agreement

- Feature branches → PR → green CI (`engine`, `isles`, `sanity`) → merge.
- Update `ENGINEERING.md` at session end if anything structural changed.
- Use Plan Mode before new features, significant design tradeoffs, and bugs that survive the first attempted fix.
