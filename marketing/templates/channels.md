# Channel ledger

> Kept by `growth-community-scout`. **The scheduler reads this before queueing anything.**
> A channel with `rules checked` older than 30 days, or `account` = `?`, gets nothing
> queued until the scout refreshes it.
> Mode: `api` = posted by `growth-publisher` through a connection the maker set up and
> named here; `manual` = the maker posts by hand. Reddit, HN, lobste.rs, Discords are
> **always manual**.

| Channel | Account | Mode | Cadence limit | Last post | Next allowed | Rules checked | Rule notes |
|---|---|---|---|---|---|---|---|
| GitHub (TanmoyP/klarbase) | TanmoyP | api (`gh`) | release notes per deploy; ≤ 1 new issue/day | — | now | 2026-10-19 | own repo |
| Bluesky | yes (handle → BSKY_HANDLE) | api (`tools/growth-post.mjs`, needs BSKY_APP_PASSWORD) | ≤ 3/week | — | — | — | no ads product; community dislikes hard promo |
| Mastodon | yes (instance → MASTODON_INSTANCE) | api (`tools/growth-post.mjs`, needs MASTODON_TOKEN) | ≤ 2/week | — | — | — | check instance rules on self-promo + bots |
| dev.to | yes (handle tbd) | manual | ≤ 1 / 2 weeks | — | — | — | tag `#gamedev #opensource #javascript #showdev` |
| itch.io (page + devlog) | yes (page tbd) | manual | devlog ≤ 1 / 2 weeks | — | — | — | browser games allowed; tag thoughtfully |
| Hacker News (Show HN) | none yet (maker creates; setup task) | manual | **once** (+ major overhauls) | — | after W44 | 2026-10-19 | try-now, no signup, no vote asks; maker answers comments |
| lobste.rs | none yet (maker creates; setup task) | manual | self-promo < ¼ of activity | — | — | 2026-10-19 | invite-only; new users (70 d) can't use `show` or new domains |
| r/WebGames | none yet (maker creates; setup task) | manual | 1 / month | — | — | — | verify sidebar; Reddit ~10% self-promo guideline |
| r/puzzlegames | none yet (maker creates; setup task) | manual | 1 / month | — | — | — | verify sidebar |
| r/sokoban | none yet (maker creates; setup task) | manual | 1 / quarter | — | — | — | verify; best with R7 (Sokoban bridge) |
| r/proceduralgeneration | none yet (maker creates; setup task) | manual | 1 / quarter | — | — | — | technical showcase |
| r/threejs | none yet (maker creates; setup task) | manual | 1 / quarter | — | — | — | technical showcase |
| Thinky Games (site + Discord) | ? | manual | participate first | — | — | — | ask about database listing |
| PuzzleScript Discord | ? | manual | participate first | — | — | — | showcase channel only |
| leereilly/games (awesome list) | TanmoyP | manual PR | once | — | now | — | read CONTRIBUTING |
| proyecto26/awesome-jsgames | TanmoyP | manual PR | once | — | now | — | read CONTRIBUTING |
| Hacktoberfest (topic) | TanmoyP | api (`gh`) | Oct only | — | now (ends 10-31) | 2026-10-19 | repo topic `hacktoberfest` |
| goodfirstissue.dev / up-for-grabs | TanmoyP | manual PR | once | — | after issues exist | — | needs ≥ 3 labeled issues |
| Reddit Ads | none yet (maker creates; setup task) | manual (maker sets up) | €10/week cap | — | W45 | 2026-10-19 | ~$5/day per ad group (verify in UI) |
| Google Ads (Search) | ? | manual | alternating weeks | — | W49+ | 2026-10-19 | no Search minimum found |
| Product Hunt | ? | manual | once | — | W48+ | — | after share card + daily isle |
