# Scholarly Discovery and Citation Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-scoped Discover workflow that searches public scholarly metadata, explains deterministic ranking, expands one citation hop, optionally reranks without changing the candidate set, and explicitly imports duplicate-safe unreviewed Source Records.

**Architecture:** OpenAlex is the discovery and citation-graph spine; Crossref and arXiv independently verify and enrich typed adapter results. Pure normalization, identity, ranking, and rerank validation feed a request-sequenced coordinator and a native Research Workbench Discover panel. All search state is derived; the existing `ResearchRepository.importSource` boundary performs the only vault writes.

**Tech Stack:** TypeScript, Obsidian API, native `fetch`, existing Anthropic/Ollama `Provider` abstraction, Vitest, esbuild, CSS.

## Global Constraints

- No external request occurs before explicit **Search**, **Expand citations**, or **Rerank with model**.
- OpenAlex is required for discovery and graph expansion; Crossref and arXiv failures degrade verification without discarding usable OpenAlex candidates.
- Search, expansion, selection, dismissal, candidate detail, and reranking perform zero vault writes.
- Only explicit import writes, through `ResearchRepository.importSource`, and every imported source remains unreviewed by the existing trust model.
- Model reranking must contain every known candidate ID exactly once; it cannot add, remove, or mutate candidates.
- Expansion is exactly one hop per explicit action.
- Project changes mark sessions stale and never trigger background network work.
- Captured source content, unrelated vault notes, attachments, credentials, and raw adapter payloads never enter discovery model prompts.
- MCP remains loopback-only, bearer-token gated, and write-gated exactly as before.
- Do not change `manifest.json`, `versions.json`, or `package.json` versions.
- Do not modify `upstream/html-effectiveness`.
- Run all build and test commands from `obsidian-plugin/`.

## File Structure

- `src/discovery/types.ts` — adapter-neutral query, candidate, provenance, score, relationship, and session contracts.
- `src/discovery/query.ts` — derive a bounded editable query from the project question and reviewed claims.
- `src/discovery/normalize.ts` — merge typed adapter works while retaining field provenance and disagreements.
- `src/discovery/identity.ts` — candidate IDs, conservative candidate merging, and candidate-to-source duplicate detection.
- `src/discovery/rank.ts` — versioned deterministic factors, weights, and stable ordering.
- `src/discovery/rerank.ts` — bounded provider request and exact-permutation response validation.
- `src/discovery/adapters/openAlex.ts` — OpenAlex search, work lookup, references, and cited-by mapping.
- `src/discovery/adapters/crossref.ts` — Crossref DOI verification and enrichment.
- `src/discovery/adapters/arxiv.ts` — arXiv identifier and version enrichment.
- `src/discovery/coordinator.ts` — explicit request orchestration, cancellation, pagination, cache, stale state, and import delegation.
- `src/view/DiscoveryPanel.ts` — native Discover search, inbox, detail, expansion, rerank, selection, and import UI.
- Existing research types/render/parse/repository files — persist discovery provenance and abstract/access metadata on imported Source Records.
- Existing settings/types/main/workbench files — settings, one shared coordinator, lifecycle cancellation, and the Discover tab.

---

### Task 1: Discovery contracts, query derivation, identity, and normalization

**Files:**
- Create: `obsidian-plugin/src/discovery/types.ts`
- Create: `obsidian-plugin/src/discovery/query.ts`
- Create: `obsidian-plugin/src/discovery/identity.ts`
- Create: `obsidian-plugin/src/discovery/normalize.ts`
- Test: `obsidian-plugin/test/discovery/query.test.ts`
- Test: `obsidian-plugin/test/discovery/identity.test.ts`
- Test: `obsidian-plugin/test/discovery/normalize.test.ts`

**Interfaces:**
- Consumes: `ProjectSnapshot` from `src/research/graph.ts`; `normalizeDoi`, `normalizeArxivId`, and `findDuplicate` behavior from `src/research/identity.ts`.
- Produces: `DiscoveryQuery`, `AdapterWork`, `DiscoveryCandidate`, `deriveDiscoveryQuery(snapshot)`, `candidateId(work)`, `mergeAdapterWorks(works, existingSources)`.

- [ ] **Step 1: Write failing query and identity tests**

