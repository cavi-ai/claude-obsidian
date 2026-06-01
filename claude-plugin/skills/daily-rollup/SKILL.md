---
name: daily-rollup
description: Use when summarizing recent or daily notes, creating a weekly or periodic review, or pulling decisions and open tasks out of recent vault activity.
---

# Daily rollup

Turn recent vault activity into one review note — decisions made, what changed,
and what's still open — grounded in the notes that actually changed.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Process

1. **Find what changed.** `list_recent` for the window in question (default the
   last 7 days; ask if unclear). These are your sources — don't summarize notes
   you didn't read.
2. **Read them.** `note_read` each relevant note. Pull out: decisions, things
   completed or changed, and open tasks (`- [ ]` lines and `#task`/`#todo`).
3. **Write the review.** `note_create` a review note that leads with the 1–3
   most important developments, then sections for **Decisions**, **Changed /
   shipped**, and **Open tasks** (each task linked to its source note). Keep it
   skimmable.
4. **Tag** via claude-obsidian:consistent-tagging (include a `review` tag).
5. **Offer a routine.** A rollup is recurring by nature — offer to schedule it
   via claude-obsidian:vault-routines (e.g. every Monday 8am).

## Common mistakes

- Summarizing from titles/memory instead of reading the notes.
- Dropping open tasks — they're the most useful part of a review.
- A wall of text instead of a skimmable, prioritized review.
