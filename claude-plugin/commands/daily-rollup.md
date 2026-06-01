---
description: Summarize recent vault activity into a skimmable review note (decisions, changes, open tasks) saved to the vault.
argument-hint: "[days, default 7]"
---

Produce a periodic review of recent vault activity, following the
**claude-obsidian:daily-rollup** skill.

Window in days: `$1` (default 7)

Steps:

1. `list_recent` over the last `$1` days (default 7) and `note_read` the
   relevant notes.
2. Distill into a review that leads with the top developments, then
   **Decisions**, **Changed / shipped**, and **Open tasks** (each linked to its
   source note).
3. Tag via claude-obsidian:consistent-tagging (include `review`) and save with
   `note_create`.
4. Offer to schedule it as a recurring routine (claude-obsidian:vault-routines).
5. Tell the user the path of the note you created.