```ts
import { describe, expect, it } from "vitest";
import { deriveDiscoveryQuery } from "../../src/discovery/query";
import { candidateId } from "../../src/discovery/identity";

it("derives the query from the project question and reviewed claims only", () => {
  const query = deriveDiscoveryQuery({
    project: { path: "P/Project.md", title: "P", type: "research-project", project: "P/Project.md", question: "Do interventions work?", stage: "gather", status: "active" },
    sources: [], evidence: [], questions: [], documents: [], issues: [],
    claims: [
      { path: "C1.md", title: "Reviewed", type: "claim", project: "P/Project.md", proposition: "Interventions reduce risk", confidence: "moderate", reviewState: "reviewed", supports: [], challenges: [], contextualizes: [], limitations: [] },
      { path: "C2.md", title: "Proposed", type: "claim", project: "P/Project.md", proposition: "Secret draft", confidence: "low", reviewState: "proposed", supports: [], challenges: [], contextualizes: [], limitations: [] },
    ],
  });
  expect(query.text).toContain("Do interventions work?");
  expect(query.text).toContain("Interventions reduce risk");
  expect(query.text).not.toContain("Secret draft");
});

it("prefers DOI, then arXiv, then OpenAlex identity", () => {
  expect(candidateId({ adapter: "openalex", externalId: "W1", title: "T", authors: [], doi: "https://doi.org/10.1/X" })).toBe("doi:10.1/x");
  expect(candidateId({ adapter: "arxiv", externalId: "2501.01234v3", title: "T", authors: [], arxivId: "2501.01234v3" })).toBe("arxiv:2501.01234");
  expect(candidateId({ adapter: "openalex", externalId: "W1", title: "T", authors: [] })).toBe("openalex:W1");
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm exec vitest run test/discovery/query.test.ts test/discovery/identity.test.ts`

Expected: FAIL because `src/discovery/query.ts` and `src/discovery/identity.ts` do not exist.

- [ ] **Step 3: Add the discovery contracts and minimal query/identity implementation**

```ts
export type DiscoveryAdapterId = "openalex" | "crossref" | "arxiv";
export type CitationDirection = "references" | "cited-by";
export interface DiscoveryQuery { text: string; projectPath: string; }
export interface AdapterWork {
  adapter: DiscoveryAdapterId; externalId: string; title: string; authors: string[];
  doi?: string; arxivId?: string; openAlexId?: string; published?: string;
  publication?: string; abstract?: string; url?: string; openAccessUrl?: string;
  referencedWorkIds?: string[]; citedByCount?: number;
}
export interface FieldProvenance { adapter: DiscoveryAdapterId; externalId: string; value: string | string[]; }
export interface MetadataDisagreement { field: string; values: FieldProvenance[]; }
export interface CitationRelationship { seedId: string; direction: CitationDirection; adapter: "openalex"; }
export interface DiscoveryCandidate {
  id: string; title: string; authors: string[]; doi?: string; arxivId?: string; openAlexId?: string;
  published?: string; publication?: string; abstract?: string; url?: string; openAccessUrl?: string;
  provenance: Record<string, FieldProvenance[]>; disagreements: MetadataDisagreement[];
  relationship?: CitationRelationship; existingSourcePath?: string; verification: "verified" | "partial";
}
```

Implement `deriveDiscoveryQuery` by joining the trimmed project question with reviewed claim propositions, deduplicating equal normalized lines, and clipping to 2,000 characters. Implement `candidateId` with normalized DOI, normalized arXiv ID, OpenAlex ID, then a normalized `title|year|first-author` fingerprint. Throw `Discovery candidate has no stable identity` when no safe identity exists.

- [ ] **Step 4: Write failing normalization tests**

```ts
it("retains field provenance and exposes adapter disagreement", () => {
  const candidate = mergeAdapterWorks([
    { adapter: "openalex", externalId: "W1", openAlexId: "W1", doi: "10.1/x", title: "Open title", authors: ["Ada"], published: "2025" },
    { adapter: "crossref", externalId: "10.1/x", doi: "10.1/x", title: "Crossref title", authors: ["Ada"], published: "2025" },
  ], [source("Sources/Existing.md", { doi: "10.1/x" })]);
  expect(candidate.id).toBe("doi:10.1/x");
  expect(candidate.provenance.title).toHaveLength(2);
  expect(candidate.disagreements.map(({ field }) => field)).toContain("title");
  expect(candidate.existingSourcePath).toBe("Sources/Existing.md");
});

it("never merges works with conflicting stable identifiers", () => {
  expect(() => mergeAdapterWorks([
    { adapter: "openalex", externalId: "W1", doi: "10.1/a", title: "Same", authors: ["Ada"], published: "2025" },
    { adapter: "crossref", externalId: "10.1/b", doi: "10.1/b", title: "Same", authors: ["Ada"], published: "2025" },
  ], [])).toThrow(/conflicting stable identifiers/i);
});
```

- [ ] **Step 5: Implement normalization and run GREEN**

Implement `mergeAdapterWorks` with fixed field precedence: Crossref for DOI bibliographic fields, arXiv for arXiv version fields, OpenAlex for graph fields, and first non-empty value otherwise. Retain every distinct adapter value in `provenance`; add `MetadataDisagreement` whenever normalized non-empty values differ. Build a temporary `ResearchSourceRecord` projection and call existing duplicate semantics against project sources.

