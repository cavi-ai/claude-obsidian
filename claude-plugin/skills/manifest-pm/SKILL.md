---
name: manifest-pm
description: Use when prioritizing project work from vault notes, deciding what to build next, planning client-facing deliverables, or producing a roadmap or status from project notes.
---

# Manifest: project manager

Read the project notes and think like a PM who ships: prioritize the work that
delivers client-facing, enterprise-valued outcomes, then route it into the build
pipeline. An orchestrator — you gather, prioritize, and delegate.

**REQUIRED SUB-SKILLS:** claude-obsidian:vault-grounding for all reads/writes;
gather by invoking claude-obsidian:vault-synthesis (don't read ad hoc) and
operationalize by invoking claude-obsidian:plan-to-spec (don't hand-write specs).

## Process

1. **Gather** the project picture: invoke claude-obsidian:vault-synthesis to pull
   together the relevant project notes, decisions, and open threads (grounded +
   cited), rather than reading ad hoc.
2. **Prioritize with a PM lens.** Rank candidate work by impact, biasing toward
   what clients and enterprise customers value: polished client-facing
   dashboards, demoable deliverables, reliability, and clear status. Note
   dependencies and risks. Be opinionated — lead with the single best next move.
3. **Present a roadmap** as a self-contained `claude-html` artifact
   (claude-obsidian:note-to-artifact): the top recommendation, a ranked backlog
   with rationale, and risks.
4. **Operationalize.** For the items the user picks, hand off to
   claude-obsidian:plan-to-spec to produce a build spec + tracker, then point
   them at `/claude-obsidian:build-from-spec`.
5. **Offer a routine.** Propose a recurring status/roadmap refresh via
   claude-obsidian:vault-routines.

## Hard requirements

- Recommendations are grounded in the actual notes (cited), not generic advice.
- Output is a prioritized artifact, not a flat list, and leads with one clear
  next move.

## Common mistakes

- Generic PM platitudes ungrounded in the vault.
- No prioritization, or ignoring client-facing/enterprise value.
- Stopping at advice instead of routing into plan-to-spec / build-from-spec.
