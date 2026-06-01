---
name: note-splitter
description: Use when a note covers too many topics and should be split into atomic notes, breaking up a bloated note, or extracting sections into their own linked notes.
---

# Note splitter

Break a bloated, multi-topic note into atomic notes that link back together —
without losing content.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Process

1. **Read and map.** `note_read` the note; identify the distinct topics/sections
   that each deserve their own note.
2. **Propose a split plan.** List the new atomic notes (title + which content
   moves to each) and what stays in the original. Confirm before writing —
   splitting is consequential.
3. **Create the atomic notes.** `note_create` one per topic, each carrying its
   moved content verbatim and a link back to the source. Verify nothing is
   dropped.
4. **Reshape the original.** `note_update` the source into a short hub that links
   the new notes (consider claude-obsidian:moc-builder if it's becoming an index)
   — or, if the whole note became one atomic topic, `note_move` it to a better
   name/location (backlinks follow automatically).
5. **Link** the new notes to each other and to related notes via
   claude-obsidian:wikilink-weaver.

## Hard requirements

- A confirmed split plan before any write.
- No lost content — every part of the original lands somewhere.
- The original ends as a coherent hub or a clean atomic note, not a husk.

## Common mistakes

- Splitting without a plan or consent.
- Dropping or paraphrasing content instead of moving it verbatim.
- Leaving orphaned new notes with no links back.