Run: `pnpm exec vitest run test/discovery/query.test.ts test/discovery/identity.test.ts test/discovery/normalize.test.ts test/research/identity.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add obsidian-plugin/src/discovery/types.ts obsidian-plugin/src/discovery/query.ts obsidian-plugin/src/discovery/identity.ts obsidian-plugin/src/discovery/normalize.ts obsidian-plugin/test/discovery/query.test.ts obsidian-plugin/test/discovery/identity.test.ts obsidian-plugin/test/discovery/normalize.test.ts
git commit -m "feat: normalize scholarly discovery candidates"
```

---

### Task 2: Deterministic ranking and exact-set model reranking

**Files:**
- Create: `obsidian-plugin/src/discovery/rank.ts`
- Create: `obsidian-plugin/src/discovery/rerank.ts`
- Test: `obsidian-plugin/test/discovery/rank.test.ts`
- Test: `obsidian-plugin/test/discovery/rerank.test.ts`

**Interfaces:**
- Consumes: `DiscoveryCandidate`, `DiscoveryQuery`, and `Provider.complete(CompletionRequest)`.
- Produces: `RankedCandidate`, `rankCandidates(query, candidates, now)`, `buildRerankRequest(...)`, `parseRerankResponse(raw, candidateIds)`, `rerankCandidates(...)`.

- [ ] **Step 1: Write deterministic ranking tests**

```ts
it("exposes every deterministic factor and stable tie breaking", () => {
  const ranked = rankCandidates({ text: "risk intervention", projectPath: "P/Project.md" }, [
    candidate("b", { title: "Risk intervention", published: "2025", openAccessUrl: "https://oa.test/b" }),
    candidate("a", { title: "Other", published: "2010" }),
  ], new Date("2026-01-01T00:00:00Z"));
  expect(ranked[0]?.candidate.id).toBe("b");
  expect(Object.keys(ranked[0]?.factors ?? {}).sort()).toEqual(["citationRelationship", "metadataCompleteness", "openAccess", "projectOverlap", "queryRelevance", "recency"]);
  expect(ranked[0]?.deterministicRank).toBe(1);
});
```

- [ ] **Step 2: Verify ranking RED, implement, and verify GREEN**

Run: `pnpm exec vitest run test/discovery/rank.test.ts`

Expected RED: missing `rank.ts`.

Implement `DISCOVERY_RANKING_VERSION = 1`, factor values in `[0, 1]`, fixed weights totaling 1, descending total score, then candidate ID ascending as the final tie-breaker. `RankedCandidate` must retain the candidate, factor object, total score, and deterministic rank.

Run the same command. Expected: PASS.

- [ ] **Step 3: Write rerank trust-boundary tests**

```ts
it("accepts only an exact permutation of known candidate IDs", () => {
  expect(parseRerankResponse('{"order":[{"id":"b","reason":"Direct"},{"id":"a","reason":"Context"}]}', ["a", "b"]).order.map(({ id }) => id)).toEqual(["b", "a"]);
  expect(() => parseRerankResponse('{"order":[{"id":"a","reason":"Only"}]}', ["a", "b"])).toThrow(/every candidate exactly once/i);
  expect(() => parseRerankResponse('{"order":[{"id":"a","reason":"One"},{"id":"x","reason":"Unknown"}]}', ["a", "b"])).toThrow(/unknown candidate/i);
});

it("excludes captured source content and unrelated notes from the request", () => {
  const request = buildRerankRequest({ text: "Question", projectPath: "P.md" }, ranked, "model-id");
  expect(request.messages[0]?.content).toContain('"id":"a"');
  expect(request.messages[0]?.content).not.toContain("capturedContent");
  expect(request.temperature).toBe(0);
});
```

- [ ] **Step 4: Implement rerank request/validation and run GREEN**

Use a 4,000-character maximum per candidate projection across title, authors, year, venue, abstract excerpt, deterministic factors, and relationship. Require JSON object `{ "order": [{ "id": string, "reason": string }] }`; clip reasons to 300 characters. `rerankCandidates` calls one explicitly resolved provider and returns model rank plus original deterministic rank/factors without mutating candidates.

Run: `pnpm exec vitest run test/discovery/rank.test.ts test/discovery/rerank.test.ts test/research/intelligenceNarrative.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add obsidian-plugin/src/discovery/rank.ts obsidian-plugin/src/discovery/rerank.ts obsidian-plugin/test/discovery/rank.test.ts obsidian-plugin/test/discovery/rerank.test.ts
git commit -m "feat: rank scholarly discovery results"
```

---

### Task 3: Public scholarly adapters

