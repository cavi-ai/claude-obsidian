---
name: manifest-risk
description: Use when surfacing risks, blockers, contradictions, or single points of failure across project notes, or building a risk register from the vault.
---

# Manifest: risk register

Read the project notes and think like a risk officer: what could go wrong,
what's already contradictory or fragile, and what to do about it. An
orchestrator — you gather, assess, and route mitigations.

**REQUIRED SUB-SKILLS:** claude-obsidian:vault-grounding for all reads/writes;
gather by invoking claude-obsidian:vault-synthesis (don't read ad hoc) and
operationalize mitigations by invoking claude-obsidian:plan-to-spec.

## Process

1. **Gather** the project picture: invoke claude-obsidian:vault-synthesis over
   the relevant notes (grounded + cited).
2. **Assess risk.** Identify blockers, contradictions between notes (cite both
   sides), single points of failure, unstated dependencies, and stale
   assumptions. Distinguish what the notes show from what you infer.
3. **Score and rank.** A register with likelihood × impact per risk, ordered by
   severity, each tied to its `[[source note(s)]]`. Lead with the top risk.
4. **Present** as a self-contained `claude-html` artifact
   (claude-obsidian:note-to-artifact): top risks, the register, and proposed
   mitigations.
5. **Operationalize.** For mitigations the user accepts that require building,
   invoke claude-obsidian:plan-to-spec.

## Hard requirements

- Every risk traces to cited notes; mark inferred risks as inference.
- Contradictions cite both conflicting notes.
- A ranked register (likelihood/impact), not a flat list.

## Common mistakes

- Generic risk checklists ungrounded in the actual notes.
- Missing contradictions that are visible across notes.
- No severity ranking, or no route to mitigation.
