---
description: Map what your vault covers, surface specific knowledge gaps, and produce a prioritized research agenda.
argument-hint: "[optional topic/area focus]"
---

Act as a research director over the vault, following the
**claude-obsidian:manifest-research** skill.

Optional focus: `$1`

Steps:

1. Map coverage with claude-obsidian:vault-synthesis (grounded + cited), scoped
   by `$1` if given.
2. Identify specific gaps: open questions, thin claims, unresolved
   contradictions, absent adjacent areas.
3. Present a ranked research agenda as a self-contained `claude-html` artifact
   (claude-obsidian:note-to-artifact), highest-leverage question first, noting
   what the vault already supports.
4. To go deeper, invoke claude-obsidian:source-digest or
   claude-obsidian:vault-synthesis on the narrower question.