**Files:**
- Create: `obsidian-plugin/src/discovery/adapters/http.ts`
- Create: `obsidian-plugin/src/discovery/adapters/openAlex.ts`
- Create: `obsidian-plugin/src/discovery/adapters/crossref.ts`
- Create: `obsidian-plugin/src/discovery/adapters/arxiv.ts`
- Test: `obsidian-plugin/test/discovery/openAlex.test.ts`
- Test: `obsidian-plugin/test/discovery/crossref.test.ts`
- Test: `obsidian-plugin/test/discovery/arxiv.test.ts`
- Fixture: `obsidian-plugin/test/fixtures/discovery/openalex-search.json`
- Fixture: `obsidian-plugin/test/fixtures/discovery/openalex-work.json`
- Fixture: `obsidian-plugin/test/fixtures/discovery/crossref-work.json`
- Fixture: `obsidian-plugin/test/fixtures/discovery/arxiv-feed.xml`

**Interfaces:**
- Consumes: `DiscoveryQuery`, `AdapterWork`, `CitationDirection`, injected `DiscoveryHttp`.
- Produces: `OpenAlexAdapter.search`, `OpenAlexAdapter.expand`, `CrossrefAdapter.lookupDoi`, `ArxivAdapter.lookup`, `DiscoveryAdapterError`.

- [ ] **Step 1: Add minimal public-response fixtures and failing mapping tests**

```ts
it("maps OpenAlex search without leaking raw payloads", async () => {
  const adapter = new OpenAlexAdapter(httpFixture("openalex-search.json"), { maxResults: 20 });
  const page = await adapter.search({ text: "risk intervention", projectPath: "P.md" });
  expect(page.items[0]).toMatchObject({ adapter: "openalex", openAlexId: "W123", doi: "10.1/x", title: "Risk intervention" });
  expect(page.nextCursor).toBe("cursor-2");
  expect(JSON.stringify(page.items[0])).not.toContain("raw");
});

it.each(["references", "cited-by"] as const)("maps one-hop %s expansion", async (direction) => {
  const page = await adapter.expand({ seedOpenAlexId: "W123", direction, cursor: undefined });
  expect(page.items.every(({ adapter }) => adapter === "openalex")).toBe(true);
});
```

- [ ] **Step 2: Verify adapter RED**

Run: `pnpm exec vitest run test/discovery/openAlex.test.ts test/discovery/crossref.test.ts test/discovery/arxiv.test.ts`

Expected: FAIL because adapter modules do not exist.

- [ ] **Step 3: Implement the injected HTTP boundary and OpenAlex adapter**

```ts
export interface DiscoveryHttpRequest { url: string; headers?: Record<string, string>; signal?: AbortSignal; }
export interface DiscoveryHttpResponse { status: number; headers: Record<string, string>; body: string; }
export type DiscoveryHttp = (request: DiscoveryHttpRequest) => Promise<DiscoveryHttpResponse>;

export interface DiscoveryPage { items: AdapterWork[]; nextCursor?: string; }
export interface OpenAlexAdapter {
  search(query: DiscoveryQuery, cursor?: string, signal?: AbortSignal): Promise<DiscoveryPage>;
  expand(input: { seedOpenAlexId: string; direction: CitationDirection; cursor?: string }, signal?: AbortSignal): Promise<DiscoveryPage>;
}
```

Use URL builders with `URL`/`URLSearchParams`; cap requested results regardless of settings; decode OpenAlex inverted-index abstracts into plain text; map only allowlisted fields. Send the optional configured contact through the documented polite identification mechanism. Translate non-2xx, malformed JSON, and rate limits into sanitized `DiscoveryAdapterError` values containing adapter, category, status, and retry-after seconds but no response body.

- [ ] **Step 4: Implement Crossref and arXiv enrichment adapters**

`CrossrefAdapter.lookupDoi(doi, signal)` returns one `AdapterWork | undefined`. `ArxivAdapter.lookup(arxivId, signal)` returns one `AdapterWork | undefined` and normalizes versioned IDs while retaining the public external ID. Parse the Atom feed with `DOMParser`; reject non-XML or missing entry identity safely.

- [ ] **Step 5: Run adapter GREEN and malformed/rate-limit coverage**

Run: `pnpm exec vitest run test/discovery/openAlex.test.ts test/discovery/crossref.test.ts test/discovery/arxiv.test.ts`

Expected: PASS with tests for pagination, `AbortSignal`, 429 retry metadata, malformed JSON/XML, missing works, and partial metadata.

- [ ] **Step 6: Commit Task 3**

```bash
git add obsidian-plugin/src/discovery/adapters obsidian-plugin/test/discovery obsidian-plugin/test/fixtures/discovery
git commit -m "feat: add public scholarly discovery adapters"
```

---

### Task 4: Request-sequenced discovery coordinator and derived cache

