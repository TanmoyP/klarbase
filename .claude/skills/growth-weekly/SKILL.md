---
name: growth-weekly
description: Klarbase weekly growth review — compares the week's metrics with the PLAN.md targets, applies the green/amber/red thresholds, judges what worked per channel and ad variant, and either keeps course, makes one adjustment, or runs a research-backed rethink with options for the maker to pick. Use on Mondays (runs inside /growth-morning) or when the maker asks for the weekly review.
---

# Klarbase weekly review

Repo root. Week = the ISO week that just ended. State: `marketing/state/`.

1. **Numbers.** Call `growth-metrics-analyst` (it reuses today's snapshot if present) for the
   weekly table: North Star (Weekly Isle Makers), visitors, new stars, community isle PRs,
   sign-ups, spend/clicks.
2. **Ads.** If the ledger has spend this week, call `growth-ads-drafter` for the verdicts
   only (no new drafts). Ask the maker for any spend/click numbers that are missing. Don't estimate them.
3. **Review.** Call `growth-strategist` (mode: weekly). It writes
   `marketing/state/weekly/<yyyy-Www>.md` from `marketing/templates/weekly-review.md`, applies
   the thresholds (🟢 ≥ 100% · 🟡 60–99% · 🔴 < 60% or North Star missed 2 weeks running),
   and drafts next week's course.
4. **Present** the scorecard + decision in chat, short.
   - 🟢/🟡: show the proposed course and ask one question: "Keep this course for next week?"
   - 🔴: show the 2–3 rethink options with the recommendation and ask the maker to pick
     one. **Don't change course.md until they pick.**
5. **After the answer:** quote it in `feedback.md`, write the chosen course into `course.md`
   (move the old week under History), and list any PLAN.md edits the strategist proposed as
   a diff for the maker to accept. Don't edit PLAN.md without a yes.
