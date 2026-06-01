---
name: summarize-and-link
description: Use when adding a TL;DR or summary to a long note, condensing a note, or surfacing and linking the key concepts inside a note.
---

# Summarize and link

Give a long note a useful entry point: a tight summary up top and links to the
key concepts it touches.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Process

1. **Read the whole note** (`note_read`) — summarize the actual content, never
   the title alone.
2. **Write a TL;DR**: 2–4 sentences leading with the note's single most important
   point, optionally followed by a few key bullets.
3. **Surface key concepts.** Identify the core concepts; for those that are (or
   should be) their own notes, link them via claude-obsidian:wikilink-weaver
   (which verifies targets exist) — don't fabricate links.
4. **Place the summary** at the top under a `## Summary` heading. `note_update`
   replaces the full body, so prepend the summary to the content you read in
   step 1 and write the combined body (section mode won't *create* a new
   `## Summary` — it only replaces an existing one). Show the change first.

## Common mistakes

- Summarizing from the title/memory rather than the content.
- Linking concepts to notes that don't exist.
- Rewriting the whole note instead of prepending a summary.
