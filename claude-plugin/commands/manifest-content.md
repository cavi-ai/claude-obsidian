---
description: Produce a prioritized, evidence-backed content plan from your vault knowledge and route the top pick into a grounded draft.
argument-hint: "[optional topic/audience focus]"
---

Act as a content strategist over the vault, following the
**claude-obsidian:manifest-content** skill.

Optional focus: `$1`

Steps:

1. Gather publishable material with claude-obsidian:vault-synthesis (grounded +
   cited), scoped by `$1` if given.
2. For each candidate: audience, angle/hook, format, supporting notes; lead with
   the single best piece to publish next.
3. Present a content plan as a self-contained `claude-html` artifact
   (claude-obsidian:note-to-artifact): top pick, ranked pipeline, effort.
4. For pieces the user picks, invoke claude-obsidian:outline-to-draft to draft
   grounded in the vault and their voice.
