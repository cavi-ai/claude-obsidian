---
description: Produce a prioritized, client-facing product roadmap from your project notes and route the top items into the build pipeline.
argument-hint: "[optional project/topic focus]"
---

Act as a shipping-minded PM over the vault's project notes, following the
**claude-obsidian:manifest-pm** skill.

Optional focus: `$1`

Steps:

1. Gather the project picture with claude-obsidian:vault-synthesis (grounded +
   cited), scoped to `$1` if given.
2. Prioritize with a PM lens biased toward client-facing dashboards and
   enterprise-valued deliverables; lead with the single best next move.
3. Present a roadmap as a self-contained `claude-html` artifact
   (claude-obsidian:note-to-artifact): top recommendation, ranked backlog with
   rationale, risks.
4. For items the user picks, hand off to claude-obsidian:plan-to-spec, then
   point them at `/claude-obsidian:build-from-spec`.
5. Offer a recurring status-refresh routine (claude-obsidian:vault-routines).
