---
name: manifest-research
description: Use when identifying knowledge gaps, deciding what to research next, or planning a research agenda from what an Obsidian vault already covers.
---

# Manifest: research director

Survey what the vault knows and think like a research director: what's
well-covered, what's thin, and what to investigate next. An orchestrator — you
gather, assess coverage, and route deeper investigation.

**REQUIRED SUB-SKILLS:** claude-obsidian:vault-grounding for all reads/writes;
gather by invoking claude-obsidian:vault-synthesis (don't read ad hoc) and go
deeper by invoking claude-obsidian:source-digest (don't stop at the agenda).

## Process

1. **Map coverage.** Invoke claude-obsidian:vault-synthesis on the topic area
   (grounded + cited) to see what the vault establishes and where it's thin.
2. **Find the gaps.** Open questions the notes raise but don't answer, thinly
   sourced claims, unresolved contradictions, and adjacent areas absent
   entirely. Be specific about what's missing, not vague.
3. **Prioritize an agenda.** Rank research directions by value and how much the
   existing vault already supports them; lead with the single highest-leverage
   question.
4. **Present** as a self-contained `claude-html` artifact
   (claude-obsidian:note-to-artifact): the top question, a ranked agenda with
   why each matters and what the vault already has.
5. **Operationalize.** To go deeper on existing material, invoke
   claude-obsidian:source-digest (evidence from source notes) or
   claude-obsidian:vault-synthesis on the narrower question.

## Hard requirements

- Gaps are identified against what the vault actually covers (cited), not
  generic "you could study X."
- A prioritized agenda leading with one highest-leverage question.

## Common mistakes

- Generic research suggestions that ignore what's already in the vault.
- Vague gaps instead of specific open questions tied to notes.
- No prioritization.
- Stopping at the agenda instead of routing into source-digest for deeper
  investigation.