**Files:**
- Create: `obsidian-plugin/src/discovery/coordinator.ts`
- Test: `obsidian-plugin/test/discovery/coordinator.test.ts`

**Interfaces:**
- Consumes: adapters from Task 3; normalizer/ranker from Tasks 1-2; injected provider resolver; `ResearchRepository.importSource`.
- Produces: `DiscoveryCoordinator.stateFor`, `.search`, `.expand`, `.rerank`, `.importCandidates`, `.dismiss`, `.cancel`, `.clearCache`, `.subscribe`.

- [ ] **Step 1: Write coordinator state and zero-write RED tests**

```ts
it("does no network or vault work before explicit search", () => {
  const h = harness();
  expect(h.coordinator.stateFor(snapshot)).toEqual({ status: "idle", query: expect.any(Object) });
  expect(h.httpCalls).toBe(0);
  expect(h.importCalls).toBe(0);
});

it("searches explicitly, enriches partially, ranks, and performs zero writes", async () => {
  const h = harness({ crossrefFailure: true });
  const state = await h.coordinator.search(snapshot, { text: "risk", projectPath: snapshot.project.path });
  expect(state).toMatchObject({ status: "ready", partialAdapters: ["crossref"] });
  expect(state.results[0]?.factors).toBeDefined();
  expect(h.importCalls).toBe(0);
});
```

- [ ] **Step 2: Verify coordinator RED**

Run: `pnpm exec vitest run test/discovery/coordinator.test.ts`

Expected: FAIL because `coordinator.ts` does not exist.

- [ ] **Step 3: Implement coordinator states and explicit search pipeline**

```ts
export type DiscoveryState =
  | { status: "idle"; query: DiscoveryQuery }
  | { status: "searching"; query: DiscoveryQuery; requestId: number; previous?: DiscoveryReadyState }
  | DiscoveryReadyState
  | { status: "failed"; query: DiscoveryQuery; message: string; previous?: DiscoveryReadyState };

export interface DiscoveryReadyState {
  status: "ready" | "stale";
  query: DiscoveryQuery;
  results: RankedCandidate[];
  deterministicOrder: string[];
  modelOrder?: string[];
  partialAdapters: DiscoveryAdapterId[];
  nextCursor?: string;
  fingerprint: string;
}
```

Search OpenAlex first, group enrichments by DOI/arXiv ID, settle enrichment independently, normalize, deduplicate, rank, and store only derived state. Notify subscribers at request start, partial-provider identity changes, success, failure, cancellation, dismissal, and import status changes.

- [ ] **Step 4: Add race, staleness, expansion, rerank, and import RED tests**

Cover these exact assertions:

```ts
expect(lateFirst.status).toBe("stale");
expect(h.coordinator.stateFor(changedSnapshot).status).toBe("stale");
expect(expanded.results.some(({ candidate }) => candidate.relationship?.direction === "cited-by")).toBe(true);
expect(new Set(reranked.modelOrder)).toEqual(new Set(reranked.deterministicOrder));
expect(await h.coordinator.importCandidates(snapshot, ["doi:10.1/x", "doi:10.1/x"])).toEqual([
  { id: "doi:10.1/x", kind: "created", path: expect.any(String) },
  { id: "doi:10.1/x", kind: "duplicate", path: expect.any(String) },
]);
```

- [ ] **Step 5: Implement sequencing, cache identity, one-hop expansion, rerank, and import**

Use a monotonic request number plus desired-session key. Late calls can cache only under their own key and return stale when no longer desired. Expansion requires one explicit seed and one direction per adapter call; the panel may invoke both directions deliberately but the coordinator never recurses. `importCandidates` maps normalized metadata to `ImportSourceInput`, rechecks active project identity through repository import, and records per-item created/duplicate/failed outcomes.

- [ ] **Step 6: Run coordinator GREEN and regression tests**

Run: `pnpm exec vitest run test/discovery/coordinator.test.ts test/research/repository.test.ts test/research/intelligenceCoordinator.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add obsidian-plugin/src/discovery/coordinator.ts obsidian-plugin/test/discovery/coordinator.test.ts
git commit -m "feat: coordinate scholarly discovery sessions"
```

---

### Task 5: Persist imported discovery metadata and provenance

**Files:**
- Modify: `obsidian-plugin/src/research/types.ts`
- Modify: `obsidian-plugin/src/research/repository.ts`
- Modify: `obsidian-plugin/src/research/render.ts`
- Modify: `obsidian-plugin/src/research/parse.ts`
- Test: `obsidian-plugin/test/research/discoveryImport.test.ts`
- Test: `obsidian-plugin/test/research/render.test.ts`
- Test: `obsidian-plugin/test/research/parse.test.ts`

