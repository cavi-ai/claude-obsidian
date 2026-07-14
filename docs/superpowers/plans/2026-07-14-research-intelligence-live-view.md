# Research Intelligence Live View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native, read-only Intelligence tab that derives traceable research findings from the active project and optionally produces a validated Claude or local-model briefing on explicit request.

**Architecture:** Pure research modules compute deterministic findings, stable snapshot fingerprints, bounded model requests, and validated narrative results. A provider coordinator applies the existing Claude/local/Auto routing policy and owns only derived in-memory cache state. A focused Intelligence panel renders typed state inside the existing Research Workbench while `main.ts` injects provider and settings dependencies.

**Tech Stack:** TypeScript, Obsidian Plugin API, existing `Provider`/`ProviderRouter`, Vitest with the in-memory Obsidian fake, CSS in `obsidian-plugin/styles.css`, pnpm/esbuild.

## Global Constraints

- Vault Markdown and attachments remain canonical; Intelligence findings and narratives are rebuildable derived data.
- Deterministic analysis performs no network request.
- Model analysis runs only after the user selects **Analyze**.
- The narrator setting is exactly `current`, `claude`, `local`, or `disabled`, with `current` as the default.
- Current backend reuses existing chat semantics: local uses Ollama, Claude uses Anthropic, and Auto starts with Claude and uses the existing eligible local fallback behavior.
- Local only never silently falls back to Claude.
- Every rendered narrative insight cites only paths supplied in the request and declares `observation`, `inference`, or `suggested-investigation`.
- The feature performs no vault writes and adds no MCP tools.
- Do not change package, manifest, or release versions.
- Do not modify `upstream/html-effectiveness`.

## File Structure

- Create `obsidian-plugin/src/research/intelligence.ts`: deterministic rules, finding types, stable identifiers, and stable ordering.
- Create `obsidian-plugin/src/research/intelligenceNarrative.ts`: snapshot fingerprint, cache key, bounded prompt payload, structured response parser, and path validation.
- Create `obsidian-plugin/src/research/intelligenceCoordinator.ts`: explicit Analyze workflow, provider selection, Auto fallback, stale/current state, and in-memory derived cache.
- Create `obsidian-plugin/src/view/ResearchIntelligencePanel.ts`: typed rendering for findings, narrative states, Analyze action, and record links.
- Modify `obsidian-plugin/src/view/ResearchWorkbenchView.ts`: add the Intelligence tab and delegate its panel.
- Modify `obsidian-plugin/src/types.ts`: add the narrator setting and default.
- Modify `obsidian-plugin/src/settings.ts`: expose the four narrator modes.
- Modify `obsidian-plugin/src/main.ts`: inject settings/provider dependencies and refresh workbench views after relevant settings changes.
- Modify `obsidian-plugin/styles.css`: style category summaries, finding cards, epistemic labels, and narrative states.
- Create `obsidian-plugin/test/research/intelligence.test.ts`: deterministic rule coverage.
- Create `obsidian-plugin/test/research/intelligenceNarrative.test.ts`: fingerprint, payload, parser, and invalid-citation coverage.
- Create `obsidian-plugin/test/research/intelligenceCoordinator.test.ts`: routing, fallback, cache, staleness, and no-write coverage.
- Create `obsidian-plugin/test/research/intelligencePanel.test.ts`: focused rendering and Analyze-state coverage.
- Modify `obsidian-plugin/test/research/workbenchView.test.ts`: seventh tab and integration coverage.
- Modify `obsidian-plugin/test/settings-defaults.test.ts`: `current` default coverage.
- Modify `README.md` and `CHANGELOG.md`: user-facing feature, trust boundary, settings, and verification notes.

---

### Task 1: Deterministic Intelligence Rules

**Files:**
- Create: `obsidian-plugin/src/research/intelligence.ts`
- Create: `obsidian-plugin/test/research/intelligence.test.ts`

**Interfaces:**
- Consumes: `ProjectSnapshot`, `AuditFinding`, `auditProject(snapshot)`, `isTrustedEvidence(evidence, source)`, and `compareCodeUnits(left, right)`.
- Produces: `IntelligenceFinding`, `IntelligenceCategory`, `EpistemicLabel`, and `analyzeProjectIntelligence(snapshot: ProjectSnapshot): IntelligenceFinding[]`.

- [ ] **Step 1: Write failing fixtures for conservative contradiction and method-difference rules**

Create a fixture builder around `buildProjectSnapshot` and assert that only reviewed, locatable, non-stale support and challenge evidence produces a contradiction candidate:

