# Task 3 Report: Provider Routing, Explicit Analysis, Cache, and Staleness

## RED evidence

- `pnpm exec vitest run test/research/intelligenceCoordinator.test.ts`
- Result: failed as expected because `src/research/intelligenceCoordinator.ts` did not exist.
- A later focused RED assertion verified that `stateFor()` did not yet expose an active request as `analyzing`.

## GREEN evidence

- `pnpm exec vitest run test/research/intelligenceCoordinator.test.ts test/fallback.test.ts test/providers.test.ts`
- Result: 3 files passed, 35 tests passed.
- Coverage includes all routing modes, the sole eligible Auto fallback, explicit-provider no-fallback policy, disabled mode, deterministic request settings, safe errors, validated-only cache preservation, snapshot/model/mode staleness, late-result sequencing, active analyzing state, no vault dependency, and cancellation.

## Full suite and static gates

- `pnpm run typecheck`: passed.
- `pnpm run lint`: passed.
- `pnpm test`: 85 files passed, 832 tests passed (run before final self-review; rerun immediately before commit is recorded below).

## Files

- `obsidian-plugin/src/research/intelligenceCoordinator.ts`
- `obsidian-plugin/test/research/intelligenceCoordinator.test.ts`

## Self-review

- The coordinator is provider-agnostic and dependency-injected; it imports no Obsidian or vault APIs.
- `claude` and `local` modes are provider-exclusive. `current` respects explicit chat backend selection. Only `current + auto` consults `shouldFallbackToLocal`.
- Responses are parsed before cache insertion. Failures retain the latest valid project result as stale and do not cache invalid output.
- Cache identity accounts for snapshot, narrator mode, chat backend, provider, and model. A local Auto fallback remains current for the configuration that initiated it while disclosing the actual provider and fallback flag.
- `stateFor()` is side-effect-free with respect to providers and probes; it only derives state and cache identity.
- Late requests can populate only their own key and are returned as stale when the desired key has moved.
- User-facing errors classify common provider failures without returning raw request bodies or arbitrary provider messages.
- The pre-existing modified `upstream/html-effectiveness` submodule was not touched or staged. Versions were not changed.

## Concerns

- None known. The coordinator is not wired into an Obsidian view in this task by design.

## Review fixes

### RED

Command: `cd obsidian-plugin && pnpm exec vitest run test/research/intelligenceCoordinator.test.ts`

```text
Test Files  1 failed (1)
Tests  6 failed | 12 passed (18)
```

The six expected failures covered actual-provider Auto fallback currentness after a local model change, four strict/current explicit-selection credential gates with zero provider calls and actionable setup messages, and credential-unavailable Auto fallback to an eligible local provider.

### GREEN

Command: `cd obsidian-plugin && pnpm exec vitest run test/research/intelligenceCoordinator.test.ts`

```text
Test Files  1 passed (1)
Tests  18 passed (18)
```

Command: `cd obsidian-plugin && pnpm exec vitest run test/research/intelligenceCoordinator.test.ts test/fallback.test.ts test/providers.test.ts`

```text
Test Files  3 passed (3)
Tests  41 passed (41)
```

Command: `cd obsidian-plugin && pnpm run typecheck`

```text
> claude-companion@0.10.1 typecheck /Volumes/MIRZA/workspace/CAVI/plugins/claude-obsidian/obsidian-plugin
> tsc --noEmit --skipLibCheck
```

## Review fix: newest eligible Auto cache entry

### RED

Command: `cd obsidian-plugin && pnpm exec vitest run test/research/intelligenceCoordinator.test.ts`

```text
Test Files  1 failed (1)
Tests  2 failed | 18 passed (20)
```

Both ordering regressions failed as expected: `stateFor()` returned the older eligible cached provider and briefing after an unchanged Auto analysis switched from Ollama fallback to Anthropic, and after the reverse switch from Anthropic to Ollama fallback.

### GREEN

Command: `cd obsidian-plugin && pnpm exec vitest run test/research/intelligenceCoordinator.test.ts`

```text
Test Files  1 passed (1)
Tests  20 passed (20)
```

Command: `cd obsidian-plugin && pnpm run typecheck`

```text
> claude-companion@0.10.1 typecheck /Volumes/MIRZA/workspace/CAVI/plugins/claude-obsidian/obsidian-plugin
> tsc --noEmit --skipLibCheck
```

## Review fix: same-key concurrent analysis ordering

### RED

Command: `cd obsidian-plugin && pnpm exec vitest run test/research/intelligenceCoordinator.test.ts`

```text
Test Files  1 failed (1)
Tests  1 failed | 20 passed (21)
```

The deterministic deferred-provider regression resolved the newer identical-key analysis first and the abort-ignoring older analysis second. The older call incorrectly returned `current` with the older briefing, demonstrating that its unconditional cache write could replace the newer result.

### GREEN

Command: `cd obsidian-plugin && pnpm exec vitest run test/research/intelligenceCoordinator.test.ts`

```text
Test Files  1 passed (1)
Tests  21 passed (21)
```

Command: `cd obsidian-plugin && pnpm run typecheck`

```text
> claude-companion@0.10.1 typecheck /Volumes/MIRZA/workspace/CAVI/plugins/claude-obsidian/obsidian-plugin
> tsc --noEmit --skipLibCheck
```
