---
description: Turn an Obsidian note (or a topic) into a single beautiful, self-contained HTML artifact saved back to the vault.
argument-hint: "<note path or topic>"
---

Create one beautiful, information-dense, fully self-contained HTML artifact from
the source below, then save it back into the Obsidian vault.

Source: `$1`

Steps:

1. If `$1` looks like a vault path, read it with the `note_read` MCP tool. If it
   is a topic or is ambiguous, use `vault_search` to gather the relevant notes.
2. Produce the artifact following the **claude-obsidian:note-to-artifact** skill
   (palette, typography, layout, inline-SVG charts, single self-contained
   document — no external resources).
3. Save it with `note_create`: a Markdown note whose body wraps the HTML in a
   ```` ```claude-html ```` fenced block so the Obsidian plugin renders it
   inline. Give it a clear title and relevant tags.
4. Tell the user the path of the note you created.