```ts
import { describe, expect, it } from "vitest";
import { buildProjectSnapshot } from "../../src/research/graph";
import { analyzeProjectIntelligence } from "../../src/research/intelligence";
import type { ResearchRecord } from "../../src/research/types";

function snapshot(overrides: ResearchRecord[] = []) {
  const records: ResearchRecord[] = [
    { path: "P.md", title: "P", type: "research-project", project: "P.md", question: "Q?", stage: "reason", status: "active" },
    { path: "S1.md", title: "Trial", type: "research-source", project: "P.md", sourceKind: "pdf", published: "2024", contentFingerprint: "sha256:s1" },
    { path: "S2.md", title: "Review", type: "research-source", project: "P.md", sourceKind: "doi", published: "2018", contentFingerprint: "sha256:s2" },
    { path: "E1.md", title: "Support", type: "evidence", project: "P.md", source: "S1.md", locatorKind: "page", locatorValue: "4", excerpt: "Improved", interpretation: "Positive result", reviewState: "reviewed", sourceFingerprint: "sha256:s1" },
    { path: "E2.md", title: "Challenge", type: "evidence", project: "P.md", source: "S2.md", locatorKind: "section", locatorValue: "Results", excerpt: "No effect", interpretation: "Null result", reviewState: "reviewed", sourceFingerprint: "sha256:s2" },
    { path: "C.md", title: "Claim", type: "claim", project: "P.md", proposition: "Treatment works", confidence: "moderate", reviewState: "reviewed", supports: ["E1.md"], challenges: ["E2.md"], contextualizes: [], limitations: [] },
    ...overrides,
  ];
  return buildProjectSnapshot("P.md", records, []);
}

describe("analyzeProjectIntelligence", () => {
  it("reports a contradiction candidate without deciding which evidence wins", () => {
    const findings = analyzeProjectIntelligence(snapshot());
    expect(findings).toContainEqual(expect.objectContaining({
      category: "contradiction",
      epistemicStatus: "observation",
      paths: ["C.md", "E1.md", "E2.md"],
    }));
    expect(findings.find(({ category }) => category === "contradiction")?.rationale).toMatch(/supporting and challenging evidence/i);
    expect(JSON.stringify(findings)).not.toMatch(/disproves|false/i);
  });

  it("reports only captured methodological fields", () => {
    const finding = analyzeProjectIntelligence(snapshot()).find(({ category }) => category === "method-difference");
    expect(finding?.rationale).toMatch(/pdf|doi/i);
    expect(finding?.rationale).not.toMatch(/randomized|population|sample size/i);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify the missing-module failure**

Run: `cd obsidian-plugin && pnpm exec vitest run test/research/intelligence.test.ts`

Expected: FAIL because `src/research/intelligence.ts` does not exist.

- [ ] **Step 3: Implement the finding contract, stable IDs, and the two claim-comparison rules**

Create these exported types and entry point:

```ts
export type IntelligenceCategory = "contradiction" | "method-difference" | "research-gap" | "evidence-quality";
export type EpistemicLabel = "observation" | "inference" | "suggested-investigation";

export interface IntelligenceFinding {
  id: string;
  category: IntelligenceCategory;
  severity: "error" | "warning" | "info";
  confidence: "high" | "medium" | "low";
  epistemicStatus: EpistemicLabel;
  title: string;
  rationale: string;
  paths: string[];
  verification: string;
}

export function analyzeProjectIntelligence(snapshot: ProjectSnapshot): IntelligenceFinding[] {
  const findings: IntelligenceFinding[] = [];
  // Build source/evidence maps, add conservative claim comparisons, add gap and
  // quality findings, then deduplicate by stable ID and sort by severity,
  // category, first path, and ID using compareCodeUnits.
  return stableFindings(findings);
}
```

Use `findingId(category, rule, paths)` with sorted unique paths and a deterministic string such as ``${category}:${rule}:${paths.join("|")}``. Do not use random IDs or timestamps.

- [ ] **Step 4: Add failing tests for gaps, quality, negative boundaries, IDs, and ordering**

Add cases proving:

```ts
it("does not report contradiction when the challenge is proposed, stale, or missing a locator", () => {
  for (const change of [
    { reviewState: "proposed" as const },
    { sourceFingerprint: "sha256:old" },
    { locatorValue: "" },
  ]) {
    const base = snapshot();
    const changed = { ...base, evidence: base.evidence.map((item) => item.path === "E2.md" ? { ...item, ...change } : item) };
    expect(analyzeProjectIntelligence(changed).some(({ category }) => category === "contradiction")).toBe(false);
  }
});

it("surfaces open questions, no counterevidence, unused reviewed evidence, and audit quality", () => {
  const findings = analyzeProjectIntelligence(snapshot([
    { path: "Q1.md", title: "Open", type: "research-question", project: "P.md", question: "Replicate?", status: "open", about: "C.md" },
    { path: "E3.md", title: "Unused", type: "evidence", project: "P.md", source: "S1.md", locatorKind: "page", locatorValue: "9", excerpt: "Other", reviewState: "reviewed", sourceFingerprint: "sha256:s1" },
  ]));
  expect(findings.map(({ category }) => category)).toEqual(expect.arrayContaining(["research-gap", "evidence-quality"]));
  expect(findings.some(({ paths }) => paths.includes("Q1.md"))).toBe(true);
  expect(findings.some(({ paths }) => paths.includes("E3.md"))).toBe(true);
});

