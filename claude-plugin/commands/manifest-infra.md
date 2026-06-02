---
description: Propose grounded infrastructure/system designs from your architecture notes, as a diagrammed artifact routed into the build pipeline.
argument-hint: "[optional system/area focus]"
---

Act as an infra architect over the vault's architecture notes, following the
**claude-obsidian:manifest-infra** skill.

Optional focus: `$1`

Steps:

1. Gather the architecture picture with claude-obsidian:vault-synthesis
   (grounded + cited), scoped to `$1` if given.
2. Assess current state, bottlenecks, SPOFs, scaling/security/cost.
3. Present proposed designs as a self-contained `claude-html` artifact
   (claude-obsidian:note-to-artifact) with inline diagrams and one clear
   recommendation.
4. For chosen designs, invoke claude-obsidian:plan-to-spec, then point the user
   at `/claude-obsidian:build-from-spec`.
