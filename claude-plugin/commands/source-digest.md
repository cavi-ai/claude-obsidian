---
description: Digest your research source notes into a cited evidence/comparison table artifact with conflicts and gaps.
argument-hint: "[source type/tag or topic]"
---

Build an evidence digest from the vault's source notes, following the
**claude-obsidian:source-digest** skill.

Source selector / topic: `$1`

Steps:

1. Select source notes with `frontmatter_query` (e.g. the vault's `source`/`paper`
   type or tag), scoped by `$1` if given; fall back to `vault_search`.
2. `note_read` each; extract claim, evidence/strength, limitations.
3. Build a cited comparison table (one row per source), then state agreement,
   conflicts, and gaps.
4. Present as a self-contained `claude-html` artifact
   (claude-obsidian:note-to-artifact), leading with the headline finding.