it("returns identical IDs and ordering for equivalent snapshots", () => {
  const first = analyzeProjectIntelligence(snapshot());
  const second = analyzeProjectIntelligence(snapshot());
  expect(second).toEqual(first);
  expect(new Set(first.map(({ id }) => id)).size).toBe(first.length);
});
```

Implement gap rules from open questions, unsupported claims, claims without challenges, unused reviewed evidence, diversity/recency only when computable, and unresolved audit findings. Map existing audit codes into evidence-quality or research-gap without weakening their original severity or repair text.

- [ ] **Step 5: Run tests and commit the deterministic engine**

Run: `cd obsidian-plugin && pnpm exec vitest run test/research/intelligence.test.ts test/research/audit.test.ts test/research/graph.test.ts`

Expected: PASS.

```bash
git add obsidian-plugin/src/research/intelligence.ts obsidian-plugin/test/research/intelligence.test.ts
git commit -m "feat: derive research intelligence findings"
```

---

### Task 2: Narrative Payload, Fingerprint, and Validation

**Files:**
- Create: `obsidian-plugin/src/research/intelligenceNarrative.ts`
- Create: `obsidian-plugin/test/research/intelligenceNarrative.test.ts`

**Interfaces:**
- Consumes: `ProjectSnapshot` and `IntelligenceFinding[]`.
- Produces: `NarrativeRequest`, `NarrativeResult`, `NarrativeInsight`, `buildNarrativeRequest`, `parseNarrativeResponse`, `fingerprintIntelligenceSnapshot`, and `buildNarrativeCacheKey`.

- [ ] **Step 1: Write failing fingerprint and bounded-payload tests**

```ts
import { describe, expect, it } from "vitest";
import { buildNarrativeRequest, fingerprintIntelligenceSnapshot } from "../../src/research/intelligenceNarrative";

it("fingerprints equivalent snapshots independent of record ordering", () => {
  const left = makeSnapshot();
  const right = { ...left, sources: [...left.sources].reverse(), evidence: [...left.evidence].reverse() };
  expect(fingerprintIntelligenceSnapshot(left)).toBe(fingerprintIntelligenceSnapshot(right));
});

it("changes when a narrative-relevant field changes", () => {
  const left = makeSnapshot();
  const right = { ...left, claims: left.claims.map((claim) => ({ ...claim, proposition: `${claim.proposition} revised` })) };
  expect(fingerprintIntelligenceSnapshot(left)).not.toBe(fingerprintIntelligenceSnapshot(right));
});

it("sends only allowed paths and bounded captured context", () => {
  const request = buildNarrativeRequest(makeSnapshot(), makeFindings());
  expect(request.allowedPaths).toEqual([...request.allowedPaths].sort());
  expect(request.messages).toHaveLength(1);
  expect(request.messages[0]?.content).toContain("E1.md");
  expect(request.messages[0]?.content).not.toContain("unrelated vault note");
});
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `cd obsidian-plugin && pnpm exec vitest run test/research/intelligenceNarrative.test.ts`

Expected: FAIL because `src/research/intelligenceNarrative.ts` does not exist.

- [ ] **Step 3: Implement deterministic serialization, cache keys, and bounded request construction**

Use this public contract:

```ts
export const INTELLIGENCE_NARRATIVE_SCHEMA_VERSION = 1;

export interface NarrativeRequest {
  system: string;
  messages: ApiMessage[];
  allowedPaths: string[];
  snapshotFingerprint: string;
}

export function fingerprintIntelligenceSnapshot(snapshot: ProjectSnapshot): string;

export function buildNarrativeCacheKey(input: {
  projectPath: string;
  snapshotFingerprint: string;
  narratorMode: "current" | "claude" | "local" | "disabled";
  providerId: ProviderId;
  model: string;
}): string;

export function buildNarrativeRequest(snapshot: ProjectSnapshot, findings: IntelligenceFinding[]): NarrativeRequest;
```

Canonicalize only fields used by rules or narrative context, sort records and relation arrays by path, serialize keys in code-unit order, and hash with a small deterministic non-cryptographic hash implemented locally. Clip each excerpt/interpretation to an explicit constant and include only records referenced by findings.

- [ ] **Step 4: Write failing strict-parser and invalid-citation tests**

