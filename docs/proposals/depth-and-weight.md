# Proposal — Depth, difficulty and one new physics: **Weight**

> Status: **accepted 2026-10-19 — see [§0 Decisions](#0-decisions-2026-10-19).** Phases 1–3 and K10 shipped (2026-10-19/20); Phase 4 in progress — see ENGINEERING.md §13.
> Every new tile here is a schema decision (CLAUDE.md rule 4). Written after the first
> real-player feedback: *"not challenging enough, no new or novel mechanic."* Data from
> `node tools/difficulty.mjs`; research sources at the end.

---

## 0. Decisions (2026-10-19)

The founder approved the proposal with these decisions. They override anything below that disagrees.

| # | decision | detail |
|---|---|---|
| **K1** | **Weight is the next physics** | Sky Scales → Balloon (weight 0 + glide) → Buoy (weight −1). §3. |
| **K2** | **A catch is optional** | Simple isles stay valid; nothing in the PR gate asks for a catch. The builder shows the live difficulty score and **"make it harder" hints** from the audit (e.g. *walking toward the star wins — block the direct line*; *no move can go wrong — put a crate near water or a ledge*; *3 shortest routes — narrow it to one*). Designers of official Twist isles still write their catch down first. |
| **K3** | **Every isle has a difficulty score, and it evolves** | §4. Starts from the maker's **gut call** (declared tier); real player results take over as plays accumulate. Never derived from tile counts or layout. Isles without a declared tier get a provisional estimate from the solver audit until players weigh in. |
| **K4** | **Multi-storey isles (Archipelago maps)** | Up to 3 isles per map at different positions and altitudes — one can float directly above another — linked by **gateways**. §3.4. |
| **K5** | **Danger = cozy hazards, no gore** | Turn-based hazards with visible timing; getting hit bonks Pip and rewinds that move. Optional dark **Night** theme for mood. §3.6. |
| **K6** | **Wind = gust vents** | Optional vent tiles blow along a line and push only light things (weight ≤ 0). Ships with the balloon. §3.5. |
| **K7** | **Anonymous per-isle stats** | Aggregate counters per isle (started, cleared, moves, hints, restarts, time buckets). No user IDs, no cookies, nothing per person. One line in the privacy note. Powers K3 and the moves histogram. |
| **K8** | **Staged execution** | Phase 1 and Phase 2 run in parallel (separate worktrees and PRs); Phases 3 and 4 run one after another, since every rule edits the same engine files. Founder reviews and merges each phase. Drift (§3.7) moves to the backlog. |
| **K9** | **Stone + brace rule** | Pip carries one thing at a time: nothing = weight 1, balloon = 0, **stone = 2** (from a stone pile; put back only at a pile, so it is never a free counterweight). **Brace rule:** pushing *into* a gust needs weight greater than the gust's strength (normal gust = 1), so only stone-Pip can push a crate upwind. A pushed crate stays put (weight 1 isn't moved by strength 1). Strong gales (strength 2) deferred. §3.5. Phase 3. |
| **K10** | **Daily isle agent** | A triggerable Claude Code agent (`/daily-isle`) that reads the project history, rules, past dailies and player stats, then designs one new solver-verified isle per day into `isles/daily/YYYY-MM-DD.json` and opens a PR. Phase 4; built as soon as Phase 1's daily folder exists. **Built 2026-10-19, local and sophisticated:** `isle-smith` agent + `tools/isle-lab.mjs` (necessity proofs, shortcut finder, similarity, replay) + local playtest; first daily 2026-10-20. |

---

## 1. The problem, measured

The solver can map every possible situation in an isle. Doing that for all 24 official isles:

| metric (avg of 24) | value | what it means |
|---|---|---|
| reachable states | **249** (max 4,149) | a player can almost brute-force any isle by wandering |
| traps on the par route | **0.7** | moves that can ruin the puzzle — under one per isle, so few decisions matter |
| "walk toward the star" wins | **5 / 24** | greedy play solves a fifth of the game |
| par | 12.7 | length isn't the problem; *depth* is |

