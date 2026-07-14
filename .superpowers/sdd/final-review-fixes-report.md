# Final Review Fixes Report

**Review range:** `43e5644..0d52e41`
**Date:** 2026-07-14

## Scope

- Prioritize the coordinator's `disabled` state over a panel-local remembered failure.
- Classify only unused **reviewed** evidence as a research gap; preserve proposed/rejected unused-evidence audit findings as evidence-quality findings.
- Replace absolute no-findings copy with wording scoped to deterministic analysis of current structured records.
- Add exact 1,000-character narrative clipping coverage and cache-key sensitivity coverage for all public cache-key inputs.

## RED evidence

Command:

```text
pnpm exec vitest run test/research/intelligencePanel.test.ts test/research/intelligence.test.ts test/research/intelligenceNarrative.test.ts
```

Observed before production changes: exit 1; 2 failed, 32 passed.

- `intelligence.test.ts`: reviewed unused evidence remained `evidence-quality` instead of the required `research-gap` classification.
- `intelligencePanel.test.ts`: the empty state still rendered `No intelligence findings.` instead of scoped deterministic/current-record wording.
- The clipping and cache-key tests passed immediately, confirming existing behavior and adding precision coverage without requiring production changes.

The Disabled regression was then strengthened to exercise a failure returned from `analyze`, remember it in the panel, change coordinator state to `disabled`, refresh, and assert both Disabled copy and absence of an Analyze button.

## GREEN evidence

Focused command:

```text
pnpm exec vitest run test/research/intelligence.test.ts test/research/audit.test.ts test/research/graph.test.ts test/research/intelligenceNarrative.test.ts test/research/intelligenceCoordinator.test.ts test/research/intelligencePanel.test.ts test/research/workbenchView.test.ts test/settings-defaults.test.ts
```

Observed: exit 0; 8 files passed, 85 tests passed.

Full gates:

```text
pnpm run typecheck  # exit 0
pnpm run lint       # exit 0
pnpm test           # exit 0; 88 files, 876 tests
pnpm run build      # exit 0; TypeScript and production esbuild bundle
git diff --check    # exit 0
```

## Implementation notes

- `ResearchIntelligencePanel` treats `disabled` as authoritative before considering its remembered transient failure.
- `auditCategory` checks the referenced evidence review state only for `unused-evidence`; all other audit mappings retain their prior behavior and severity/repair text.
- No version files or upstream submodule content were changed.
