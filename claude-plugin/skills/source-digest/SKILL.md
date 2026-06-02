---
name: source-digest
description: Use when digesting research sources or papers, extracting claims from notes tagged as sources, or building an evidence or comparison table from reference notes.
---

# Source digest

Turn a set of source/reference notes into a structured, comparable digest —
claims, evidence, and gaps — grounded in the notes themselves.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Process

1. **Find the sources.** Use `frontmatter_query` to select the source notes —
   e.g. `field: type, value: source` (or `paper`, or a `tags` value the vault
   uses). Fall back to `vault_search` if the vault doesn't tag sources.
2. **Read each** (`note_read`). Extract: the core claim/finding, the evidence or
   method behind it, and any stated limitations.
3. **Build a comparison.** A table with one row per source and columns for
   claim, evidence/strength, and notes — so sources can be compared at a glance.
   Cite each row to its `[[source note]]`.
4. **Surface agreement, conflict, and gaps.** Where sources agree, where they
   disagree (cite both), and what the set doesn't cover.
5. **Output.** A self-contained `claude-html` artifact
   (claude-obsidian:note-to-artifact) leading with the headline finding.

## Hard requirements

- Every claim/row traces to a source note you read (`[[cited]]`).
- A real comparison table, not prose summaries stacked up.
- Conflicts and gaps stated explicitly.

## Common mistakes

- Summarizing from general knowledge instead of the source notes.
- Missing sources because you only searched text and never used
  `frontmatter_query` on the vault's source tag/type.