For comparison, a good mid-game Sokoban level has tens of thousands of states and several
irreversible decisions. Our isles are tutorials — good ones, but every isle is a tutorial.

**Conclusion:** we need (a) harder isles built from the rules we already have, and (b) one new
idea with real depth. Not five new ideas — the research below is clear that piling on mechanics
hurts onboarding.

## 2. What the research says works

| finding | evidence | what we do with it |
|---|---|---|
| Most players never reach the end of a hard puzzle game | Baba Is You on Steam: 53% clear the first area, **8.4%** beat the game | keep a gentle main path; put the brutal stuff on an optional side path |
| Optional hard variants keep both audiences | Celeste's B-/C-sides: "twists and expansions" of normal levels, opt-in | each chapter gets **Twist** isles — same place, one twist, much harder |
| Easier on-ramps rescue bounced players | Snakebird's devs shipped *Snakebird Primer* for people who "bounced off" | our 24 isles become the Primer; label them honestly |
| Being stuck is fine if you can go elsewhere | Primer and A Monster's Expedition: non-linear, several puzzles open at once | always ≥ 3 open isles; never a single blocking gate |
| Great puzzles start from one intended action | Alan Hazelden: pick the action, build a draft, then "whack a mole" the shortcuts | our solver *is* the whack-a-mole: it lists every unintended route |
| The "catch" is an apparent contradiction | GMTK: you need to stand on the button **and** be at the door | official Twist isles are designed around a written catch; for everyone else it's an optional builder hint (K2) |
| Optimising after solving doubles replay | Zachtronics histograms: "just solving the levels was only half the fun" | after a clear, show where your move count sits among all players |
| One shared daily puzzle + spoiler-free share | Wordle: 90 players → 300k in two months, spread by shared result grids | **Daily Isle** with a shareable result (moves vs par, no route) |
| Player-made levels sustain a game | Super Mario Maker: 7.2M courses, 600M plays in year one | we already have the builder + PR gate; feature community isles daily |

## 3. The new idea: **Weight**

One concept, introduced once: **everything weighs something.**

```
Pip 1   ·   crate 1   ·   buoy −1   ·   Pip holding a balloon 0
```

Plates already behave as if they care about weight (Pip or a crate presses them). We make that
explicit and give it three new expressions, each a **mirror of a rule the player already knows**,
so onboarding is "the same thing, the other way round", not a new manual.

### 3.1 Sky Scales — *heights decided by weight* (build first)

Two pans of an isle hang from one vine. The heavier pan sinks one level, the other rises one.

- **Rule:** after each move settles, compare total weight on pan A and pan B. Heavier pan = base − 1,
  lighter = base + 1, equal = base. Things on a pan ride with it. No cascades.
- **Built on:** the existing height rules (walk level, hop down 1, stairs only along the slope).
  Scales just change heights — every existing rule then does the work.
- **Solver cost:** none. Pan heights follow from where Pip and the crates are, so the solver's
  state doesn't grow. This is the cheapest high-depth rule we could add.
- **Catches it enables:**
  - *Your own weight is in the way* — the pan you need high sinks the moment you step on it.
  - *Spend a crate* — the only counterweight is the crate that should also fill the spring. Which
    problem does it solve? Or is there an order where it solves both?
  - *The crane* — step off at the right moment so a pan rises under a crate, lifting it to a ledge
    no push could reach.
- **Risk/reward:** a crate left as counterweight is an immediate win and a long-term loss.
- **Novelty:** I found no game doing this. Nearest relatives: isles that crumble under weight
  (Crumble Tumble), crate pulleys (Ahoist Cratey). Klarbase's floating isles make it feel native.

### 3.2 Balloon — *weight reduction, and a new move: glide*

Pip can pick up a balloon from a post. While holding it Pip weighs **0**.

