# Research Workbench Phase 1 final-fix report

Date: 2026-07-13

## Scope and result

- Enforced claim review-state trust at audit and outline boundaries. Proposed and rejected claims produce explainable findings; outline creation fails actionably before any document write unless every selected claim is reviewed.
- Added confirmed public `research_project_create` and `research_source_import` mutations through `ResearchTools`, `VaultTools`, and the agent write-confirmation classifier. Source import accepts canonical captured text or metadata-only records; repository binary rules remain unchanged.
- Replaced Workbench Create project/Add source no-ops with validated modal operations backed by the canonical repository.
- Distinguished no-selection from project load/corruption errors, with project path, redacted/sanitized error text, recovery guidance, and an Audit action.
- Added linked tab/tabpanel ids, `aria-controls`/`aria-labelledby`, roving `tabindex`, and ArrowLeft/ArrowRight/Home/End navigation.
- Expanded DOM-level coverage for empty, loaded, error, metrics/health, actions, tabs, panels, and keyboard behavior. Regenerated `obsidian-plugin/main.js`.
- Preserved the already-dirty pinned `upstream/html-effectiveness` submodule without modifying or staging it. No versions or release metadata changed.

## TDD evidence

Initial focused run:

`pnpm exec vitest run test/research/audit.test.ts test/research/outline.test.ts test/research/tools.test.ts test/vaultTools.test.ts test/agentTools.test.ts`

Result: 9 expected failures across the missing review-state findings, unsafe outline acceptance, missing public routes, and missing write classification.

Focused green run:

`pnpm exec vitest run test/research/workbenchView.test.ts test/research/audit.test.ts test/research/outline.test.ts test/research/tools.test.ts test/vaultTools.test.ts test/agentTools.test.ts`

Result: 6 files passed, 83 tests passed.

The public-route trust regression creates a project, imports a canonical text source, creates reviewed evidence, creates a proposed claim, then proves outline creation returns an actionable error and leaves `Documents/Outline.md` absent.

## Final verification

All commands ran from `obsidian-plugin/` unless noted.

- `pnpm test` (with loopback bind permission): 82 files passed, 791 tests passed.
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0.
- `pnpm run build`: exit 0; production `main.js` regenerated, embed worker bundle 516.9kb.
- `git diff --check` (repository root): exit 0.

## Self-review

- Trust: proposition and evidence content cannot enter a generated outline through a proposed or rejected selected claim. The repository renders only after the check, so failure is non-mutating.
- Mutation safety: both new routes are in the shared research write set, so MCP advertisement obeys `mcpAllowWrites` and agent execution fails closed until the user confirms. Existing decline tests cover no-call/no-mutation behavior for every research mutation.
- Import safety: tool arguments are strictly typed and validated before delegation; repository path, project membership, deduplication, atomic creation, and binary asset/adaptor invariants remain authoritative.
- Error handling: only a normalized, bounded, credential-redacted message is rendered; the project path and recovery steps remain visible.
- Accessibility: each active tab owns exactly one panel and is the sole tab stop; keyboard navigation wraps and supports Home/End.
- Platform: no Node imports were introduced in research domain/view code. Existing structural mobile CSS remains unchanged. Manual desktop/mobile screenshots were not produced in this terminal-only pass and remain a separate QA activity.

## Commits

Commit SHA is recorded after commit creation in the task handoff.
