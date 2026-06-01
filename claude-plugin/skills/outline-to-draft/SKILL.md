---
name: outline-to-draft
description: Use when expanding an outline or stub note into a full draft, fleshing bullet points into prose, or drafting longer-form writing grounded in vault context and the user's voice.
---

# Outline → draft

Expand an outline into a draft that reads like the user wrote it — grounded in
their vault, in their voice.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Process

1. **Read the outline** (`note_read`) and gather its context: follow
   `get_outgoing_links` / `get_backlinks` and `vault_search` the topic, then
   `note_read` the most relevant notes. The draft draws on the vault, not
   general knowledge.
2. **Learn the voice.** Skim 1–2 of the user's existing prose notes to match
   their tone, sentence length, and vocabulary. You are drafting *as them*.
3. **Draft section by section**, following the outline's structure. Every
   factual claim about their domain traces to a note you read (cite `[[notes]]`
   where natural). Mark genuine gaps with a clear `[TODO: …]` rather than
   inventing content.
4. **Show the draft**, then on confirmation write it: `note_update` to expand
   the existing note in place (show what changes first), or `note_create` for a
   new draft note linked back to the outline.

## Common mistakes

- Generic AI voice that doesn't match the user's existing notes.
- Inventing facts/citations instead of grounding in the vault or marking a TODO.
- Overwriting the outline via `note_update` without showing the change.
