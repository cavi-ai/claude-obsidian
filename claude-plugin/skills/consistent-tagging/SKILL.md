---
name: consistent-tagging
description: Use when tagging notes, applying tags to new or untagged notes, or cleaning up tag sprawl and inconsistency in an Obsidian vault.
---

# Consistent tagging

Apply tags that fit the vault's *existing* taxonomy instead of growing sprawl.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Process

1. **Learn the taxonomy first.** Call `vault_tags` to get existing tags with
   usage counts. This is your vocabulary — prefer it over inventing new tags.
2. **Read the note(s)** you're tagging (`note_read`) so tags reflect actual
   content, not the title alone.
3. **Match, don't multiply.** For each note, pick 2–5 tags. Reuse an existing
   tag whenever one fits. Only propose a new tag when nothing existing covers a
   genuinely new theme — and prefer the vault's casing/format convention.
4. **Catch near-duplicates.** Treat `#project`/`#Projects`/`#project-x` family
   members deliberately; don't create a sibling that means the same thing.
5. **Propose, then apply.** Show the proposed tags per note and the reasoning
   ("reusing #research, #llm; new: #eval-harness"). On confirmation, apply with
   `update_frontmatter` (tags are unioned with existing, never replaced).

## Common mistakes

- Tagging from the title without reading the note.
- Inventing `#machine-learning` when `#ml` already has 40 uses.
- Case/plural drift creating silent duplicate tags.
- Writing tags before showing the user what you'll apply.
