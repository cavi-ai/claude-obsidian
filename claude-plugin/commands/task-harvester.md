---
description: Collect all open tasks scattered across the vault into one consolidated, source-linked, prioritized action list.
argument-hint: "[optional folder/tag/topic focus]"
---

Harvest open tasks across the vault into one action list, following the
**claude-obsidian:task-harvester** skill.

Optional focus: `$1`

Steps:

1. Find task-bearing notes via `vault_search` (`- [ ]`, `#task`/`#todo`) and
   `frontmatter_query`, scoped by `$1` if given.
2. `note_read` and extract each open `- [ ]` item with its source note.
3. Consolidate into one list, each item linked to its `[[source]]`, grouped and
   prioritized (overdue/urgent first).
4. Save with `note_create` (or a `claude-html` kanban artifact), tagged via
   claude-obsidian:consistent-tagging; offer a recurring pull
   (claude-obsidian:vault-routines).