```ts
it("accepts structured insights with allowed citations", () => {
  const result = parseNarrativeResponse(JSON.stringify({
    briefing: "Two priorities.",
    groups: [{ title: "Resolve tension", insights: [{
      text: "The claim has reviewed evidence on both sides.",
      epistemicStatus: "observation",
      paths: ["C.md", "E1.md", "E2.md"],
    }] }],
  }), new Set(["C.md", "E1.md", "E2.md"]));
  expect(result.groups[0]?.insights).toHaveLength(1);
});

it("discards unknown citations and rejects a wholly unusable response", () => {
  expect(() => parseNarrativeResponse(JSON.stringify({
    briefing: "Unsafe",
    groups: [{ title: "Invented", insights: [{ text: "Outside claim", epistemicStatus: "observation", paths: ["Outside.md"] }] }],
  }), new Set(["C.md"]))).toThrow(/verified|allowed path/i);
});

it("rejects free-form prose and unsupported epistemic labels", () => {
  expect(() => parseNarrativeResponse("ordinary prose", new Set(["C.md"]))).toThrow(/JSON/i);
  expect(() => parseNarrativeResponse(JSON.stringify({ briefing: "x", groups: [{ title: "x", insights: [{ text: "x", epistemicStatus: "fact", paths: ["C.md"] }] }] }), new Set(["C.md"]))).toThrow(/verified|schema/i);
});
```

- [ ] **Step 5: Implement the structured parser and run tests**

Define:

```ts
export interface NarrativeInsight {
  text: string;
  epistemicStatus: EpistemicLabel;
  paths: string[];
}

export interface NarrativeResult {
  briefing: string;
  groups: Array<{ title: string; insights: NarrativeInsight[] }>;
}

export function parseNarrativeResponse(raw: string, allowedPaths: ReadonlySet<string>): NarrativeResult;
```

Parse JSON, validate object/array/string shapes, keep only insights with non-empty text, a valid epistemic label, and at least one allowed path, remove empty groups, and throw a user-safe validation error if no usable insights remain. Never render the unparsed raw response.

Run: `cd obsidian-plugin && pnpm exec vitest run test/research/intelligenceNarrative.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the narrative trust boundary**

```bash
git add obsidian-plugin/src/research/intelligenceNarrative.ts obsidian-plugin/test/research/intelligenceNarrative.test.ts
git commit -m "feat: validate research intelligence narratives"
```

---

### Task 3: Provider Routing, Explicit Analysis, Cache, and Staleness

**Files:**
- Create: `obsidian-plugin/src/research/intelligenceCoordinator.ts`
- Create: `obsidian-plugin/test/research/intelligenceCoordinator.test.ts`

**Interfaces:**
- Consumes: `Provider`, `ProviderRouter`, `shouldFallbackToLocal`, `buildNarrativeRequest`, `buildNarrativeCacheKey`, and `parseNarrativeResponse`.
- Produces: `IntelligenceNarratorMode`, `IntelligenceNarrativeState`, `IntelligenceCoordinator`, `stateFor`, `analyze`, and `cancel`.

- [ ] **Step 1: Write failing tests for all four routing modes and Auto fallback**

Use fake providers whose `complete()` records calls and returns structured JSON:

```ts
const valid = JSON.stringify({ briefing: "Brief", groups: [{ title: "Priority", insights: [{ text: "Check both records", epistemicStatus: "observation", paths: ["C.md"] }] }] });

it.each([
  ["current", "local", "ollama"],
  ["current", "claude", "anthropic"],
  ["claude", "local", "anthropic"],
  ["local", "claude", "ollama"],
] as const)("routes %s with chat %s to %s", async (mode, chatBackend, expected) => {
  const harness = coordinatorHarness({ mode, chatBackend, anthropicResult: valid, ollamaResult: valid });
  const state = await harness.coordinator.analyze(harness.snapshot, harness.findings);
  expect(state.status).toBe("current");
  expect(state.providerId).toBe(expected);
});

it("uses eligible local fallback for current plus Auto and discloses Ollama", async () => {
  const harness = coordinatorHarness({ mode: "current", chatBackend: "auto", anthropicError: { status: 429, message: "rate limit" }, ollamaResult: valid, localAvailable: true });
  const state = await harness.coordinator.analyze(harness.snapshot, harness.findings);
  expect(state).toEqual(expect.objectContaining({ status: "current", providerId: "ollama", usedFallback: true }));
});

