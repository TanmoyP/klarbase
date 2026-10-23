# Daily Isles

Hand-made isles for the **Daily Isle** (`/daily`), one file per UTC date:

```
isles/daily/2026-10-20.json
```

On a date that has a file, everyone plays that isle. On a date without one, the game picks
from a pool (Twist isles, Tricky-or-harder official isles, community isles) — the same pick
for everyone. Dailies are numbered from 2026-10-19 (`Klarbase Daily #1`); adding a file never renumbers them.

After its day, a hand-made daily moves to **Past Daily Isles** on the Community tab
(`/daily/<date>`), credited to its `author`, with the same stats and the same Daily number.
A future date is never playable on the live site.

## The file

Same format as a community isle ([`../README.md`](../README.md)), with these differences:

| field | rule |
|---|---|
| `id` | must be `daily-<date>`, matching the file name — e.g. `daily-2026-10-20` |
| `tier` | **required** — the designer's gut call: `breeze` `easy` `tricky` `hard` `fiendish` `mythic` |
| `author` | optional (GitHub username); there is no author folder. Credited on the card once the day has passed |
| `catch` | optional, plain text ≤ 200 chars — the designer's note on the trick. Never shown to a player before they clear the isle |
| `name`, `theme`, `rows`, `par`, `solution`, `hint`, `description`, `credit` | as for community isles |

```json
{
  "schemaVersion": 5,
  "id": "daily-2026-10-20",
  "name": "Sundial Steps",
  "theme": "oasis",
  "tier": "hard",
  "hint": "The arch drops you on the wrong side of the spring.",
  "catch": "The only crate that fills the spring is the one blocking the arch.",
  "rows": ["...", "..."],
  "par": 9,
  "solution": "RRUULLLUU"
}
```

## Checks

`node tools/check-isles.mjs` (and CI) judges every file here with the same engine as community
isles (`checkDailyIsle` in `core/src/isle/contrib.js`): valid format, solvable within 200k
states, `par` exact, `solution` a shortest winning route, at least 6 moves and one real mechanic,
unique against official, community and other daily isles, file name = a real date = the `id`
suffix, a valid `tier`, plain-text fields with no links, at most 8 KB. Nothing in a file is
ever executed.
