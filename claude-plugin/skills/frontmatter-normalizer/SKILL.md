---
name: frontmatter-normalizer
description: Use when enforcing a consistent frontmatter schema across notes, auditing or normalizing note metadata, or fixing inconsistent frontmatter fields in a folder.
---

# Frontmatter normalizer

Bring a set of notes to a consistent frontmatter schema — surveying what's
there before changing anything.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Process

1. **Survey.** Use `frontmatter_query` across the target notes to see which
   fields exist and how values vary (e.g. `type` present on some, missing on
   others; `status` values inconsistent).
2. **Agree the schema.** Propose the target schema (which fields, allowed
   values) and confirm it with the user — don't impose one silently.
3. **Find the gaps.** List notes missing required fields or using off-schema
   values. Show this before editing.
4. **Apply, additively.** Use `update_frontmatter` to set missing/normalized
   fields. It merges (tags union; scalar set) and preserves untouched keys —
   never strip fields you didn't discuss.
5. **Batch with consent.** Apply in batches the user approves; report what
   changed.

## Hard requirements

- Survey with `frontmatter_query` BEFORE proposing a schema.
- Confirm the schema and the change set before writing.
- Additive normalization — don't delete frontmatter you weren't asked to.

## Common mistakes

- Imposing a schema without seeing the existing one.
- Bulk-rewriting metadata with no consent or preview.