it("does not call a provider when disabled or fall back to Claude from local only", async () => {
  const disabled = coordinatorHarness({ mode: "disabled", chatBackend: "claude" });
  expect(await disabled.coordinator.analyze(disabled.snapshot, disabled.findings)).toEqual({ status: "disabled" });
  expect(disabled.calls).toEqual([]);

  const local = coordinatorHarness({ mode: "local", chatBackend: "claude", ollamaError: new Error("offline"), anthropicResult: valid });
  expect((await local.coordinator.analyze(local.snapshot, local.findings)).status).toBe("failed");
  expect(local.calls).toEqual(["ollama"]);
});
```

- [ ] **Step 2: Run the focused tests and verify the missing-module failure**

Run: `cd obsidian-plugin && pnpm exec vitest run test/research/intelligenceCoordinator.test.ts`

Expected: FAIL because `src/research/intelligenceCoordinator.ts` does not exist.

- [ ] **Step 3: Implement injected routing and explicit Analyze**

Use a dependency object so the coordinator remains Obsidian-free:

```ts
export type IntelligenceNarratorMode = "current" | "claude" | "local" | "disabled";

export type IntelligenceNarrativeState =
  | { status: "not-analyzed" }
  | { status: "analyzing"; cacheKey: string; providerId: ProviderId; model: string }
  | { status: "current" | "stale"; cacheKey: string; providerId: ProviderId; model: string; usedFallback: boolean; result: NarrativeResult }
  | { status: "disabled" }
  | { status: "failed"; message: string; previous?: Extract<IntelligenceNarrativeState, { status: "current" | "stale" }> };

export interface IntelligenceCoordinatorDeps {
  mode: () => IntelligenceNarratorMode;
  chatBackend: () => ChatBackend;
  anthropic: () => { provider: Provider; model: string };
  local: () => { provider: Provider; model: string };
  localAvailable: () => Promise<boolean>;
  maxTokens: () => number;
}
```

`analyze(snapshot, findings)` builds the request, resolves the starting provider, sets an `AbortController`, calls `complete()` with temperature `0`, parses before caching, and applies Auto fallback only through `shouldFallbackToLocal`. Provider errors must be reduced to a user-safe message; do not expose credentials or raw request bodies.

- [ ] **Step 4: Add failing cache, race, failure-preservation, and no-write tests**

```ts
it("marks a prior valid result stale after a snapshot or model change without rerunning", async () => {
  const harness = coordinatorHarness({ mode: "current", chatBackend: "claude", anthropicResult: valid });
  await harness.coordinator.analyze(harness.snapshot, harness.findings);
  expect(harness.coordinator.stateFor(harness.changedSnapshot, harness.findings).status).toBe("stale");
  expect(harness.calls).toEqual(["anthropic"]);
});

it("does not replace the last valid result after provider or validation failure", async () => {
  const harness = coordinatorHarness({ mode: "current", chatBackend: "claude", anthropicResults: [valid, "invalid"] });
  await harness.coordinator.analyze(harness.snapshot, harness.findings);
  const failed = await harness.coordinator.analyze(harness.changedSnapshot, harness.findings);
  expect(failed.status).toBe("failed");
  expect(failed.status === "failed" && failed.previous?.result.briefing).toBe("Brief");
});

it("ignores a late result for the active state and exposes no vault dependency", async () => {
  const harness = deferredCoordinatorHarness();
  const pending = harness.coordinator.analyze(harness.snapshot, harness.findings);
  harness.coordinator.stateFor(harness.changedSnapshot, harness.findings);
  harness.resolve(valid);
  await pending;
  expect(harness.coordinator.stateFor(harness.changedSnapshot, harness.findings).status).toBe("stale");
  expect("vault" in harness.deps).toBe(false);
});
```

- [ ] **Step 5: Implement cache state, request sequencing, and cancellation**

Store only validated results in a `Map<string, CachedNarrative>`. Track the latest requested/active key separately. `stateFor()` computes the current key without invoking a provider, returns the matching cache entry as current, or returns the most recent project result as stale. `cancel()` aborts the live request. A late response may populate only its own derived cache key and must never be labeled current against a newer active key.

Run: `cd obsidian-plugin && pnpm exec vitest run test/research/intelligenceCoordinator.test.ts test/fallback.test.ts test/providers.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the provider coordinator**

```bash
git add obsidian-plugin/src/research/intelligenceCoordinator.ts obsidian-plugin/test/research/intelligenceCoordinator.test.ts
git commit -m "feat: coordinate research intelligence analysis"
```

---

### Task 4: Narrator Setting and Plugin Wiring

**Files:**
- Modify: `obsidian-plugin/src/types.ts`
- Modify: `obsidian-plugin/src/settings.ts`
- Modify: `obsidian-plugin/src/main.ts`
- Modify: `obsidian-plugin/test/settings-defaults.test.ts`
- Create: `obsidian-plugin/test/research/intelligenceWiring.test.ts`

**Interfaces:**
- Consumes: `IntelligenceCoordinator`, `ProviderRouter`, and persisted `PluginSettings`.
- Produces: `PluginSettings.intelligenceNarrator`, `DEFAULT_SETTINGS.intelligenceNarrator`, and one shared coordinator injected into Research Workbench views.

- [ ] **Step 1: Write failing settings-default and wiring tests**

