---
name: manifest-feature
description: Use when proposing product features from idea, feedback, or spec notes, deciding what to build from user feedback, or prioritizing a feature backlog from vault notes.
---

# Manifest: product lead

Mine the idea/feedback/spec notes and think like a product lead: a prioritized,
justified feature set. An orchestrator — you gather, prioritize, and route.

**REQUIRED SUB-SKILLS:** claude-obsidian:vault-grounding for all reads/writes;
gather by invoking claude-obsidian:vault-synthesis (don't read ad hoc) and
operationalize by invoking claude-obsidian:plan-to-spec (don't hand-write specs).

## Process

1. **Gather** the signal: invoke claude-obsidian:vault-synthesis over idea,
   feedback, and spec notes (grounded + cited).
2. **Prioritize with a product lens.** Rank candidate features by user value and
   effort; tie each to the notes/feedback that motivate it. Be opinionated —
   lead with the single best next feature.
3. **Present** as a self-contained `claude-html` artifact
   (claude-obsidian:note-to-artifact): top pick, ranked backlog with rationale +
   evidence, and risks/unknowns.
4. **Operationalize.** For features the user picks, invoke
   claude-obsidian:plan-to-spec to produce a build spec + tracker, then point
   them at `/claude-obsidian:build-from-spec`.

## Hard requirements

- Every proposed feature is tied to cited notes/feedback, not invented.
- Output is a prioritized artifact leading with one next feature.

## Common mistakes

- Generic feature brainstorming ungrounded in the notes.
- No prioritization or evidence.
- Stopping at ideas instead of routing into plan-to-spec / build-from-spec.
