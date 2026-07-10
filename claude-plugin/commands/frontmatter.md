---
description: Audit and normalize note frontmatter to a consistent schema — survey first, confirm the schema, then apply additively with consent.
argument-hint: "[optional folder or scope, e.g. Projects/]"
---

Normalize note frontmatter following the **claude-obsidian:frontmatter-normalizer** skill.

Optional scope: `$1` (a folder or note set — otherwise ask which notes to target).

Steps:

1. **Survey** existing frontmatter with `frontmatter_query` across the target
   notes (scoped to `$1` if given): which fields exist, how values vary.
2. **Agree the schema** — propose the target fields + allowed values and confirm
   with the user; show notes missing fields or using off-schema values before
   editing anything.
3. **Apply additively** with `update_frontmatter` in user-approved batches (tags
   union, scalars set) — never strip fields you didn't discuss.
4. **Report** what changed.