**Interfaces:**
- Consumes: normalized candidate import projection from Task 4.
- Produces: Source Record fields `abstract`, `openAccessUrl`, `discoveryProvenance`, persisted in snake-case frontmatter.

- [ ] **Step 1: Write failing round-trip and trust-boundary tests**

```ts
it("round-trips discovery metadata without creating evidence or reviewed state", async () => {
  const result = await repo.importSource(project.path, {
    title: "Paper", sourceKind: "doi", doi: "10.1/x", authors: ["Ada"], published: "2025",
    abstract: "Public abstract", openAccessUrl: "https://oa.test/paper.pdf",
    discoveryProvenance: [{ adapter: "openalex", externalId: "W1" }, { adapter: "crossref", externalId: "10.1/x" }],
  });
  expect(result.kind).toBe("created");
  const loaded = await repo.loadProject(project.path);
  expect(loaded.sources[0]).toMatchObject({ abstract: "Public abstract", openAccessUrl: "https://oa.test/paper.pdf" });
  expect(loaded.evidence).toEqual([]);
  expect(loaded.claims).toEqual([]);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run test/research/discoveryImport.test.ts test/research/render.test.ts test/research/parse.test.ts`

Expected: FAIL because discovery fields are not in `ResearchSourceRecord` or `ImportSourceInput`.

- [ ] **Step 3: Add the schema and round-trip implementation**

```ts
export interface DiscoverySourceProvenance { adapter: "openalex" | "crossref" | "arxiv"; externalId: string; }

// ResearchSourceRecord and ImportSourceInput additions
abstract?: string;
openAccessUrl?: string;
discoveryProvenance?: DiscoverySourceProvenance[];
```

Render `abstract`, `open_access_url`, and `discovery_provenance` as safe YAML values. Parse only arrays of objects containing an allowed adapter and non-empty `external_id`; report malformed entries as parse issues rather than accepting arbitrary objects. Repository import clips abstract to 20,000 characters, validates `http:`/`https:` access URLs, and copies provenance defensively.

- [ ] **Step 4: Run GREEN and identity regressions**

Run: `pnpm exec vitest run test/research/discoveryImport.test.ts test/research/render.test.ts test/research/parse.test.ts test/research/identity.test.ts test/research/evidenceLineage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add obsidian-plugin/src/research/types.ts obsidian-plugin/src/research/repository.ts obsidian-plugin/src/research/render.ts obsidian-plugin/src/research/parse.ts obsidian-plugin/test/research/discoveryImport.test.ts obsidian-plugin/test/research/render.test.ts obsidian-plugin/test/research/parse.test.ts
git commit -m "feat: preserve discovery source provenance"
```

---

### Task 6: Plugin settings, provider routing, and lifecycle wiring

**Files:**
- Modify: `obsidian-plugin/src/types.ts`
- Modify: `obsidian-plugin/src/settings.ts`
- Modify: `obsidian-plugin/src/main.ts`
- Test: `obsidian-plugin/test/settings-defaults.test.ts`
- Test: `obsidian-plugin/test/discovery/wiring.test.ts`

**Interfaces:**
- Consumes: `DiscoveryCoordinator` and adapter constructors.
- Produces: one plugin-owned coordinator and live settings dependencies for views.

- [ ] **Step 1: Write settings and shared-coordinator RED tests**

```ts
expect(DEFAULT_SETTINGS.discoveryEnabled).toBe(true);
expect(DEFAULT_SETTINGS.discoveryReranker).toBe("current");
expect(DEFAULT_SETTINGS.discoveryMaxResults).toBe(20);
expect(DEFAULT_SETTINGS.discoveryExpansionLimit).toBe(20);
expect(DEFAULT_SETTINGS.discoveryCacheHours).toBe(24);

const first = plugin.discoveryCoordinator();
expect(plugin.discoveryCoordinator()).toBe(first);
plugin.onunload();
expect(cancel).toHaveBeenCalledOnce();
expect(plugin.discoveryCoordinator()).not.toBe(first);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run test/settings-defaults.test.ts test/discovery/wiring.test.ts`

Expected: FAIL because discovery settings and plugin wiring do not exist.

- [ ] **Step 3: Add validated settings and UI controls**

Add:

```ts
discoveryEnabled: boolean;
openAlexContactEmail: string;
discoveryReranker: "current" | "claude" | "local" | "disabled";
discoveryMaxResults: number;
discoveryExpansionLimit: number;
discoveryCacheHours: number;
```

Settings descriptions must say requests are explicit, search results are derived, and imports remain unreviewed. Clamp result limits to `5..100`, expansion limits to `5..50`, and cache hours to `1..168`. Add a **Clear discovery cache** button that calls only the coordinator's derived-cache clearing method.

- [ ] **Step 4: Wire one coordinator, safe HTTP, provider policy, and unload cancellation**

