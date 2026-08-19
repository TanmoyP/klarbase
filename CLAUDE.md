# Klarbase — Claude Code Project Instructions

> Read on every session start. These OVERRIDE default behaviour.

---

## 🔴 CRITICAL SAFETY RULES — READ FIRST

1. **`DATABASE_URL` / `DIRECT_URL` in production point at the live Neon database.** Never run migrations, `DROP`, `DELETE`, `TRUNCATE`, or destructive SQL against them. Local dev uses the docker-compose Postgres (`postgresql://klar:klar@localhost:5432/klarbase`) — use that.
2. **Never `git push --force` or `git reset --hard`** on any branch.
3. **Never push directly to `main`.** Feature branch + PR. (Exception: the initial repo import commit.)
4. **Never add a socket type or component mechanic without a schema decision.** The socket model is the project's constitution (spec §5, risk #5). Adding one is a `schemaVersion` bump, a solver update, and an editor change — priced as such, not slipped in.
5. **Never reimplement `@klar/core` logic.** One source of truth, three call sites (editor, player, publish gate). If the server's verdict can differ from the client's, publishing is broken.

---

## What is Klarbase?

A browser game: Monument Valley impossible geometry meets LEGO building. Players build isometric grid puzzles with authored optical-illusion seams, publish them (immutable, content-hashed), and place them into a shared walkable lattice world. Solo founder, sub-€6/month infra.

**Stack:** npm workspaces monorepo — `@klar/core` (pure logic, zero deps), `@klar/server` (Express 4 + Prisma + better-auth), `@klar/client` (Vite + three.js). Postgres (Neon, Frankfurt). Deploy: single Railway service (Docker) serving API + client, Cloudflare in front.

**The engineering source of truth is [`ENGINEERING.md`](ENGINEERING.md).** The design truth is [`docs/phase0-spec-v4.5.md`](docs/phase0-spec-v4.5.md) (closed — changes need a version bump).

---

## 📌 END-OF-SESSION PROTOCOL (do this every session)

If you changed **architecture, the data model, the maths, infra, or the roadmap**, you MUST:

1. Update the relevant section of `ENGINEERING.md`.
2. Append a dated entry to the **Session Log** (§9) — newest first: what changed, what was learned, what's now unblocked.

A stale source of truth is worse than none. This is not optional.

---

## Before implementing ANY feature

1. Check `ENGINEERING.md` for current state, the phase ledger, and known discrepancies (§5.3 — especially **D2, the cell-size mismatch**).
2. Check `docs/phase0-spec-v4.5.md` for the design rule. If a decision isn't in the spec, the answer is **"defer," not "improvise."**
3. Confirm your change doesn't fork `@klar/core` behaviour between client and server.
4. If you add a table storing user data, add its cascade delete and update `ENGINEERING.md` §4.

---

## Architecture rules

- **`@klar/core` is pure** — no DOM, no I/O, no three.js, no globals. Isomorphic (same result in browser and Node). If it needs a browser API, it doesn't belong in core.
- **The publish gate (`server/src/routes/puzzles.js`) is the security boundary.** Client validation is UX only. Never trust the client.
- **Content hash = identity.** Immutable, content-addressed puzzles. Edits produce new hashes. Never mutate a placed plot.
- **Illusion seams are plot-local** — never cross plot boundaries (this is what makes streaming safe). Don't relax this.
- **Integer grid, 90° yaw only.** No floats in geometry, ever — it's what keeps illusion detection exact.
- **DB access via Prisma `$transaction`** for claim/place (atomic guards against races already in place). Pooled `DATABASE_URL` at runtime; `DIRECT_URL` for migrations only.

---

## Production rules (hard-won 2026-08-19 — full detail in ENGINEERING.md §8.9)

- **Never bump `better-auth` off `1.4.22`** without regenerating the Prisma schema (`npx @better-auth/cli generate`) + migrating. 1.7.x expects `Account.issuer` and 500s the OAuth callback against our schema.
- **Gating model:** building/playing/exporting/importing-a-file are local & open to all (`gates.canBuild=true`); **only publish + world require login.** Shared links (`GET /api/puzzles/:hash`, live) are public. Don't re-gate building.
- **New maquettes MUST pass `node tools/author.mjs`** (validate + solve + seam load-bearing) before going into `sandbox.js` PRESETS; keep the two in sync (CI enforces). Seam recipe: nodes +(d,d,d) apart at yaw 0; a seam must be load-bearing.
- **Greenery** is emergent grass-on-blocks, client-side, non-serialized. Presets seed it client-side. Author-owned greenery for user maquettes is deferred (touches schema + hash).
- **Deploy:** `railway up` (local upload + `server/Dockerfile`); the `--ci` log stream may time out but the build still lands — verify via bundle hash + `/api/health`. Neon `DIRECT_URL` = pooled URL minus `-pooler`. OAuth callbacks must match `BETTER_AUTH_URL` origin exactly.
- **Verifying UI here:** the browser pane can't composite — use `read_page`/`get_page_text`/`read_console_messages`, not screenshots.

## Code style

- Match the existing terse, banner-commented style of `@klar/core`. Comments explain the *non-obvious* (the maths, the parity law, the socket model) — not the syntax.
- Functional, small modules. No speculative abstraction, no config knobs nobody asked for (spec risk #5 applies to code too).
- **Surgical changes.** Every changed line traces to the request. Don't refactor untouched code or "improve" adjacent style. If you spot dead code, mention it — don't delete it.
- Simplicity test: would a senior engineer call this overcomplicated? If yes, simplify.

---

## Commands

```bash
# Core — the truth suite (zero deps, run this constantly)
node core/test/run.mjs

# Verify the curated Playset (validate + solve + seams load-bearing) — CI runs this too
node tools/author.mjs

# Local dev
cp .env.example .env            # fill BETTER_AUTH_SECRET + OAuth creds
docker compose up db -d
npm install
npm run prisma:migrate -w @klar/server   # first run: --name init
npm run dev:server              # :3000
npm run dev:client              # :5173 (proxies /api → :3000)

# Syntax sanity (what CI runs)
npm run check
```

**After any deploy:** hit `GET /api/health` — must return `{"ok":true}` before closing the PR.

---

## Token discipline (Caveman-inspired)

To keep sessions cheap and focused:

- **Read narrowly.** Use search/grep and read only the relevant span, not whole files, once you know the target. `@klar/core` files are small — read them fully; `sandbox.js` (~1020 lines) — read the section you need.
- **Don't re-read files you just edited** to verify — the tools error if an edit fails.
- **Preserve exactly** in output: code, commands, error text, file paths, numbers. Compress prose, never fidelity.
- **State assumptions and stop when confused** (Karpathy): surface ambiguity before coding, don't guess silently. Especially around the socket model and the cell-size discrepancy.

---

## Working agreement

- Feature branches → PR to `main`. Never push to `main` directly.
- CI (`.github/workflows/ci.yml`) runs the core suite + `node --check` on every push. Green before merge.
- No branch protection exists (private repo) — this is discipline, not enforcement.
- Update `ENGINEERING.md` at session end if architecture changed (see protocol above).