```ts
it("defaults research intelligence to the current chat backend", () => {
  expect(DEFAULT_SETTINGS.intelligenceNarrator).toBe("current");
});
```

In `intelligenceWiring.test.ts`, instantiate the plugin with fake router providers and assert that the coordinator dependency resolves the live settings value rather than capturing a stale copy.

- [ ] **Step 2: Run tests and verify the missing-setting failure**

Run: `cd obsidian-plugin && pnpm exec vitest run test/settings-defaults.test.ts test/research/intelligenceWiring.test.ts`

Expected: FAIL because `intelligenceNarrator` is not part of `PluginSettings` or `DEFAULT_SETTINGS`.

- [ ] **Step 3: Add the typed setting, default, and settings dropdown**

Add to `PluginSettings`:

```ts
/** Provider policy for explicit Research Intelligence narrative analysis. */
intelligenceNarrator: "current" | "claude" | "local" | "disabled";
```

Add `intelligenceNarrator: "current"` beside `chatBackend` in `DEFAULT_SETTINGS`.

In the local-model settings section, add:

```ts
new Setting(containerEl)
  .setName("Research intelligence narrator")
  .setDesc("Choose the provider used only when you click Analyze in a Research Intelligence view. Deterministic findings stay local and always remain available.")
  .addDropdown((dd) => {
    dd.addOption("current", "Current chat backend");
    dd.addOption("claude", "Claude only");
    dd.addOption("local", "Local only");
    dd.addOption("disabled", "Disabled");
    dd.setValue(this.plugin.settings.intelligenceNarrator).onChange(async (value) => {
      this.plugin.settings.intelligenceNarrator = value as PluginSettings["intelligenceNarrator"];
      await this.plugin.saveSettings();
      this.plugin.refreshViews();
    });
  });
```

- [ ] **Step 4: Construct one plugin-owned coordinator and inject it into the registered view**

Add a lazy `_intelligenceCoordinator` field and an `intelligenceCoordinator()` method in `main.ts`. Its dependency closures must call `this.router()` and read `this.settings` at request time. Extend `refreshViews()` to rerender Research Workbench leaves so provider-mode changes immediately mark narratives stale or disabled.

Change view registration to pass a dependency object rather than importing the plugin from the view:

```ts
this.registerView(RESEARCH_WORKBENCH_VIEW_TYPE, (leaf) => new ResearchWorkbenchView(
  leaf,
  this.researchRepository(),
  { coordinator: this.intelligenceCoordinator(), narratorMode: () => this.settings.intelligenceNarrator },
));
```

The coordinator remains memory-only for this slice. This satisfies plugin-owned derived caching while avoiding a data migration or canonical vault record. Cache loss on plugin restart is safe and expected.

- [ ] **Step 5: Run focused settings and wiring tests, then commit**

Run: `cd obsidian-plugin && pnpm exec vitest run test/settings-defaults.test.ts test/research/intelligenceWiring.test.ts test/providers.test.ts test/fallback.test.ts`

Expected: PASS.

```bash
git add obsidian-plugin/src/types.ts obsidian-plugin/src/settings.ts obsidian-plugin/src/main.ts obsidian-plugin/test/settings-defaults.test.ts obsidian-plugin/test/research/intelligenceWiring.test.ts
git commit -m "feat: configure research intelligence narrator"
```

---

### Task 5: Intelligence Panel and Workbench Integration

**Files:**
- Create: `obsidian-plugin/src/view/ResearchIntelligencePanel.ts`
- Create: `obsidian-plugin/test/research/intelligencePanel.test.ts`
- Modify: `obsidian-plugin/src/view/ResearchWorkbenchView.ts`
- Modify: `obsidian-plugin/test/research/workbenchView.test.ts`
- Modify: `obsidian-plugin/styles.css`

**Interfaces:**
- Consumes: `ProjectSnapshot`, `analyzeProjectIntelligence`, `IntelligenceCoordinator`, and `IntelligenceNarrativeState`.
- Produces: `ResearchIntelligencePanel.render(root, snapshot)` and a seventh `Intelligence` workbench tab.

- [ ] **Step 1: Write failing panel tests for finding categories, labels, and links**

```ts
it("renders category counts and traceable finding cards", async () => {
  const opened: string[] = [];
  const panel = new ResearchIntelligencePanel({
    coordinator: fakeCoordinator({ status: "not-analyzed" }),
    openPath: async (path) => { opened.push(path); },
  });
  panel.render(root, snapshotWithContradiction());
  expect(texts(root, ".cc-intelligence-category")).toEqual(expect.arrayContaining([expect.stringMatching(/Contradictions\s+1/)]));
  expect(texts(root, ".cc-intelligence-epistemic")).toContain("Observation");
  click(first(root, '[data-path="C.md"]'));
  expect(opened).toEqual(["C.md"]);
});
```

