---
name: manifest-infra
description: Use when proposing infrastructure or system designs from architecture notes, reviewing a system's design, or planning infra and scaling moves from vault notes.
---

# Manifest: infra architect

Read the architecture notes and think like an infra architect: current state,
gaps, risks, and concrete proposed designs. An orchestrator — you gather,
design, and route; you don't reinvent the worker skills.

**REQUIRED SUB-SKILLS:** claude-obsidian:vault-grounding for all reads/writes;
gather by invoking claude-obsidian:vault-synthesis (don't read ad hoc) and
operationalize by invoking claude-obsidian:plan-to-spec (don't hand-write specs).

## Process

1. **Gather** the architecture picture: invoke claude-obsidian:vault-synthesis
   over the systems/infra notes (grounded + cited).
2. **Assess** with an infra lens: current state, bottlenecks, single points of
   failure, scaling limits, security/cost concerns.
3. **Propose designs.** Concrete options with trade-offs; include inline SVG
   diagrams where they clarify. Be opinionated — recommend one.
4. **Present** as a self-contained `claude-html` artifact
   (claude-obsidian:note-to-artifact): recommendation first, then options, risks,
   and a migration sketch.
5. **Operationalize.** For chosen designs, invoke claude-obsidian:plan-to-spec to
   produce a build spec + tracker, then point the user at
   `/claude-obsidian:build-from-spec`.

## Hard requirements

- Designs are grounded in the actual notes (cited), not generic best practices.
- Output is a `claude-html` artifact that leads with one recommendation.

## Common mistakes

- Generic infra advice ungrounded in the vault.
- No diagram/artifact, or no clear recommendation.
- Stopping at ideas instead of routing into plan-to-spec / build-from-spec.