- **Immediate benefit — glide:** stepping off an edge doesn't fail; Pip drifts forward one tile per
  level of height lost and lands on the first tile low enough. Height becomes range: a higher
  start (thanks, scales) means a longer glide.
- **Long-term cost:** weighing 0, Pip can't press plates, can't tip scales, and is too light to push
  crates. **Use** lets the balloon go — forever.
- **Built on:** the plate rule (needs weight), the push rule, the hop-down rule (extended into a glide).
- **Catch:** *glide or push* — the gap only a glide can cross is on the far side of the crate you
  still need to push. Do things in the right order or lose the balloon too early.
- **Novelty:** small jam games use balloons; I found none where it's a trade inside a weight system.

### 3.3 Buoy — *negative physics*

A crate tied to a balloon. It weighs **−1**.

- **Mirror rules:** crates fall down a 1-level ledge → **buoys float up** onto a tile 1 level higher.
  Crates sink in water and fill it → **buoys float**: a stepping stone that can be pushed along the
  channel but never fills it.
- **On scales** a buoy *lifts* its pan; on plates it presses nothing.
- **Catch:** *the bridge that drifts* — a buoy is a moving one-tile bridge; where you leave it
  decides which shore you can reach next.

### 3.4 Archipelago maps — multi-storey isles (K4)

A map can hold **up to 3 isles** ("storeys"), each its own grid (≤ 14×14), placed at an offset and
an altitude, so one isle can hang directly above another. **Gateways** link them: a paired arch
that carries Pip from one storey to another, exactly like today's arches but across isles.

- **Built on:** the existing arch rule; inside each storey every rule is unchanged.
- **Format:** new `schemaVersion: 6` with `storeys: [{ rows, at:[x, z, altitude] }]`; v5 single-isle
  files stay valid forever. Gateways pair across storeys.
- **Engine:** storeys are flattened into one indexed cell list; movement never crosses a storey
  edge except through a gateway. Solver state is unchanged in shape.
- **With weight:** Sky Scales whose pans are on **different storeys** — load the lower isle to lift
  the upper one — is the signature puzzle of the chapter.
- **Camera:** frames the storey Pip is on; a toggle zooms out to the whole map.

### 3.5 Gust vents — wind decides by weight (K6)

A vent tile points one way and blows along its line until something solid or higher blocks it.
After each move, every **light** thing in a gust (balloon-Pip, buoys) is pushed one tile downwind.
Crates and normal Pip ignore it. Gusts stop at isle edges (they never blow anything off).
Built on the push rule; no new state.

**Stone and the brace rule (K9).** Pip holds one thing at a time:

| Pip holding | weight | scales | plates | in a gust | glide |
|---|---|---|---|---|---|
| nothing | 1 | counts 1 | presses | stands | no |
| balloon | 0 | ignored | no | blown | yes |
| stone | 2 | counts 2 | presses | stands firm | no |

Pushing *into* a gust needs weight greater than the gust's strength (1 for a normal vent), so a
crate can only be pushed upwind by stone-Pip. Stones come from a pile and go back only at a pile.
The trade: the stone wins the wind and outweighs a crate on scales, but rules out the balloon.
State adds one field (what Pip holds).

### 3.6 Cozy hazards (K5)

