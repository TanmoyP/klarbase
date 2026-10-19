# Klarbase — Growth Plan

> The strategy the growth agents work from. Owner: the maker (TanmoyP). Agents read this
> every run and **propose** changes to it; the maker merges them. Live state (queue,
> feedback, reports, metrics) is in `marketing/state/` (local, git-ignored, see
> [README.md](README.md)).
>
> **Written:** 2026-10-19 · **Review cadence:** weekly (Monday) · **Budget:** €10/week paid

---

## 0. The deal (read before anything else)

1. **Nothing goes out without the maker's approval.** Agents research, draft and queue.
   The maker approves in one click each morning. Only then is anything posted, either by
   the maker or by an API the maker has connected and named in `state/channels.md`.
2. **One voice: the real maker, openly.** Every post is "I made this", in the first person,
   from the maker's own account. No personas, no second accounts, no "a friend showed me",
   no asking for upvotes, no fake reviews or testimonials, no vote rings.
3. **Fully unattended posting is off the table.** It breaks the rules of Reddit
   (self-promotion and bot rules), Hacker News (no voting rings, no promotion-only use),
   lobste.rs (self-promo must stay under ¼ of activity), and most Discords. It also costs the
   one thing a dev-facing open-source project can't buy back: credibility. Some channels
   (Bluesky, Mastodon, dev.to, GitHub) allow API posting of your own approved content. Those
   can be wired up later. Reddit, HN, lobste.rs and Discords are always posted by hand.
4. **Show, don't claim.** Every post carries something real: an isle code, a GIF/screenshot,
   a number from the solver, a contributor's name (with their consent), a commit.

## 1. Positioning

**Klarbase is a base for making puzzles.** People come for the cozy game and stay because
the format is open:

> *Tiny floating isles, clever little paths. An open, solver-verified puzzle format you can
> play, build and ship to the game by pull request. Every isle is plain text, every isle is
> proven solvable, and every maker is credited.*

The three doors, one product:

| Door | Promise | Proof we already have |
|---|---|---|
| **Play** | A cozy puzzle you can start in one click. No account, no install. | 24 hand-made isles, procedural art, synth audio |
| **Build** | Paint an isle and the solver tells you live if it works, plus its exact par. | builder, live verdict, share online |
| **Develop** | Isles are ~5 lines of text with one open spec, a pure zero-dep engine and a CI gate. Your PR is your publish button. | `isles/README.md`, `@klar/core`, `tools/check-isles.mjs`, MIT |

**Why "base for development" is credible:** most puzzle games are closed. Most level
editors don't prove solvability. Most open-source games make contributors read the engine.
Klarbase's contribution is a JSON file that a solver judges in CI with no human review. That's
rare, and the nerdy audience will get it.