Use Obsidian `requestUrl` only behind the injected `DiscoveryHttp` boundary if browser `fetch` cannot satisfy required CORS behavior; do not expose secrets or raw bodies. Provider resolution mirrors the tested Research Intelligence rules: strict modes never cross providers; Current follows chat backend; only eligible Current-plus-Auto fallback may disclose and use local fallback.

- [ ] **Step 5: Run GREEN and provider/lifecycle regressions**

Run: `pnpm exec vitest run test/settings-defaults.test.ts test/discovery/wiring.test.ts test/research/intelligenceWiring.test.ts test/providers.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add obsidian-plugin/src/types.ts obsidian-plugin/src/settings.ts obsidian-plugin/src/main.ts obsidian-plugin/test/settings-defaults.test.ts obsidian-plugin/test/discovery/wiring.test.ts
git commit -m "feat: configure scholarly discovery"
```

---

### Task 7: Native Discover panel and Research Workbench tab

**Files:**
- Create: `obsidian-plugin/src/view/DiscoveryPanel.ts`
- Modify: `obsidian-plugin/src/view/ResearchWorkbenchView.ts`
- Modify: `obsidian-plugin/styles.css`
- Test: `obsidian-plugin/test/discovery/panel.test.ts`
- Modify: `obsidian-plugin/test/research/workbenchView.test.ts`

**Interfaces:**
- Consumes: one shared `DiscoveryCoordinator`, active `ProjectSnapshot`, and `ResearchRepository` import results.
- Produces: eighth accessible workbench tab, explicit search/expand/rerank/import UI, and lifecycle-safe rendering.

- [ ] **Step 1: Write panel and tab RED tests**

```ts
it("renders eight accessible workbench tabs without issuing discovery", async () => {
  await view.setProjectPath(snapshot.project.path);
  expect(elements(view, '[role="tab"]')).toHaveLength(8);
  click(elements(view, '[role="tab"]')[7]);
  await Promise.resolve();
  expect(elements(view, "button").some(({ textContent }) => textContent === "Search")).toBe(true);
  expect(discovery.searchCalls).toBe(0);
});

it("shows transparent ranking and exact explicit actions", () => {
  panel.render(root, snapshot, readyState);
  expect(text(root)).toContain("Deterministic rank 1");
  expect(text(root)).toContain("Query relevance");
  expect(buttons(root)).toEqual(expect.arrayContaining(["Import", "Expand citations", "Rerank with model", "Open source"]));
});
```

- [ ] **Step 2: Verify UI RED**

Run: `pnpm exec vitest run test/discovery/panel.test.ts test/research/workbenchView.test.ts`

Expected: FAIL because `DiscoveryPanel` and the Discover tab do not exist.

- [ ] **Step 3: Implement search setup, inbox, detail, and state rendering**

The panel owns only ephemeral input, selection, expanded detail IDs, and dismissal presentation. Render all coordinator states: disabled, idle, searching, ready, stale, partial enrichment, rate limited, failed-with-previous, reranking, importing, created, duplicate, and per-item failed. Use buttons for vault paths and external links; never inject remote HTML.

- [ ] **Step 4: Implement explicit event boundaries**

Search calls `.search` only from the Search button. Expansion presents separate **References** and **Cited by** choices and calls one direction per click. Rerank calls `.rerank` only from its button. Import and batch import require explicit selected IDs and render per-item outcomes. Disable duplicate in-flight actions without hiding prior results.

- [ ] **Step 5: Integrate lifecycle cancellation and accessible keyboard behavior**

Add `"Discover"` to the tab union and final tab position. Project replacement, panel disposal, and view close cancel and invalidate late discovery callbacks in the same order as Research Intelligence. Preserve arrow/Home/End navigation, `aria-selected`, `tabindex`, status roles, non-color-only stale/partial copy, and responsive card layout.

- [ ] **Step 6: Run UI GREEN and lifecycle regressions**

