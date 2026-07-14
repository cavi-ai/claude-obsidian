# Scholarly Discovery and Citation Expansion Design

**Date:** 2026-07-14

**Status:** Approved design

**Roadmap:** Research Workbench Phase 2, follow-on slice 1

## Goal

Add a project-scoped discovery workflow that turns a Research Project's question and reviewed claims into a transparent scholarly review inbox. Researchers can inspect why a paper appeared, verify metadata provenance, expand one citation hop, and explicitly import selected papers as unreviewed Source Records.

The first slice uses OpenAlex as the discovery and citation-graph spine. Crossref verifies and enriches DOI metadata, and arXiv verifies and enriches preprint identity and version metadata.

## Product Principles

1. Discovery is explicit. Opening a project, selecting Discover, editing a query, or refreshing the workbench does not contact an external service.
2. Search results are candidates, not evidence. They remain derived until the user explicitly imports them.
3. Import does not grant trust. Imported candidates become unreviewed Source Records and do not create Evidence Cards, reviewed claims, or trusted support.
4. Ranking is inspectable. Deterministic factors remain visible before and after optional model reranking.
5. Provenance survives normalization. Conflicting adapter values are disclosed rather than silently overwritten.
6. Citation expansion is bounded. Each explicit action retrieves one hop of references and cited-by papers.
7. Vault files remain canonical. Search sessions and candidate caches are derived and safely deletable.

## Scope

### Included

- A new Discover tab in the project-scoped Research Workbench.
- A default query derived from the active project's research question and reviewed claims.
- User editing of the derived query without changing project records.
- OpenAlex scholarly search, references, and cited-by expansion.
- Crossref DOI verification and metadata enrichment.
- arXiv identifier, metadata, and version enrichment.
- Adapter-neutral candidate normalization with per-field provenance and visible disagreements.
- Conservative identity resolution using DOI, arXiv ID, and existing bibliographic fingerprint rules.
- Transparent deterministic ranking.
- Optional, explicit model reranking that preserves the candidate set.
- A derived review inbox with selection, dismissal, details, pagination, and stale-session status.
- Explicit single and batch import into unreviewed Source Records.
- Metadata, abstract, identifiers, provenance, and open-access or full-text links when available.
- Explicit one-hop expansion from an imported source or an unimported candidate.
- Configurable limits, model policy, cache lifetime, and cache clearing.

### Excluded

- Automatic search, monitoring, or background refresh.
- Recursive citation crawling or configurable multi-hop crawls.
- Automatic candidate import.
- Automatic PDF or full-text download and extraction.
- Treating abstracts or remote metadata as reviewed evidence.
- Model-generated candidates or model filtering of candidates.
- Silent conflict resolution across scholarly adapters.
- Zotero round-trip, literature monitoring, publication drafting, or export.
- Changes to MCP loopback security or write gating.

## User Workflow

### 1. Open Discover

The researcher opens `/research`, selects a project, and chooses the new **Discover** tab. The tab displays a draft query derived from the project question and reviewed claims. The query is editable in the discovery session only.

No external request occurs until the researcher selects **Search**.

### 2. Review results

Search produces a review inbox of normalized candidates. Each card shows:

- title, authors, year, and venue;
- abstract preview when available;
- DOI and arXiv identifiers when available;
- open-access or full-text links when available;
- whether the paper already exists in the project;
- citation relationship and seed when discovered through expansion;
- deterministic rank and factor breakdown;
- metadata verification state and adapter disagreements.

The researcher can open candidate details, select candidates, dismiss candidates for the current session, open external source links, expand citations, or import.

### 3. Inspect provenance

Candidate detail shows the normalized display value and every adapter value used for title, authors, date, venue, abstract, identifiers, and access links. Disagreement is a first-class state. The display value follows deterministic precedence rules, but the UI never presents a conflict as unanimous metadata.

### 4. Expand one citation hop

An explicit **Expand citations** action on an imported source or candidate retrieves both references and cited-by papers when supported by the graph spine. Expansion adds normalized candidates to the same inbox and labels each with:

- the seed candidate or Source Record;
- relationship direction: `references` or `cited-by`;
- expansion request identity;
- graph-adapter provenance.

Expansion never recurses. The researcher may deliberately expand another visible node in a later action.

### 5. Optionally rerank

**Rerank with model** sends a bounded projection of the current candidate set plus the project question and reviewed claim text to the configured provider. The model may only return a permutation of known candidate IDs with short rationales.

Reranking:

- never adds or removes candidates;
- preserves the deterministic rank and score breakdown;
- visibly distinguishes model order from deterministic order;
- runs only after explicit user action;
- is rejected wholly if candidate IDs are missing, duplicated, or unknown.

### 6. Import deliberately

**Import** and **Import selected** create metadata-first Source Records through the existing research repository. Each imported record is unreviewed and includes stable identifiers, bibliographic metadata, abstract, access links, and discovery provenance supported by the Source Record schema.

Import rechecks project identity immediately before writing. Existing sources are not duplicated. Search, expansion, dismissal, selection, details, and reranking never write to the vault.

