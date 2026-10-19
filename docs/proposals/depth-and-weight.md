# Proposal — Depth, difficulty and one new physics: **Weight**

> Status: **proposal, not built.** Every new tile here is a schema decision (CLAUDE.md rule 4).
> Written 2026-10-19 after the first real-player feedback: *"not challenging enough, no new or
> novel mechanic."* Data from `node tools/difficulty.mjs`; research sources at the end.

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
| The "catch" is an apparent contradiction | GMTK: you need to stand on the button **and** be at the door | design each isle around one catch, written down before building |
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

### 3.4 Not now: Drift (the big swing)

Whole isles that sail one cell when Pip raises a sail, docking with others — you rearrange the
archipelago while standing on it. No game found doing this, and it would be striking, but it
changes the core data model (cells stop being static). **Research spike only after Weight ships.**

### Why weight, and not plants or gravity

Researched and rejected as not new: plants that grow and push (Sokoseed, Sokobloom, Wondervine),
rotating the view to change gravity (Space Revolver, Flip My World). Weight fits the setting
(floating isles hang on vines and balloons), reuses our rules, and stays readable at a glance.

## 4. Difficulty: from super easy to "impossible" (always solvable)

Rate every isle by the audit, not by gut feel. Proposed tiers, calibrated later with real data:

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

| phase | what | new rules? | size |
|---|---|---|---|
| **1 · Depth with what we have** | tier badges from the audit; 5 **Twist** isles (one per chapter, Hard–Fiendish); Daily Isle + share card | no | S–M |
| **2 · Weight I: Sky Scales** | rule + solver + tests + art (vine, pans) + builder tool + 8 isles, Tricky → Mythic | yes | M |
| **3 · Weight II** | Balloon & glide, Buoy, seeds; 10 isles; histogram | yes | M–L |
| **4 · Drift spike** | prototype only; decide from playtests | yes | L |

Each phase ends with a check against real players: clear rate per tier, restarts, hint use.

## 7. Decisions needed from you

1. **Weight as the next physics** — Sky Scales first? (the rule-4 schema decision)
2. **Phase 1 now** — Twist isles + tiers + Daily Isle, before any new rule?
3. **Anonymous per-isle stats** (started / cleared / moves / hints, no user IDs) — for tiers and the
   histogram. Needs a line in the privacy note.
4. Balloon, Buoy and seeds in Phase 3, or cut?

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
