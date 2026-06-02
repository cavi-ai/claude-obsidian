---
name: dedup-merge
description: Use when finding and merging duplicate or near-duplicate notes, consolidating notes that cover the same thing, or cleaning up redundant notes in an Obsidian vault.
---

# Dedup & merge

Consolidate duplicate notes into one canonical note — safely, and honestly about
what the tools can and can't do.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Process

1. **Find candidates.** `vault_search` / `list_titles` for likely duplicates;
   `note_read` each to confirm they truly overlap (similar title ≠ duplicate).
2. **Pick the canonical note** and propose the merge: what unique content from
   each copy combines, and what's redundant. Confirm before writing.
3. **Merge into canonical.** `note_update` the canonical note to include the
   union of unique content (don't drop anything the other copy had).
4. **Handle the duplicate — there is NO delete tool.** Turn the duplicate into a
   tombstone with `note_update`: a short note whose body is
   `Merged into [[Canonical]].` Optionally `note_move` it to an `Archive/` folder
   (backlinks follow it automatically). Tell the user to delete the tombstone in
   Obsidian if they want it gone — you cannot delete it.
5. **Re-point references.** Check `get_backlinks` to the duplicate; update those
   notes (via claude-obsidian:wikilink-weaver) to link the canonical note.

## Hard requirements

- Confirm the merge plan before writing.
- Never lose unique content from the non-canonical copy.
- Never claim to delete a note — leave a tombstone and tell the user to delete.

## Common mistakes

- Treating same-titled notes as duplicates without reading them.
- Dropping content that only existed in the merged-away copy.
- Pretending the duplicate is deleted when it's only tombstoned.