- [ ] **Step 2: Write failing tests for every narrative state and explicit Analyze**

```ts
it.each([
  ["not-analyzed", "Analyze this project"],
  ["analyzing", "Analyzing"],
  ["stale", "Out of date"],
  ["disabled", "Model analysis is disabled"],
  ["failed", "could not be verified"],
] as const)("renders %s", (status, copy) => {
  const panel = panelForState(status);
  panel.render(root, snapshotWithContradiction());
  expect(root.textContent).toContain(copy);
});

it("calls Analyze only after the button is selected", async () => {
  const harness = panelHarness();
  harness.panel.render(root, snapshotWithContradiction());
  expect(harness.analyzeCalls).toBe(0);
  click(button(root, "Analyze"));
  await flushPromises();
  expect(harness.analyzeCalls).toBe(1);
});
```

- [ ] **Step 3: Run panel tests and verify the missing-component failure**

Run: `cd obsidian-plugin && pnpm exec vitest run test/research/intelligencePanel.test.ts`

Expected: FAIL because `ResearchIntelligencePanel.ts` does not exist.

- [ ] **Step 4: Implement the focused renderer**

The panel owns no graph or provider policy. On each render it calls `analyzeProjectIntelligence(snapshot)`, reads `coordinator.stateFor(snapshot, findings)`, and renders:

```ts
export interface ResearchIntelligencePanelDeps {
  coordinator: IntelligenceCoordinator;
  openPath(path: string): Promise<void>;
  rerender(): Promise<void>;
}

export class ResearchIntelligencePanel {
  constructor(private readonly deps: ResearchIntelligencePanelDeps) {}
  render(root: HTMLElement, snapshot: ProjectSnapshot): void;
}
```

Render a four-category summary even when counts are zero. Finding cards show severity, confidence, epistemic label, rationale, verification, and one button per path. The narrative section shows the resolved provider/model for analyzing/current/stale results, marks fallback explicitly, disables duplicate Analyze clicks, and retains `failed.previous` as stale content below the error.

- [ ] **Step 5: Add the seventh workbench tab and cancellation lifecycle**

Change the tab union and array:

```ts
type Tab = "Overview" | "Sources" | "Evidence" | "Claims" | "Outline" | "Audit" | "Intelligence";
const TABS: Tab[] = ["Overview", "Sources", "Evidence", "Claims", "Outline", "Audit", "Intelligence"];
```

Construct one panel per view with `openPath` and `rerender` callbacks. Delegate when `activeTab === "Intelligence"`. On view close or project-path replacement, cancel the active analysis before discarding its UI relevance. Keep repository loading and vault-change refresh in `ResearchWorkbenchView`.

Update `workbenchView.test.ts` to expect seven tabs, navigate End to index 6, select Intelligence, and assert deterministic findings refresh after a changed repository snapshot while `analyzeCalls` stays zero.

- [ ] **Step 6: Add responsive, native-looking styles**

Add focused classes:

```css
.cc-intelligence-categories { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.cc-intelligence-category, .cc-intelligence-finding, .cc-intelligence-narrative { border: 1px solid var(--background-modifier-border); border-radius: var(--radius-m); padding: 10px; }
.cc-intelligence-finding { margin-block: 8px; background: var(--background-secondary); }
.cc-intelligence-meta { display: flex; flex-wrap: wrap; gap: 6px; color: var(--text-muted); font-size: var(--font-ui-smaller); }
.cc-intelligence-paths { display: flex; flex-wrap: wrap; gap: 6px; }
.cc-intelligence-stale { border-color: var(--color-orange); }
@media (max-width: 520px) { .cc-intelligence-categories { grid-template-columns: 1fr; } }
```

Use Obsidian variables only. Ensure path controls are real buttons, focusable, and not color-only indicators.

- [ ] **Step 7: Run UI and integration tests, then commit**

Run: `cd obsidian-plugin && pnpm exec vitest run test/research/intelligencePanel.test.ts test/research/workbenchView.test.ts test/research/workbenchRouting.test.ts`

Expected: PASS.

```bash
git add obsidian-plugin/src/view/ResearchIntelligencePanel.ts obsidian-plugin/src/view/ResearchWorkbenchView.ts obsidian-plugin/styles.css obsidian-plugin/test/research/intelligencePanel.test.ts obsidian-plugin/test/research/workbenchView.test.ts
git commit -m "feat: add research intelligence workbench tab"
```

---

### Task 6: End-to-End Safety Cases and Documentation

