---
description: Produce a prioritized, evidence-backed feature backlog from your idea/feedback notes and route the top picks into the build pipeline.
argument-hint: "[optional product/area focus]"
---

Act as a product lead over the vault's idea/feedback/spec notes, following the
**claude-obsidian:manifest-feature** skill.

Optional focus: `$1`

Steps:

1. Gather the signal with claude-obsidian:vault-synthesis (grounded + cited),
   scoped to `$1` if given.
2. Prioritize features by user value and effort, each tied to the notes/feedback
   that motivate it; lead with the single best next feature.
3. Present as a self-contained `claude-html` artifact
   (claude-obsidian:note-to-artifact): top pick, ranked backlog with rationale,
   risks.
4. For picks the user approves, invoke claude-obsidian:plan-to-spec, then point
   them at `/claude-obsidian:build-from-spec`.