Deterministic, telegraphed, turn-based: e.g. a **thorn sweeper** that turns a quarter each move,
a **rolling boulder** that travels its lane one tile per move. If a hazard would reach Pip, Pip
bonks and the move is undone (it doesn't count). No injury is shown. Adds *avoid* and *timing*
puzzles — goals stop being "walk toward the star". Solver state gains one turn counter (mod the
hazards' shared cycle, capped at 12). An optional dark **Night** theme (lanterns, fireflies) gives
mood without gore.

### 3.7 Backlog: Drift (the big swing)

Whole isles that sail one cell when Pip raises a sail, docking with others — you rearrange the
archipelago while standing on it. No game found doing this, and it would be striking, but it
changes the core data model (cells stop being static). **Research spike only after Weight ships.**

### Why weight, and not plants or gravity

Researched and rejected as not new: plants that grow and push (Sokoseed, Sokobloom, Wondervine),
rotating the view to change gravity (Space Revolver, Flip My World). Weight fits the setting
(floating isles hang on vines and balloons), reuses our rules, and stays readable at a glance.

## 4. Difficulty: from super easy to "impossible" (always solvable)

### 4.1 The difficulty score (K3) — gut first, players decide

Every isle shows a **score from 0 to 100** and its tier, always.

1. **Prior = gut call.** Official isles: the designer's `tier` in `isles.js`. Community and shared
   isles: the author picks a tier in the builder (stored as `tier` in the isle file). If no tier was
   declared, the prior is a provisional estimate from the solver audit (table below).
2. **Observed = what players did**, from the anonymous stats (K7): clear rate, hints per attempt,
   median moves over par, median time to clear, restarts. Combined into 0–100.
3. **Score = (K · prior + n · observed) / (K + n)**, with n = attempts and K = 20. The maker's gut
   counts like 20 players; by a few hundred plays the crowd has decided. Recomputed as stats
   arrive, so the score keeps evolving.
4. Until n ≥ 20 the card says **"settling"** next to the tier. The builder warns (never blocks) when
   the gut call and the audit disagree badly — e.g. declared Mythic but walking toward the star wins.
5. One pure function in `@klar/core` (`difficulty.js`) computes it, so client, server and the
   daily pick always agree.

Tier bands on the score: Breeze 0–15 · Easy 15–35 · Tricky 35–55 · Hard 55–72 · Fiendish 72–88 · Mythic 88–100.

### 4.2 Audit targets (designer guidance and provisional prior)

Used to design official isles and as the provisional prior when no tier is declared:

| tier | reachable states | traps | greedy wins? | shortest routes | where |
|---|---|---|---|---|---|
| Breeze | < 50 | 0 | may | any | first isle of each chapter |
| Easy | 50–300 | ≤ 1 | no | any | today's 24 isles live here |
| Tricky | 300–3k | ≥ 2 | no | ≤ 6 | main path, late chapter |
| Hard | 3k–30k | ≥ 3 | no | ≤ 4 | **Twist** isles |
| Fiendish | 30k–150k | ≥ 4 | no | ≤ 2 | Twist isles, Weight chapter end |
| Mythic | > 150k or ≥ 6 traps | — | no | 1 | unlocked by seeds; for the 8% |

- The tier shows on every card, so players choose their pain (Celeste) and nobody hits a wall by
  surprise (Snakebird).
- **Elegance rule:** a hard isle must stay small (≤ 40 tiles, ≤ 3 mechanics). Difficulty from the
  catch, not from size.
- **Solver headroom:** the hardest isle today is 4,149 states; the CI budget is 200,000, so
  Fiendish fits as is. Mythic official isles get a bigger offline budget in `tools/author.mjs`.
- **Hints and earned solutions** stay as they are; on Mythic the free hint is off.

## 5. Risk/reward and stickiness (no new physics needed)

- **Seeds:** one optional seed per isle, placed *off* the par route. Taking it costs moves — stars
  or seed, or the harder both. Seeds unlock Mythic isles. The solver computes both pars.
- **Your-moves histogram** after a clear (Zachtronics). Needs anonymous per-isle move counts.
- **Daily Isle:** one isle a day, same for everyone (alternating official Twist and community),
  with a spoiler-free share card: `Klarbase #42 · 18 moves (par 17) · ★★☆`.
- **Community spotlight:** the daily slot credits the author — a reason to submit isles.

## 6. Plan

| phase | what | new rules? | runs |
|---|---|---|---|
| **1 · Depth with what we have** | `core/src/isle/difficulty.js` (audit + K3 score); anonymous stats (K7); tier + score on every card; `tier` field for isles; builder score + "make it harder" hints; 5 **Twist** isles (Hard–Fiendish, existing mechanics); **Daily Isle** + share card | no | parallel with 2 |
| **2 · Archipelago + Sky Scales** | schema 6 storeys + gateways (K4); Sky Scales (K1) incl. pans across storeys; art, builder, tests; 8 isles Tricky → Mythic | yes | parallel with 1 |
| **3 · Weight II** | Balloon & glide, Buoy, Gust vents (K6), **Stone + brace rule (K9)**, seeds; moves histogram UI; 10 isles | yes | after 1 + 2 merge |
| **4 · Danger + daily** | cozy hazards (K5) + Night theme; 6 isles; **Daily isle agent (K10)** | yes | after 3 |
| backlog | Drift | yes | — |

Each phase ends with a check against real players: clear rate per tier, restarts, hint use.

## 7. Decisions

Settled 2026-10-19 — see [§0](#0-decisions-2026-10-19).

---

## Sources

- Difficulty data: `node tools/difficulty.mjs` (this repo).
- Baba Is You achievement rates: [Steam global stats](https://steamcommunity.com/stats/736260/achievements); [completionist.me](https://completionist.me/steam/app/736260).
- Celeste optional difficulty: [Vice on Assist Mode and B-sides](https://www.vice.com/en/article/d3w887/celeste-difficulty-assist-mode); [Gameluster review](https://gameluster.com/celeste-magically-grueling-rollercoaster-emotion-fun/).
- Snakebird Primer: [TouchArcade](https://toucharcade.com/2019/02/25/snakebird-primer-now-available-on-ios); [developer on Steam](https://steamcommunity.com/app/1014140/discussions/0/1778262124941322708/).
- A Monster's Expedition: [Game Developer interview with Alan Hazelden](https://www.gamedeveloper.com/game-platforms/the-relaxing-open-world-puzzle-design-of-i-a-monster-s-expedition-i-); [PocketGamer review](https://www.pocketgamer.com/a-monsters-expedition/a-monsters-expedition-review-a-new-type-of-museum-exploration/).
- The "catch": [Kotaku on GMTK's puzzle design video](https://www.kotaku.com.au/?p=863140); [GMTK: How Jonathan Blow Designs a Puzzle](https://amara.org/subtitles/LaGKzzSXnuQl/en-gb/1/download/How%20Jonathan%20Blow%20Designs%20a%20Puzzle%20%20Game%20Makers%20Toolkit.en-gb.srt).
- Zachtronics histograms: [Steam discussion](https://steamcommunity.com/app/558990/discussions/0/1742229167201633990); [player account](https://greaterwrong.com/posts/DHaDXktvYAgWeoHwD/video-games-greater-than-iq-tests/comment/uHSEvvnSzz4m7Cfbq).
- Wordle growth: [UNLV](https://www.unlv.edu/news/article/word-wordle); [Kuwait Times / AFP](https://kuwaittimes.com/whats-in-wordle-five-letter-puzzle-craze-goes-global/).
- Super Mario Maker: [GameSpot](https://www.gamespot.com/articles/super-mario-maker-reaches-new-milestone/1100-6439914/); [Pure Nintendo](https://purenintendo.com/pr-super-mario-maker-has-sold-1-million-units-around-the-world/).
- Precedent checks: [Sokobloom](https://noodle-storm.itch.io/sokobloom), [Wondervine](https://powerdive.itch.io/wondervine), [Ahoist Cratey via Thinky Games](https://thinkygames.com/lists/best-sokoban-games/?page=4), [Crumble Tumble](https://crazypo.itch.io/crumbletumble), [Too Many Penguins](https://andaroo.itch.io/too-many-penguins), [Space Revolver](https://www.jestr.gg/games/space-revolver), [Flip My World](https://zwieb4ck.itch.io/flipmyworld), [balloon jam game](https://lightpotato.itch.io/balloongame).
