---
name: research-workbench
description: Use when framing a serious research project, capturing sources and evidence, building supported claims, auditing provenance, or producing an evidence-backed outline.
---

# Research workbench

Preserve continuity from research question through an evidence-backed outline.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Workflow

1. **Project** — identify the active `research-project`; if none exists, offer `research_project_create` with a focused question.
2. **Source** — import source material with `research_source_import`; preserve readable content and its computed fingerprint.
3. **Evidence** — capture an exact excerpt and locator with `research_evidence_capture`, then use `research_evidence_review` before treating it as trusted.
4. **Claim** — use `research_claim_create` to keep supporting, challenging, and contextual relations distinct.
5. **Audit** — run `research_audit`; surface stale fingerprints, missing locators, broken references, unreviewed evidence, and unsupported claims.
6. **Outline** — use `research_outline_generate`; include only reviewed, locatable, non-stale evidence as trusted support.

## Rules

- Use research tools instead of hand-editing canonical research records.
- Never present proposed, rejected, stale, disconnected, or unsupported material as trusted support.
- Ask before material vault writes and report the records created or updated.
- Run only the stages needed for the user's request, then name the next useful stage.
- If a required tool is unavailable, identify it and stop rather than fabricate state.
