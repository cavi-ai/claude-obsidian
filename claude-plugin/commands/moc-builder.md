---
description: Build or refresh a Map of Content (MOC) hub note that groups and annotates the notes on a topic or folder.
argument-hint: "<topic or folder>"
---

Build a Map of Content for the topic/folder below, following the
**claude-obsidian:moc-builder** skill.

Topic / folder: `$1`

Steps:

1. Enumerate members with `vault_search` + `list_titles`; `note_read` to confirm
   relevance.
2. Group them into a few meaningful sections; annotate each entry as
   `[[Note]] — one-liner`; verify every link target exists.
3. Save as `<Topic> MOC` with `note_create` (or `note_update` to refresh an
   existing MOC), tagged via claude-obsidian:consistent-tagging (include `moc`).
4. Tell the user the path of the MOC note.