## Architecture

### Discovery coordinator

`discovery/coordinator.ts` owns the session lifecycle:

- explicit search and expansion requests;
- cancellation and request sequencing;
- adapter orchestration;
- enrichment and partial-failure handling;
- pagination;
- derived caching;
- stale-session detection;
- duplicate-safe import delegation.

The coordinator receives dependencies for HTTP, time, providers, configuration, and repository operations. It does not import Obsidian in its pure logic.

### Adapter boundaries

`discovery/adapters/` contains three isolated clients:

- **OpenAlex adapter:** keyword discovery, work lookup, references, cited-by results, and graph identifiers.
- **Crossref adapter:** DOI lookup and bibliographic metadata verification or enrichment.
- **arXiv adapter:** arXiv lookup, preprint metadata, and version-aware identity enrichment.

Each adapter maps remote payloads into a typed adapter result. Raw provider payloads do not reach views, model prompts, or vault writes.

OpenAlex is required for a new search or graph expansion. Crossref and arXiv are enrichment adapters: their failure degrades verification but does not discard valid OpenAlex candidates.

### Candidate model

`discovery/types.ts` defines an adapter-neutral `DiscoveryCandidate` with:

- stable candidate ID;
- normalized bibliographic fields;
- DOI, arXiv ID, OpenAlex ID, and canonical URLs;
- abstract and access-link metadata;
- per-field provenance;
- disagreement records;
- deterministic score and factor contributions;
- existing-source and duplicate state;
- citation relationship and seed provenance;
- verification and enrichment status.

Candidate IDs are derived from normalized DOI first, normalized arXiv ID second, OpenAlex ID third, and a conservative bibliographic fingerprint last.

### Normalization and identity

`discovery/normalize.ts` merges typed adapter results field by field. Precedence is explicit and testable. A selected display value never destroys alternate values or their provenance.

`discovery/identity.ts` reuses the existing DOI and arXiv normalization and Source Record duplicate rules. Bibliographic fallback matching remains conservative: explicit stable-identifier conflicts prevent a merge even when title, authors, or fingerprints resemble one another.

Candidate-to-source resolution runs during normalization and again immediately before import.

### Deterministic ranking

`discovery/rank.ts` calculates and exposes independent factors:

- lexical query relevance;
- overlap with project question and reviewed claims;
- direct citation relationship to the expansion seed;
- recency;
- open-access or full-text availability;
- metadata completeness.

Weights and tie-breaking are deterministic and versioned. Candidate detail explains every factor. Citation counts may be displayed as metadata but are not treated as a proxy for scientific validity.

### Model reranking

`discovery/rerank.ts` constructs a bounded provider request from candidate IDs and safe metadata only. It excludes captured source content, unrelated vault notes, and raw adapter payloads.

The parser accepts exactly one occurrence of every candidate ID from the current set. Any missing, duplicate, or unknown ID rejects the entire response. A rejected or failed rerank leaves deterministic results unchanged.

Provider policy mirrors Research Intelligence:

- Current backend;
- Claude only;
- Local only;
- Disabled.

Explicit provider modes do not silently cross providers. Any permitted Current-plus-Auto fallback must disclose the actual provider and model.

### Derived session cache

Search and expansion sessions are derived data. A cache key includes:

- active project fingerprint;
- effective query and filters;
- adapter schema version;
- deterministic ranking version;
- result limits;
- pagination cursor or expansion seed and direction.

Model rerank cache identity additionally includes provider, model, prompt schema, and the ordered candidate-set fingerprint.

Project changes mark previous results stale. They do not trigger an external request. Clearing the cache cannot remove or corrupt vault records.

### UI

`DiscoveryPanel.ts` is embedded as a new Research Workbench tab. It renders:

- search setup;
- results inbox;
- selection and batch actions;
- candidate detail;
- citation expansion state;
- deterministic and model rank disclosure;
- import, duplicate, stale, partial-verification, rate-limit, and failure states.

The panel delegates networking, ranking, identity, and repository writes to injected boundaries. Closing the view, replacing the project, or starting a superseding request cancels active work and prevents late rendering.

## Data Flow

```text
project snapshot
  -> derived editable query
  -> explicit Search
  -> OpenAlex discovery
  -> Crossref and arXiv enrichment
  -> normalization and provenance retention
  -> conservative identity and project duplicate detection
  -> deterministic ranking
  -> review inbox
  -> optional explicit validated model rerank
  -> explicit duplicate-safe Source Record import
```

Expansion follows the same pipeline but begins with an explicit seed and one graph direction. The session stores the seed relationship without importing it.

## Failure Handling

### Required-spine failure

If OpenAlex fails before usable results exist, the search or expansion fails with a concise, actionable state. Prior valid results remain visible. A retry is explicit.

### Enrichment failure

Crossref or arXiv failure produces partial candidates with an **Unverified metadata** state. The failure does not erase valid OpenAlex results or invent verification.

### Rate limiting and network loss

The coordinator honors server retry guidance when available, exposes a retry action, and retains current results. It does not automatically loop, import, or switch to an undeclared service.

