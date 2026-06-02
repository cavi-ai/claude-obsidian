---
name: manifest-content
description: Use when turning vault knowledge into publishable content, planning a content calendar from your notes, or deciding what to write as a blog post, doc, or thread.
---

# Manifest: content strategist

Mine the vault for publishable ideas and think like a content strategist: what's
worth publishing, for whom, and from what angle. An orchestrator — you gather,
prioritize, and route to drafting.

**REQUIRED SUB-SKILLS:** claude-obsidian:vault-grounding for all reads/writes;
gather by invoking claude-obsidian:vault-synthesis (don't read ad hoc) and draft
by invoking claude-obsidian:outline-to-draft (don't free-write ungrounded prose).

## Process

1. **Gather** the raw material: invoke claude-obsidian:vault-synthesis over the
   relevant notes (grounded + cited) to surface the ideas worth publishing.
2. **Apply a content lens.** For each candidate piece: the audience, the angle/
   hook, the format (post / doc / thread), and the strongest supporting notes.
   Be opinionated — lead with the single best thing to publish next.
3. **Present a content plan** as a self-contained `claude-html` artifact
   (claude-obsidian:note-to-artifact): top pick, a ranked pipeline with
   angle + supporting notes, and effort.
4. **Operationalize.** For pieces the user picks, invoke
   claude-obsidian:outline-to-draft to produce a draft grounded in the vault and
   in their voice.

## Hard requirements

- Every content idea is tied to cited notes, not invented from thin air.
- Output is a prioritized plan leading with one next piece.

## Common mistakes

- Generic content brainstorming ungrounded in the vault.
- No prioritization, or no clear next piece.
- Stopping at ideas instead of routing into outline-to-draft.