**What we never say:** "the best puzzle game", "revolutionary", "AI-powered" (the builder
bot isn't shipped), user counts we don't have, or anything about other games' quality.

## 2. Who we're for (ICP)

| # | Segment | What they want | Where they are | Hook |
|---|---|---|---|---|
| **A** | **Thinky-puzzle players** (Sokoban, Baba Is You, Stephen's Sausage Roll, A Monster's Expedition fans) | Fair, readable puzzles with an "aha" | r/puzzlegames, r/sokoban, Thinky Games Discord, thinkygames.com, PuzzleScript community | "Every isle is solver-verified with an exact par" |
| **B** | **Level-maker / modder types** (Mario Maker, PuzzleScript, Bitsy authors) | A low-friction editor and an audience for their levels | PuzzleScript Discord & gallery, itch.io jams, r/leveldesign | "Paint it, the solver checks it, it ships with your name on it" |
| **C** | **Devs looking for a first/friendly OSS contribution** | A small, safe PR that gets merged and is visible | GitHub topics, good-first-issue sites, Hacktoberfest, dev.to | "Your first PR can be a puzzle: a JSON file that CI judges" |
| **D** | **Web/three.js & proc-gen nerds** | Interesting technical writeups | HN, lobste.rs, r/threejs, r/proceduralgeneration, dev.to, Mastodon (#gamedev, #threejs) | "No textures, no models, no audio files. All procedural, under 170 KB gzip" |
| **E** | **Cozy-game casuals** | A calm 5-minute break | r/WebGames, r/CozyGamers, Bluesky | "Push a crate into the spring, step through an arch" |

**Priority:** A and C first (they turn into isle authors, our North Star), then D (reach
and stars), then B (deep makers), with E as a by-product. Paid spend targets A and E, where
self-serve ads exist.

## 3. Channels

Ranked by fit. **Cadence limits are hard rules** the scheduler enforces (see
`state/channels.md` for the live ledger: last post, next allowed date, rule notes).
The community scout re-checks each channel's rules before the first post and every 30 days.

### Tier 1: owned and open (the base)
| Channel | Why | Cadence | Posting |
|---|---|---|---|
| **GitHub repo** (topics, README, Discussions, Releases, issues) | It's where segment C lands and where "develop" happens | topics + `good first issue` once; release notes per deploy; 1 "isle request" issue/week | API via `gh` (connected) |
| **Devlog** (dev.to + itch.io devlog, cross-posted) | A real maker voice and a long-tail SEO archive | 1 post / 2 weeks | dev.to API (if connected); itch by hand |
| **Bluesky** (#gamedev #indiedev #screenshotsaturday #puzzlegame) | Indie gamedev moved here; small creators can reach people | 3/week max, 1 Screenshot Saturday | API (app password) if connected |
| **Mastodon** (mastodon.gamedev.place) | The most nerdy, OSS-friendly crowd; hashtags work | 2/week max | API if connected |
| **itch.io page** (HTML5 embed or link-out, tag `puzzle` `sokoban` `cozy` `level-editor` `open-source`) | Itch is where thinky and jam people browse. Free listing | 1 page; devlog mirrors | by hand (once), devlog by hand |

### Tier 2: launch moments (one shot each, so spend them well)
| Channel | Rule (checked 2026-10-19) | Plan |
|---|---|---|
| **Show HN** | Must be something people can try now, no signups (✓ no account needed). Personal work, discuss it in the thread. No asking friends to upvote. | One post, title like "Show HN: Klarbase – cozy puzzle isles you can contribute by PR, verified by a BFS solver". Weekday ~14:00 UTC. Maker answers comments for 3 h. |
| **lobste.rs** | Invite-only. New users (first 70 days) **can't** use the `show` tag or submit new domains. Self-promo must stay **< ¼** of stories+comments. | Only if the maker already has (or earns) an account and real participation. Post the technical writeup, not the game. |
| **r/WebGames** | Typically allows devs posting their own browser games. Scout verifies the sidebar before posting. | One post with GIF, "I made this" in the title |
| **r/puzzlegames, r/sokoban** | Self-promo rules vary; Reddit's guideline is ~10% self-promo. Scout verifies. | One post each, spaced ≥ 2 weeks, different angle per sub |
| **r/proceduralgeneration, r/threejs** | Showcase-friendly. Scout verifies flair rules. | Technical GIF post: "every tree, cliff and waterfall is generated" |
| **Product Hunt** | Launch-day effort. Only after OG cards + daily isle exist. | Week 6+ |

### Tier 3: nerdy long-tail (slow, compounding, mostly one-time)
- **GitHub awesome-lists:** `leereilly/games` (~23k★, any open-source game), `proyecto26/awesome-jsgames`, awesome-threejs lists, awesome-puzzle lists. One honest PR each, following each list's CONTRIBUTING.
- **GitHub topics** on the repo: `puzzle-game`, `sokoban`, `threejs`, `browser-game`, `level-editor`, `procedural-generation`, `good-first-issue`, `hacktoberfest` (Oct only), `open-source-game`.
- **Hacktoberfest** (runs Oct 1–31; **12 days left**): add the `hacktoberfest` topic now. Isle PRs count. CI already rejects low-effort isles (≥ 6 moves, ≥ 1 mechanic, unique).
- **good-first-issue aggregators** (goodfirstissue.dev, up-for-grabs.net, firsttimersonly): label 3–5 real issues `good first issue` (an isle per theme, accessibility tasks).
- **Thinky Games** (thinkygames.com database + Discord): ask about database inclusion. Thinky Direct (late May) is a target for 2027.
- **PuzzleScript community** (Discord, puzzlescript.net gallery): share the format and the Sokoban bridge (roadmap R7).
- **Game jams** (itch.io): run a tiny "Isle Jam" when there are ≥ 10 external authors; until then, enter themed jams with an isle pack.
- **Lemmy** (lemmy.world /c/indiegaming, /c/webdev), **Tildes** ~games (only with genuine participation), **Newgrounds** (HTML5 portal, by hand).
- **Discords** (Thinky Games, PuzzleScript, three.js, gamedev.place): **participate first.** Share only in the designated #showcase / #self-promo channels.

### Not now (and why)
- **X/Twitter ads**: poor fit for cozy and OSS, expensive, bad brand context.
- **EthicalAds**: perfect audience, but a **$1,000 minimum buy** (checked 2026-10-19). Revisit if budget grows.
- **Carbon Ads**: pricing is sales-only, $5k/month minimum on some formats.
- **TikTok Ads**: $20/day ad-group minimum, way over budget.
- **itch.io sponsorship**: real, but unpriced (email-a-budget). Ask once at month 3 if itch drives traffic.

## 4. Paid: €10/week

Minimums (checked 2026-10-19 from third-party guides citing the platforms; **confirm in
the Ads Manager UI before the first spend**):

| Platform | Floor | Fit | Verdict |
|---|---|---|---|
| **Reddit Ads** (self-serve) | ~$5/day per ad group (most sources). Some report a $20/day minimum for "Max" auto campaigns | Subreddit targeting = segments A and E exactly | **Primary.** Pulse 2 days/week at $5 (~€8.60) |
| **Google Ads (Search)** | No published Search minimum (Demand Gen has $5/day since 2026-04) | Long-tail intent: "sokoban online", "puzzlescript games", "cozy puzzle browser game" | **Secondary test.** €1.40/day exact-match, alternating weeks |
| **Meta** | ~$1/day floor, varies by account | Weak for B/C/D, OK for E | Not now |

**How the €10 is used:**
- **Weeks 1–2: €0.** Fix the funnel first: OG tags (done), Cloudflare Web Analytics on,
  landing paths per channel. Ads into an unmeasured funnel are wasted money. Unspent budget
  rolls over (see the ledger).
- **Weeks 3–6: Reddit pulse.** One campaign, one ad group (community targeting:
  r/puzzlegames, r/WebGames, r/CozyGamers, r/sokoban), $5/day, **Sat–Sun only** (about
  €8.60/week). 2 creative variants per week, drafted by the ads agent from real gameplay.
  The landing path differs per variant (`klarbase.dev/go/rd-a`, `/go/rd-b`).
- **Weeks 7+: keep what works.** Kill a variant at CPC > €0.60 or < 5% clear-through,
  and A/B Google Search against Reddit on alternating weeks.
- **Hard cap: €10/week, €43/month.** The ads agent keeps `state/ads-ledger.md`. The maker
  sets the platform's own budget cap (a lifetime budget or a payment-method limit) so a
  mistake can't overspend.

Ad copy follows section 0: the maker's voice, a real isle, no fake urgency, no "players
love it", no fake social proof. Example angle: *"I built a cozy puzzle game where every
level is 5 lines of text and a solver proves it's solvable. Free, in your browser."*

## 5. North Star & goals

**North Star: Weekly Isle Makers (WIM).** The number of distinct people, not counting the
maker, who **published an isle that week**: a new online share (`Puzzle` rows) plus authors
of merged community-isle PRs. It's the "base for development" metric: someone played, then
built, then shipped. It's measurable today without new tracking.

**Input metrics** (weekly, `state/metrics.csv`):

| Metric | Source | Why |
|---|---|---|
| Visitors (unique) + top referrers + `/go/*` paths | Cloudflare Web Analytics (cookieless) | top of funnel, channel attribution |
| Sign-ups (new users) | `GET /api/stats` | intent to share |
| Online isles shared · distinct sharers | `GET /api/stats` | WIM part 1 |
| Community isle PRs opened / merged · distinct authors | GitHub API | WIM part 2, segment C |
| Stars, forks, watchers | GitHub API | dev reach |
| Repo views & clones, top referrers (14-day window) | GitHub traffic API | dev reach |
| Plays / clears per isle | **not measured yet**, see roadmap R1 | activation |
| € spent, clicks, CPC | ads ledger (maker pastes from Ads Manager) | paid efficiency |

**Targets** (week 1 = 2026-10-19; baseline taken on the first metrics run):

| Week | WIM | Visitors/wk | New stars/wk | Community PRs merged (cum.) |
|---|---|---|---|---|
| 1 | baseline | baseline | baseline | baseline |
| 2 | 1 | 150 | 5 | 1 |
| 4 | 3 | 400 | 15 | 4 |
| 8 | 8 | 1,000 | 25 | 12 |
| 12 | 15 | 2,000 | 40 | 25 |

**Thresholds** (applied by the weekly review):
- 🟢 **on track**: ≥ 100% of target → keep course, double down on the best channel.
- 🟡 **at risk**: 60–99% → one adjustment (swap a channel, new angle) and tell the maker why.
- 🔴 **missed**: < 60%, or WIM below target **two weeks running** → **rethink**: the
  strategist runs a research pass (what did similar OSS games and thinky launches do?),
  writes 2–3 alternative courses with reasoning, and the maker picks one.

**Vision (12 months):** Klarbase is the place people go to make and share small, proven
puzzles. 1,000 community isles, 100 isle authors, and other projects building on `@klar/core`.

## 6. Growth-driven engineering roadmap

Ranked by growth impact ÷ effort. **Every item has been run through the CLAUDE.md
constitution.** None adds a tile type or a rule (rule 4), and all logic goes through `@klar/core`
(rule 5). Rows with user data note cascade + §8 needs.

| # | Proposal | Growth lever | Constitution check | Size |
|---|---|---|---|---|
| **R0** | ✅ **OG / meta tags** in `client/index.html` (title, description, image = repo screenshot) | every shared link gets a card | client-only, no new art files | done |
| **R0b** | ✅ **`GET /api/stats`** (token-gated aggregates) + `tools/growth-metrics.mjs` | WIM measurable | counts only, no new table, no user data out | done |
| **R1** | **Anonymous play/clear counters**: `IsleDayCount{day, isle, event, n}` incremented by `POST /api/stats/event` (`play`/`clear`, allow-listed isle refs, rate-limited) | activation funnel per isle; "most played isles" for content | no user id or IP is stored, so no user data and no cascade. **Needs a Prisma migration**, which the Dockerfile runs on boot (`prisma migrate deploy`), so merging = prod migration. Maker's call. §8 updated when built | S |
| **R2** | **Share-a-result card**: after a clear, copy "Klarbase · Root Bridge · ⭐⭐⭐ 12 moves (par 12) · klarbase.dev/#/isle/root-bridge" | Wordle-style organic loop | **must not include the route.** Solutions are earned, so the card shows moves and stars, never keys | XS |
| **R3** | **Per-isle link previews**: `/i/<hash>` and `/c/<author>/<id>` path routes that serve `index.html` with that isle's title/author in OG tags and an `og:image` rendered from the isle grid (top-down minimap PNG, zero-dep encoder) | shared isles unfurl beautifully on Discord/Bluesky/Reddit | procedural image from core `parseIsle`, no stored art files; uses the same parser as everything else | M |
| **R4** | **Daily Isle** (already on the roadmap): `dailyIsle(date, pool)` in `@klar/core` so client and server agree; no leaderboard in v1 | daily habit, shareable streak | pure function in core; v2 leaderboard stores user ids, so it needs a cascade + §8 entry | S (v1) |
| **R5** | **Makers page** `#/makers`: every community author, their isles, first-merge date; README "Isle makers" section generated by `tools/author.mjs` | credit is the reward, and it pulls segment C | data comes from bundled `isles/community/`; no server | S |
| **R6** | **Isle of the Week**: maintainers set `isles/featured.json` (validated in CI like any isle file); a badge in the Community tab; the content agent writes the spotlight | content engine + author recognition | data-only file, checked by `check-isles.mjs`; never runs contributor code (rule 6) | S |
| **R7** | **Sokoban bridge**: `tools/import-xsb.mjs` turns classic Sokoban levels into isles (targets → plates, a gate before a goal; "all plates pressed" = solved) and then `parseIsle` + `solveIsle` keep only what verifies | a real reason to talk to Sokoban and PuzzleScript communities | **no new tile or rule.** It maps onto existing plates/gates. Imports must respect the 200k budget and original level licences | M |
| **R8** | **Embeddable isle** `klarbase.dev/embed#/i/<hash>`: game-only view + "made with Klarbase" link | devlogs and blogs embed real puzzles | same client, same core; no route printed for anonymous players | M |
| **R9** | **`@klar/core` on npm** + a "write your own solver/generator" guide | "base for development" made real: other people build on the format | publishing existing pure code; one source of truth stays in-repo | S |
| **R10** | **Builder bot** (already on the roadmap): "describe an isle" → verified draft | a demo-able hook for HN/dev.to | must go through `checkCommunityIsle`; never ships unverified output | L |
| **R11** | **Remix lineage**: shared isles remember `remixOf: <hash>`; the page shows "remixed from X by Y" | referral loop between makers | a format *field*, not a tile: still a schema decision (canonicalIsle must keep it; `isleHash` excludes it) | S |
| **R12** | **Accessibility pass** (already on the roadmap) | thinky audiences are vocal about this; good-first-issue material | client-only | S each |

**Recommended order:** R1 → R2 → R5 → R6 → R4 → R3 → R7 → R9 → R8 → R11 → R10.
R1 comes first because every later decision needs activation data. R2/R5/R6 are tiny and turn
every new isle into content.

## 7. The operating loop

```
 Mon ──► weekly review (metrics vs §5 targets → 🟢/🟡/🔴 → course for the week)
  │
  ▼ every weekday 07:00 (scheduled) or /growth-morning
 1. strategist  reads feedback.md + course.md, applies yesterday's decisions
 2. metrics     snapshot → metrics.csv (daily light, Monday full)
 3. scouts      trend-scout + community-scout (in parallel) → research notes, channel ledger
 4. strategist  picks today's 1–3 moves within cadence limits
 5. drafters    content-drafter + ads-drafter → queue.md (status: pending)
 6. report      state/daily/<date>.md, shown in chat → ONE question: "Approve all?"
  │
  ▼ the maker clicks
 7. "Approve all" / "Approve 1,3 · edit 2: … · drop 4" → feedback.md (verbatim)
 8. publisher   posts approved items through connected APIs only; everything else
                becomes a copy-paste "post kit" for the maker → published.md
```

**The maker's time:** ~2 min/day to approve. ~5 min on the 2–3 days a week that have a
hand-posted item. A Show HN or a Reddit launch also means ~1 h of replying in the comments.
The comments have to be the maker in person, and that's the most valuable hour in the plan.

## 8. Voice guide (for every draft)

- First person, the maker, plain words. Short sentences. One idea per post.
- Lead with the isle, not the product: a GIF, the 5-line isle code, "par 12".
- Say what's honest and specific: "I'm a solo dev", "the solver checks 200,000 states",
  "this isle came from @someone's PR" (with their OK).
- Invite making, not just playing: "make one and send a PR, and CI will tell you if it's fair."
- No hype words, no emojis in titles, no hashtags beyond the channel's convention, no
  "check out my", no "please upvote", no engagement bait.
- Every outbound link uses the channel's landing path (`klarbase.dev/go/<channel>`), so
  attribution needs no cookies.

## 9. Sources (checked 2026-10-19)

- Show HN rules: https://news.ycombinator.com/showhn.html
- lobste.rs rules (self-promo < ¼, new users can't use `show`): https://lobste.rs/about
- Reddit Ads minimums (third-party, $5/day per ad group): https://getclientradar.com/blog/reddit-ads-budget-2026/ · https://feedheat.com/reddit-ads/cost · https://stackmatix.com/blog/reddit-ads-cost-guide-2026
- Google Demand Gen $5/day floor: https://ads-developers.googleblog.com/2026/02/minimum-budget-requirement-for-demand.html
- Meta minimums vary by account: https://www.tryvizup.com/blog/meta-ads-minimum-budget-requirements-2026
- EthicalAds $1,000 minimum: https://www.ethicalads.io/advertisers/pricing/
- Carbon Ads: https://carbonads.net/more-info
- TikTok $20/day ad group: https://ads.tiktok.com/help/article/about-daily-budgets
- itch.io sponsorship: https://itch.io/docs/general/sponsors
- Bluesky has no ads product: https://wholewhale.com/resources/how-to-advertise-on-bluesky-creative-strategies-when-theres-no-pay-to-play-option/
- Thinky Games / Thinky Direct: https://thinkygames.com/direct/
- Awesome lists: https://github.com/leereilly/games · https://github.com/proyecto26/awesome-jsgames
