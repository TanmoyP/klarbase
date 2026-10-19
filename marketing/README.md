# marketing/ — the growth loop

Strategy: **[PLAN.md](PLAN.md)**. This file is the operating manual.

## The loop

| When | What | Command |
|---|---|---|
| Every weekday, 07:00 (scheduled) | metrics snapshot → scouting → today's course → drafts → **daily report + approval question** | `/growth-morning` |
| You, ~2 min | approve / edit / drop in one reply ("approve all", or "approve 1,3 · edit 2: … · drop 4") | reply in the same session |
| Right after | approved items go out through **connected** channels; everything else becomes a copy-paste post kit | (same run) |
| Monday | metrics vs targets → 🟢/🟡/🔴 → keep, adjust or rethink | `/growth-weekly` (also runs inside Monday's morning) |

Nothing is published, posted, sent or spent without your approval in that reply. See PLAN.md §0.

## Files

```
marketing/
├── PLAN.md               strategy (tracked) — agents propose edits, you merge them
├── README.md             this file
├── templates/            seeds for every state file (tracked)
└── state/                LIVE, git-ignored — stays on this machine
    ├── course.md         this week's course: goals, channel moves, what the strategist changed and why
    ├── feedback.md       your decisions, verbatim, newest first — the agents' memory of you
    ├── queue.md          drafts awaiting approval (status: pending/approved/edited/dropped/posted)
    ├── published.md      everything that went out: where, when, link, by whom (API or you)
    ├── channels.md       channel ledger: account, mode (api/manual), rules checked, cadence, last/next post
    ├── ads-ledger.md     every euro: week, platform, variant, spend, clicks — hard cap €10/week
    ├── metrics.csv       one row per snapshot (tools/growth-metrics.mjs --append)
    ├── metrics/<date>.json  full snapshots (referrers, landing paths)
    ├── research/<date>.md   trend + community scout notes
    ├── daily/<date>.md      the morning report
    └── weekly/<yyyy-Www>.md the weekly review
```

**Why `state/` is git-ignored:** the repo is public. Unapproved drafts, your raw feedback and
early tiny numbers shouldn't sit on GitHub. If you later want to "build in public", publish
a curated monthly update instead. The weekly review can draft it.

## Agents (`.claude/agents/`)

| Agent | Job | Writes |
|---|---|---|
| `growth-strategist` | reads feedback + metrics, sets the day's/week's course, runs the weekly review and the rethink | course.md, weekly/, PLAN.md proposals |
| `growth-trend-scout` | what's happening in puzzle / thinky / OSS / gamedev land this week; events and jams | research/<date>.md |
| `growth-community-scout` | channels, listings, awesome-lists, Discords; verifies each channel's rules | channels.md, research/<date>.md |
| `growth-content-drafter` | maker-voice drafts (devlog, Bluesky, Mastodon, Reddit, Show HN, GitHub issues, isle spotlights) | queue.md |
| `growth-ads-drafter` | ad variants within €10/week, targeting, landing paths, budget check | queue.md, ads-ledger.md |
| `growth-metrics-analyst` | runs the snapshot, compares to targets, flags anomalies | metrics.csv, metrics/, daily section |
| `growth-publisher` | posts **approved** items through connected APIs only; builds post kits for the rest | published.md, queue.md status |

## Metrics setup (one-time, by you)

| Source | What you do | Unlocks |
|---|---|---|
| GitHub | nothing — `gh` is logged in | stars, PRs, community isles, repo traffic |
| Server stats | set a long random `STATS_TOKEN` in Railway variables **and** in your local environment, deploy | sign-ups, online shares, half of the North Star |
| Cloudflare Web Analytics | Cloudflare dashboard → Web Analytics → enable for klarbase.dev (cookieless); create an API token with *Account Analytics: Read*; set `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_SITE_TAG` locally | visitors, referrers, `/go/<channel>` attribution |

Run by hand any time: `node tools/growth-metrics.mjs` (add `--append` to record it).

## Posting connections (one-time, by you)

The publisher posts approved items itself only through these, from **your own accounts**:

| Channel | Set in your local environment (never in the repo or Railway) |
|---|---|
| GitHub | nothing (`gh` is logged in) |
| Bluesky | `BSKY_HANDLE`, `BSKY_APP_PASSWORD`: Settings → Privacy and security → App passwords. Not your login password |
| Mastodon | `MASTODON_INSTANCE` (e.g. `https://mastodon.gamedev.place`), `MASTODON_TOKEN`: Preferences → Development → New application, scope `write:statuses` only |

Test without posting: `node tools/growth-post.mjs bluesky --file draft.txt --dry-run`.
Revoke the app password/token any time to cut the connection.
