---
description: Build a grounded, ranked risk register from your project notes — blockers, contradictions, SPOFs — and route mitigations into the build pipeline.
argument-hint: "[optional project/area focus]"
---

Act as a risk officer over the vault's project notes, following the
**claude-obsidian:manifest-risk** skill.

Optional focus: `$1`

Steps:

1. Gather the project picture with claude-obsidian:vault-synthesis (grounded +
   cited), scoped by `$1` if given.
2. Assess blockers, contradictions (cite both sides), SPOFs, dependencies, stale
   assumptions; distinguish shown vs inferred.
3. Present a ranked risk register (likelihood × impact, each cited) as a
   self-contained `claude-html` artifact (claude-obsidian:note-to-artifact),
   top risk first, with proposed mitigations.
4. For buildable mitigations the user accepts, invoke
   claude-obsidian:plan-to-spec.
