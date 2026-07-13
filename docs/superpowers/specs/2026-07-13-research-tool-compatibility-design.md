# Research Tool Compatibility Design

**Date:** 2026-07-13  
**Target:** Companion for Claude MCP and agent research tools

## Goal

Expose workflow-oriented Research Workbench tool names, including a real evidence-review operation, without breaking callers that already use the Phase 1 `*_create` names or showing duplicate tools to users and models.

## Public Tool Surface

The advertised MCP and agent tool definitions contain only these workflow-oriented write tools:

- `research_project_create`
- `research_source_import`
- `research_evidence_capture`
- `research_evidence_review`
- `research_claim_create`
- `research_audit`
- `research_outline_generate`

Existing research read tools remain unchanged. The legacy names `research_evidence_create` and `research_outline_create` are not advertised.

## Compatibility Dispatch

The executor continues accepting direct calls to:

- `research_evidence_create`, routed to the same implementation as `research_evidence_capture`;
- `research_outline_create`, routed to the same implementation as `research_outline_generate`.

These aliases remain supported indefinitely. Because they exist only in dispatch—not in tool definitions—existing callers continue to work while discovery surfaces show no duplicates.

## Evidence Review

`research_evidence_review` accepts an evidence record path and a target review state of `reviewed` or `rejected`.

The operation:

1. resolves and reads the existing evidence record;
2. rejects missing, malformed, or non-evidence records;
3. changes only the review-state field;
4. preserves the evidence excerpt, locator, source relationship, captured fingerprint, project relationship, and readable body;
5. writes through the canonical Research Repository rather than raw text replacement;
6. returns the updated record path and review state.

Re-reviewing to the current state is idempotent. `proposed` is a capture state, not a review result, and is rejected as a review target.

## Capture and Outline Semantics

`research_evidence_capture` uses the existing evidence-creation implementation and defaults new evidence to `proposed` unless a supported explicit state is part of the existing contract. The canonical skill instructs agents to capture as proposed and then use the dedicated review operation.

`research_outline_generate` uses the existing outline-creation implementation and retains the Phase 1 trust boundary: only reviewed, locatable, non-stale evidence connected to valid sources may appear as trusted support.

## Security and Visibility

- All advertised and compatibility research mutations remain behind `mcpAllowWrites`.
- The MCP bridge remains loopback-only and bearer-token authenticated.
- Agent-mode write confirmation continues to apply through the existing write-tool classification.
- Hidden aliases are executable only when writes are enabled; they never bypass gating.
- The settings/tool-count documentation describes the advertised surface, not hidden aliases.

## Documentation and Skill Alignment

The canonical `research-workbench` skill and Companion `/research` prompt use the advertised names only. Public READMEs explain that Research Workbench mutation requires MCP writes to be enabled and remains confirmation-gated. Tool totals are derived from advertised definitions and distinguish always-available reads from write-gated operations where useful.

## Verification

- Definition tests assert that new names are advertised and legacy aliases are absent.
- Dispatch tests prove both legacy aliases still execute when writes are enabled and remain unavailable when writes are disabled.
- Repository/tool tests prove review-state mutation preserves every other evidence field and body content.
- Invalid review targets, missing records, malformed records, and non-evidence records return actionable errors.
- Agent adapter tests prove the same no-duplicate visibility and write classification.
- Skill parity tests assert exact advertised tool names rather than only broad stage vocabulary.
- Full typecheck, lint, unit tests, production build, and `git diff --check` pass.
- Isolated-vault proof shows `/research` selected with its prompt inserted but unsent.

## Scope Boundaries

- No version bump.
- No removal or expiry date for legacy aliases.
- No new research record type.
- No widening of network binding, authentication, or write defaults.
- No unrelated MCP, agent, or slash-menu refactor.
- No changes to the pinned `upstream/html-effectiveness` submodule.

