---
name: task-harvester
description: Use when collecting open tasks or todos scattered across notes, building a consolidated action list, or surfacing all unchecked checkbox or task-tagged items in an Obsidian vault.
---

# Task harvester

Pull every open task in the vault into one consolidated, sourced action list.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Process

1. **Find task-bearing notes.** `vault_search` for `- [ ]` and `#task`/`#todo`;
   use `frontmatter_query` for the vault's task-related type/tag if it has one.
2. **Read and extract.** `note_read` the candidates; collect each open task
   verbatim — both `- [ ]` checkboxes and `#task`/`#todo`-tagged lines — with the
   note it came from. Don't drop a marker type you found in step 1.
3. **Consolidate, don't lose.** One list, each item linked to its
   `[[source note]]`. Group by source or by theme; flag items with due dates or
   owners if present.
4. **Order by priority** where the notes give signal (due dates, explicit
   priority); otherwise group sensibly. Lead with anything overdue/urgent.
5. **Save** with `note_create` (or render a `claude-html` kanban-style artifact),
   tagged via claude-obsidian:consistent-tagging. Offer a recurring pull via
   claude-obsidian:vault-routines.

## Hard requirements

- Search BOTH markers (`- [ ]` checkboxes and `#task`/`#todo`), and extract both
  — never drop a marker type you found while searching.
- Every harvested item links back to its `[[source note]]`.
- Output is prioritized/grouped, not an unordered blob.

## Common mistakes

- Missing tasks by searching only one marker (`- [ ]` vs `#task`).
- Items with no link back to their source note.
- An unordered blob instead of a prioritized, grouped list.