**Files:**
- Create: `obsidian-plugin/test/research/intelligenceFlow.test.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: the complete Intelligence engine, coordinator, settings, and view integration.
- Produces: regression proof for the full read-only flow and user-facing documentation.

- [ ] **Step 1: Write an integration test for local analysis, staleness, failure retention, and zero vault writes**

Build the view with a fake repository, a Local-only coordinator, and an Obsidian fake vault whose mutation methods count calls:

```ts
it("runs explicit local analysis, marks it stale after a project edit, and never writes", async () => {
  const harness = intelligenceFlowHarness({ narrator: "local" });
  await harness.view.setProjectPath("P.md");
  await harness.openIntelligence();
  expect(harness.providerCalls).toEqual([]);
  await harness.clickAnalyze();
  expect(harness.providerCalls).toEqual(["ollama"]);
  expect(harness.view.contentEl.textContent).toContain("Local model");

  harness.replaceSnapshot(changedSnapshot());
  await harness.view.render();
  expect(harness.view.contentEl.textContent).toContain("Out of date");
  expect(harness.providerCalls).toEqual(["ollama"]);
  expect(harness.vaultWrites).toEqual([]);
});
```

Add companion cases for Disabled, malformed model JSON, unknown citations, and a project change that resolves a deterministic finding without invoking a provider.

- [ ] **Step 2: Run the flow test and fix only integration defects**

Run: `cd obsidian-plugin && pnpm exec vitest run test/research/intelligenceFlow.test.ts`

Expected: PASS after correcting dependency wiring or view-state defects. Do not weaken parser, path, review-state, or no-write assertions to make the test pass.

- [ ] **Step 3: Update README and changelog**

Document:

- where to find the Intelligence tab;
- what the four deterministic categories mean;
- that deterministic analysis stays local and automatically refreshes;
- that model narrative is explicit, optional, provider-identified, and validated against project paths;
- the four narrator settings and exact Current/Auto behavior;
- that narratives are derived, may become stale, perform no vault writes, and are not scientific-validity judgments.

Add an Unreleased changelog entry without changing any version number.

- [ ] **Step 4: Run all local quality gates**

Run from `obsidian-plugin/`:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
```

Expected: all commands exit 0. Record the Vitest file/test counts in the implementation handoff.

- [ ] **Step 5: Commit integration proof and documentation**

```bash
git add obsidian-plugin/test/research/intelligenceFlow.test.ts README.md CHANGELOG.md
git commit -m "docs: explain research intelligence workflow"
```

---

### Task 7: Isolated Obsidian Proof and Final Review

**Files:**
- Modify only if proof reveals a defect: files introduced or explicitly modified in Tasks 1-6.
- Evidence output: `/private/tmp/research-intelligence-local-proof.png`

**Interfaces:**
- Consumes: production `main.js`, `manifest.json`, `styles.css`, an isolated Obsidian profile, a representative research vault, and a configured local model.
- Produces: visual/runtime proof and a clean final branch ready for review.

- [ ] **Step 1: Build and install the production bundle into the isolated proof vault**

Run: `cd obsidian-plugin && pnpm run build`

Expected: typecheck and esbuild succeed, producing `main.js` with no version changes.

Copy `main.js`, `manifest.json`, and `styles.css` into the isolated vault's `.obsidian/plugins/claude-companion/` directory using the existing proof harness. Preserve the isolated application launch pattern with no captured stdout/stderr pipe so Obsidian cannot trigger the previously diagnosed harness `EPIPE` failure.

- [ ] **Step 2: Prove deterministic and Local-only behavior in Obsidian**

In the isolated app:

1. Open the representative Research Project and its Intelligence tab.
2. Confirm all four category counts render and finding paths open their notes.
3. Set the narrator to Local only and select Analyze.
4. Confirm the panel identifies the configured local provider/model.
5. Edit a relevant project record and confirm deterministic findings update while the old narrative becomes visibly stale without a second provider request.
6. Disable model analysis and confirm deterministic findings remain available.
7. Confirm the vault contains no generated intelligence note and no research records were mutated by analysis.

- [ ] **Step 3: Capture visual proof**

Capture `/private/tmp/research-intelligence-local-proof.png` showing the Intelligence tab, traceable finding cards, the provider identity, and a stale or current narrative state. Verify the image is readable and contains no API keys, OAuth tokens, bearer tokens, private vault paths, or unrelated user data.

- [ ] **Step 4: Re-run final gates after any proof-driven fix**

Run from `obsidian-plugin/`:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
```

Expected: all commands exit 0 after the final source state.

- [ ] **Step 5: Inspect branch scope and request code review**

Run:

```bash
git status --short
git diff origin/main...HEAD --stat
git diff --check origin/main...HEAD
```

Expected: only the planned Intelligence implementation, tests, docs, bundle output required by repository convention, and the pre-existing unstaged `upstream/html-effectiveness` modification are present. The submodule modification remains untouched and unstaged.

Invoke `superpowers:requesting-code-review`, address validated findings, repeat the final gates, and commit any proof/review fixes with a focused message before preparing a PR. Do not push or create a PR without the user's explicit approval.
