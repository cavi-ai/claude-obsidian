---
name: connection-finder
description: Use when looking for non-obvious connections between notes, surfacing related-but-unlinked notes, or finding serendipitous links across an Obsidian vault.
---

# Connection finder

Surface real, non-obvious relationships between notes that aren't linked yet —
the connections the user would value but hasn't made.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Process

1. **Anchor.** Take the focus note (or topic). `note_read` it and note its
   themes, entities, and questions.
2. **Cast a wide net.** `vault_search` the themes/entities; `list_titles` to know
   what notes exist. Gather candidate neighbors and `note_read` the promising
   ones.
3. **Exclude what's already linked.** Use `get_outgoing_links` /
   `get_backlinks` on the anchor — don't re-suggest existing connections.
4. **Judge for real relationships.** For each candidate, decide if there's a
   genuine conceptual link (shared argument, cause/effect, example-of, tension),
   not a coincidental keyword. Discard weak matches.
5. **Present ranked, with rationale.** Top connections first, each: the two
   notes, the relationship, and why it matters. Then, on the user's go-ahead,
   invoke claude-obsidian:wikilink-weaver to make the links.

## Common mistakes

- Suggesting a connection to a note not in `list_titles` (it doesn't exist).
- Re-proposing links that already exist (didn't check existing links).
- Dumping every keyword co-occurrence instead of ranking real relationships.