### Malformed or conflicting data

Malformed adapter records are discarded individually and counted in a safe summary. Field conflicts remain attached to usable candidates. Errors never include raw response bodies, credentials, or arbitrary remote HTML.

### Stale and concurrent requests

Every request has a monotonic sequence and session identity. Late results may populate only their own derived key and cannot replace the current project or query state. Project replacement and view close invalidate pending UI commits.

### Import failure

Batch import reports per-candidate outcomes. A duplicate is a safe skipped result, not a failed write. Other failures do not roll back successful independent imports, and the UI retains enough state for explicit retry.

## Privacy and Security

- External requests contain only the explicit discovery query, public identifiers, filters, and pagination state required by the selected adapter.
- Model reranking contains bounded public candidate metadata plus the project question and reviewed claim text.
- Captured source content, unrelated notes, attachments, credentials, and raw adapter payloads are excluded.
- External network requests never occur merely because a view rendered or project state changed.
- Existing MCP loopback binding, bearer-token requirement, and write gating remain unchanged.
- External links are rendered as explicit user actions.

## Configuration

The settings surface includes:

- discovery enabled or disabled;
- optional OpenAlex polite-pool contact email;
- reranking provider policy: Current, Claude, Local, or Disabled;
- maximum initial search results;
- maximum results per expansion direction;
- derived cache lifetime;
- clear discovery cache action.

Defaults favor bounded requests, no background work, and no automatic model use. Result limits are validated and capped in code regardless of stored settings.

## Testing Strategy

### Pure tests

- query derivation from project question and reviewed claims;
- normalization precedence and per-field provenance;
- disagreement retention;
- DOI and arXiv identity;
- conservative bibliographic fallback matching;
- stable-identifier conflict rejection;
- deterministic score factors, weights, and tie-breaking;
- candidate-to-project duplicate detection;
- rerank permutation validation;
- session and cache-key sensitivity;
- stale and concurrent request sequencing.

### Adapter tests

Recorded minimal fixtures and injected HTTP prove:

- OpenAlex search mapping;
- references and cited-by mapping;
- Crossref DOI verification and enrichment;
- arXiv identifier and version enrichment;
- pagination and bounded result limits;
- cancellation and superseding requests;
- rate limits, malformed responses, and partial outages.

Fixtures contain only the minimum public fields needed to test mapping and remain independent of live API availability.

### Integration tests

- The default query uses the project question and reviewed claims, excluding unreviewed or unrelated content.
- No request occurs until explicit Search or Expand.
- Search, expansion, selection, dismissal, details, and reranking perform zero vault writes.
- Import creates only unreviewed Source Records.
- Single and batch import remain duplicate-safe.
- Model reranking preserves the exact candidate set and deterministic rank.
- Project changes mark sessions stale without issuing a new request.
- Expansion is exactly one hop and retains seed and direction provenance.
- Closing or replacing the view prevents late rendering.
- Existing Research Intelligence behavior and provider boundaries remain unchanged.

### Live Obsidian proof

Use an isolated Obsidian app/profile and disposable vault to demonstrate:

1. a real public-source search from an active project;
2. visible deterministic score explanations;
3. candidate-detail metadata provenance and any disagreement state;
4. explicit one-hop references and cited-by expansion;
5. optional rerank preserving the candidate set;
6. successful explicit import;
7. duplicate prevention on repeated import;
8. the resulting unreviewed Source Record;
9. before-and-after proof that search, expansion, and reranking make zero vault writes.

Automated adapter fixtures are the reproducible correctness gate. Live public APIs are supplementary integration proof and are reported honestly if availability or rate limits prevent a complete run.

## Acceptance Criteria

1. The Research Workbench has a project-scoped Discover tab.
2. A default editable query derives from the project question and reviewed claims.
3. No external request occurs before explicit Search or Expand.
4. OpenAlex supplies discovery and one-hop graph expansion; Crossref and arXiv independently enrich and verify metadata.
5. Every candidate exposes stable identity, provenance, disagreement state, duplicate status, and deterministic score factors.
6. Search candidates remain derived until explicit import.
7. Optional model reranking preserves every candidate exactly once and never hides deterministic order or scores.
8. Expansion is one hop per explicit action and labels seed plus direction.
9. Import creates duplicate-safe, metadata-first, unreviewed Source Records and no trusted evidence.
10. Search, expansion, and reranking perform zero vault writes.
11. Project changes mark results stale and never trigger background network work.
12. Partial adapter failures preserve usable results without inventing verification.
13. Pure tests, adapter fixtures, integration tests, standard plugin gates, and isolated Obsidian proof pass.

## Follow-On Work

Separate designs may add:

- full-text retrieval and explicit PDF import;
- stronger identity, deduplication, and version resolution;
- saved searches, monitoring, and field-change updates;
- richer Zotero round-trip;
- source-diversity and recency audits using enriched metadata;
- additional domain adapters such as Europe PMC.

Each follow-on capability must feed normalized vault records into the existing project graph without weakening the reviewed-evidence trust boundary.
