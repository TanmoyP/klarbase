# Contributing to Klarbase

Thanks for wanting to build here! The easiest and most loved contribution is an
**isle** — a small floating puzzle that everyone can play, credited to you.

## Add your isle in 5 steps

1. **Build it** at [klarbase.dev](https://klarbase.dev) → **Create** (or run the game locally, see below).
   Start from a blank meadow or remix any official isle. The status line tells you live
   whether it's solvable and its par. Every tile and setting is explained in the builder's
   **📖 How to build** guide ([klarbase.dev/how-to-build](https://klarbase.dev/how-to-build)).
2. **Export it** — type your GitHub username in the builder and press **Export for GitHub**.
   The builder runs the *same checks as CI*; if anything would fail, it tells you what to fix.
   You get a file like `sundial-steps.json` with `par` and `solution` already filled in.
3. **Put it in your folder**: `isles/community/<your-github-username>/<id>.json`
   (the file name must equal the isle's `id`, and the folder must equal `author`).
4. **Check it locally** (optional, needs only Node 20 — no install):
   ```bash
   node tools/check-isles.mjs isles/community/<you>/<id>.json
   ```
5. **Open a pull request** that only touches your own folder. The `isles` check runs
   automatically and posts a summary with your isle's map, par and solution. When every
   check is green, the PR is mergeable — and once merged, your isle ships in the game's
   **Community** tab with “by @you” on it.

## What the checks enforce (and why)

Every pull request runs `node tools/check-isles.mjs`. It never runs any code you submit —
it only reads your JSON and judges it with the game engine. A PR can't be merged until it passes.

| Rule | Why |
|---|---|
| Valid format: known tiles, rows the same width, ≤ 14×14, one start `S`, at least one goal `G`, arches in pairs | so every isle loads |
| **Solvable** within the solver's budget (200,000 states) | so every isle can be finished |
| `par` equals the shortest solution, and `solution` is one shortest route that really wins | so stars are fair and the replay works |
| At least **6 moves** and at least **one mechanic** (stairs, ledges, crates, ice, plates, levers, keys, arches) | so it's a puzzle, not a walk |
| **Unique** — not identical to an official or another community isle | no copies |
| `author` = your folder = **your GitHub username**, and your PR only changes `isles/community/<you>/` | credit stays honest: nobody can submit, edit or remove an isle credited to someone else |
| Plain-text `name` (3–40 chars), `hint` (≤ 140) and `description` (≤ 240), **no links** | no spam |
| `tier`, if present, is one of `breeze` `easy` `tricky` `hard` `fiendish` `mythic` | difficulty labels players can trust |
| Only known fields, file under 8 KB | keeps isles small and reviewable |

## The isle file

```json
{
  "schemaVersion": 5,
  "id": "sundial-steps",
  "name": "Sundial Steps",
  "author": "TanmoyP",
  "theme": "oasis",
  "hint": "The arch drops you on the wrong side of the spring. Make your own way home.",
  "rows": [
    "- ,1 G1 - - -",
    "- .1 ^ - - -",
    ". . . ~ C .",
    "~ ~ ~ ~ . .",
    "S , p - . p"
  ],
  "par": 9,
  "solution": "RRUULLLUU"
}
```

`rows` is the whole puzzle: one token per tile, separated by spaces. Row 0 is **north**
(far from the camera). A token is a tile character plus an optional height digit `0`–`5`.
The full tile table and the rules of the game are in [`isles/README.md`](isles/README.md).

Optional fields: `hint`, `description`, `credit` (a display name if you'd like one), and
`tier` — your gut call on difficulty: `breeze`, `easy`, `tricky`, `hard`, `fiendish` or `mythic`
(pick it in the builder; it's exported with the file). Every isle shows a difficulty score from
0 to 100: it starts from your tier (or the solver's estimate if you leave it out) and settles as
people play. `tier` never changes the isle's identity, and a hard isle is never required —
simple isles are welcome. The builder's **"make it harder"** hints are optional suggestions.

**Maps (schemaVersion 6).** An isle can also be an *archipelago map*: up to 3 isles linked by
gateway arches, optionally with Sky Scales pans. Such a file has `"schemaVersion": 6` and
`"storeys": [{ "rows": [...], "at": [x, z, altitude] }, ...]` instead of `rows` — the builder
writes it for you when you add a second isle or a pan. Same checks, same limits. Format and
rules: [`isles/README.md`](isles/README.md#archipelago-maps-schemaversion-6).

Themes: `jungle`, `oasis`, `tropical`, `urban`, `mountain`.

Daily Isles (`isles/daily/YYYY-MM-DD.json`) use the same format with a required `tier`; see
[`isles/daily/README.md`](isles/daily/README.md).

## What makes a great isle

- **One clear idea.** The best isles have a single "aha" — then stop.
- **Fair, not fiddly.** If the solution needs pixel-perfect luck, it's not fair. The engine is turn-based, so it never does.
- **Readable.** Give the player a reason to look around: a goal they can see but not reach.
- **Use the hint for a nudge, not the answer.**

## Changing code

Code changes (engine, client, server, tools) are welcome too — open an issue first for
anything big. These need a maintainer's review (see `.github/CODEOWNERS`) on top of the checks.

```bash
npm install
node core/test/isles.mjs   # engine + official isles + contribution rules
node core/test/difficulty.mjs  # difficulty audit + score, tiers, Twist isles, Daily Isle
node core/test/run.mjs     # legacy world engine
npm run dev:client         # the game at http://localhost:5173 (no server needed to play/build)
```

The one architectural rule: **the rules live only in `@klar/core`** (`core/src/isle/`).
The game, the solver, the PR checks and the server's publish gate all import the same
module, so they can never disagree.

## For maintainers: making the checks required

When the repository is public, add a branch ruleset for `main`
(Settings → Rules → Rulesets → New branch ruleset):

- **Require status checks to pass:** `engine`, `isles`, `sanity` (require branches to be up to date)
- **Require a pull request before merging**, with **Require review from Code Owners**
  (code paths are owned in `.github/CODEOWNERS`; `isles/community/` is not, so an isle-only
  PR is mergeable as soon as the checks are green)
- **Block force pushes** and **restrict deletions**

Or from the command line (run once, as a repo admin):

```bash
gh api -X POST repos/TanmoyP/klarbase/rulesets --input .github/ruleset-main.json
```

People listed in [`isles/MAINTAINERS`](isles/MAINTAINERS) may edit any community folder
(e.g. to fix a broken isle).

## License

By opening a pull request you agree that your contribution — code or isle — is released under
the project's [MIT License](LICENSE). Your isle keeps your name on it in the game.
