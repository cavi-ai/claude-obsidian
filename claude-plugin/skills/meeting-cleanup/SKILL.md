---
name: meeting-cleanup
description: Use when turning raw meeting notes, voice memos, or messy capture into a structured note with decisions, action items, and attendees.
---

# Meeting cleanup

Turn raw capture into a structured, skimmable note — without adding anything that
wasn't said.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Process

1. **Read the raw note** (`note_read`).
2. **Extract, don't embellish.** Pull out: **Attendees**, **Decisions**,
   **Action items** (as `- [ ]` checkboxes, with owner if stated), and **Notes /
   discussion**. Capture only what the raw text supports; mark unclear items
   `[?]` rather than guessing.
3. **Structure it** under those headings, leading with decisions and actions
   (the parts people return for).
4. **Tag** via claude-obsidian:consistent-tagging (include `meeting`) and
   **link** people/projects/topics via claude-obsidian:wikilink-weaver.
5. **Write it.** `note_update` the note in place (show the change first) or
   `note_create` a clean version linked to the raw note.

## Common mistakes

- Dropping action items, or losing who owns them.
- Inventing decisions/outcomes the raw notes don't support.
- Overwriting the raw capture without showing the change.