Run: `pnpm exec vitest run test/discovery/panel.test.ts test/research/workbenchView.test.ts test/research/intelligencePanel.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

```bash
git add obsidian-plugin/src/view/DiscoveryPanel.ts obsidian-plugin/src/view/ResearchWorkbenchView.ts obsidian-plugin/styles.css obsidian-plugin/test/discovery/panel.test.ts obsidian-plugin/test/research/workbenchView.test.ts
git commit -m "feat: add scholarly discovery workbench tab"
```

---

### Task 8: End-to-end contract, docs, bundle, and isolated proof

**Files:**
- Create: `obsidian-plugin/test/discovery/flow.test.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `claude-plugin/skills/research-workbench/SKILL.md`
- Modify: `obsidian-plugin/main.js` through the production build only
- Create: `.superpowers/sdd/scholarly-discovery-report.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: reproducible end-to-end proof, user documentation, slash-skill parity, and distributable bundle.

- [ ] **Step 1: Write the end-to-end contract test**

```ts
it("discovers, expands, reranks, and imports without crossing the trust boundary", async () => {
  const before = io.writeCount;
  const searched = await coordinator.search(snapshot, deriveDiscoveryQuery(snapshot));
  const expanded = await coordinator.expand(snapshot, searched.results[0]!.candidate.id, "references");
  const reranked = await coordinator.rerank(snapshot);
  expect(io.writeCount).toBe(before);
  expect(new Set(reranked.modelOrder)).toEqual(new Set(reranked.deterministicOrder));
  expect(expanded.results.some(({ candidate }) => candidate.relationship?.direction === "references")).toBe(true);

  const imported = await coordinator.importCandidates(snapshot, [searched.results[0]!.candidate.id]);
  expect(imported[0]?.kind).toBe("created");
  expect(io.writeCount).toBe(before + 1);
  const loaded = await repository.loadProject(snapshot.project.path);
  expect(loaded.sources.at(-1)).toMatchObject({ type: "research-source", doi: expect.any(String) });
  expect(loaded.evidence).toEqual(snapshot.evidence);
});
```

- [ ] **Step 2: Run the contract test and fix only integration seams**

Run: `pnpm exec vitest run test/discovery/flow.test.ts`

Expected: PASS after wiring imports, provider identity, and state transitions; do not weaken exact-set, zero-write, or one-hop assertions.

- [ ] **Step 3: Update public docs and the matching plugin skill**

README must document: Discover tab, explicit network actions, OpenAlex/Crossref/arXiv roles, transparent deterministic scores, optional exact-set reranking, one-hop expansion, derived review inbox, and unreviewed import. CHANGELOG adds an Unreleased **Added** entry. The existing `research-workbench` skill gains the same Discover workflow and exact trust language so slash-menu users do not see a duplicate skill.

- [ ] **Step 4: Run all automated quality gates**

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
git diff --check
```

Expected: all commands exit 0; production build regenerates `obsidian-plugin/main.js`.

- [ ] **Step 5: Perform isolated live public-source proof**

Install the production `main.js`, `manifest.json`, and `styles.css` into an isolated Obsidian app/profile and disposable vault. Use a project with a precise scientific question and one reviewed claim. Capture screenshots and direct vault-state evidence for:

1. all eight Research Workbench tabs;
2. a real explicit OpenAlex search;
3. visible deterministic score factors;
4. candidate metadata provenance with Crossref or arXiv verification;
5. explicit references and cited-by expansion, one direction per request;
6. optional rerank with identical candidate IDs before and after;
7. zero vault writes before import;
8. successful import and duplicate result on repeated import;
9. the imported metadata-first Source Record and unchanged evidence/claims.

If a public API or model is unavailable, preserve the exact failure evidence, prove deterministic/fixture behavior separately, and do not claim the unavailable live path passed.

- [ ] **Step 6: Record the verification report**

Write `.superpowers/sdd/scholarly-discovery-report.md` containing exact commands, pass counts, app/profile/vault paths, adapter/provider identities, screenshot paths, before/after vault hashes or file lists, public-service limitations, and confirmation that no version or submodule files changed.

- [ ] **Step 7: Request final code review and address findings**

Use `superpowers:requesting-code-review` across the full range from this plan commit to `HEAD`. Fix Critical and Important findings with focused RED/GREEN coverage, rerun all gates, and regenerate `main.js` after source changes.

- [ ] **Step 8: Commit Task 8**

```bash
git add README.md CHANGELOG.md claude-plugin/skills/research-workbench/SKILL.md obsidian-plugin/test/discovery/flow.test.ts obsidian-plugin/main.js .superpowers/sdd/scholarly-discovery-report.md
git commit -m "docs: complete scholarly discovery workflow"
```

## Final Verification Checklist

- [ ] Search, expansion, and rerank make zero vault writes.
- [ ] Import creates only duplicate-safe Source Records; evidence and claims remain unchanged.
- [ ] No external request occurs before explicit user action.
- [ ] OpenAlex spine and Crossref/arXiv partial-failure behavior are proven.
- [ ] Deterministic factors remain visible after optional rerank.
- [ ] Rerank preserves every candidate exactly once.
- [ ] Expansion is one hop with seed and direction provenance.
- [ ] Project changes create stale state without background network work.
- [ ] Desktop/mobile-safe rendering and lifecycle cancellation pass.
- [ ] Typecheck, lint, full tests, build, and `git diff --check` pass.
- [ ] Isolated Obsidian proof and direct vault-state evidence are recorded.
- [ ] `manifest.json`, `versions.json`, and `package.json` versions are unchanged.
- [ ] `upstream/html-effectiveness` remains untouched.
