---
name: moc-builder
description: Use when building or refreshing a Map of Content (MOC), creating an index or hub note for a topic or folder, or organizing related notes under one navigational note.
---

# MOC builder

Build a Map of Content — a hub note that groups and annotates links to the notes
on a topic, so the user can navigate the area at a glance.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Process

1. **Scope it.** Topic or folder. `vault_search` the topic and `list_titles` to
   enumerate candidate members; `note_read` to confirm relevance.
2. **Group thematically.** Cluster the members into a few meaningful sections —
   not one flat list. Order sections by importance.
3. **Annotate.** Each entry is `[[Note]] — one-line what-it-covers`. Verify every
   `[[link]]` target exists (it came from `list_titles`).
4. **Write the MOC.** If refreshing an existing MOC, `note_read` it and
   `note_update` (show the change); otherwise `note_create` titled `<Topic> MOC`.
   Lead with a one-line purpose for the map.
5. **Tag** via claude-obsidian:consistent-tagging (include a `moc` tag).

## Common mistakes

- A flat, unannotated link dump (no grouping, no one-liners).
- Linking notes that don't exist, or missing obvious members.
- Overwriting an existing MOC without reading it first.
