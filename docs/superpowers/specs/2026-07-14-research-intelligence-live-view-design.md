# Research Intelligence Live View Design

**Date:** 2026-07-14

**Status:** Approved design

**Target:** Companion for Claude (`obsidian-plugin/`)

## Summary

Phase 2 begins with a project-level Intelligence view that helps a researcher see contradictions, methodological differences, research gaps, and evidence-quality weaknesses already present in a Research Project.

The view is derived, read-only, and rebuildable. Deterministic analysis supplies inspectable findings from the canonical vault records. An optional model turns only those supplied findings and excerpts into a concise narrative that explains patterns and priorities. The model may clarify and organize the evidence graph; it may not invent sources, relationships, or conclusions.

This slice deepens reasoning over the Phase 1 evidence backbone before adding external scholarly discovery, citation-network expansion, monitoring, or publication workflows.

## Goals

- Restore the project's most important tensions, gaps, and quality risks at a glance.
- Distinguish direct graph observations from inferences and suggested investigations.
- Make every finding traceable to exact vault records.
- Work with the user's existing Claude, local, or Auto chat backend configuration.
- Remain useful when model analysis is disabled or unavailable.
- Avoid vault mutations and preserve Markdown research records as the canonical source of truth.

## Non-Goals

This slice does not include:

- external scholarly discovery or citation-network expansion;
- literature monitoring or field-change alerts;
- richer Zotero round-trip or external research-report bridges;
- saved intelligence notes or new canonical intelligence entities;
- autonomous edits to sources, evidence, claims, questions, or documents;
- drafting, rewriting, or publication workflows;
- broad semantic claims based on full source text that is not represented in the project snapshot.

These remain valid Phase 2 or Phase 3 directions, but they must not be coupled to the first Intelligence implementation.

## Product Experience

The Research Workbench gains an **Intelligence** tab for the active project. It has two coordinated surfaces.

### Deterministic findings

The primary surface groups findings into:

- contradictions;
- methodological differences;
- research gaps;
- evidence quality.

The tab shows category counts and ordered finding cards. Each card includes:

- a plain-language title and rationale;
- severity and confidence;
- whether the content is a direct observation, an inference, or a suggested investigation;
- exact affected record paths;
- a suggested verification or repair step.

Record paths are interactive and open the corresponding vault note. Findings update automatically when the current `ProjectSnapshot` changes. Stable finding identifiers and stable ordering prevent the interface from jumping unnecessarily between refreshes.

### Model narrative

A separate narrative panel explains the deterministic findings as a prioritized research briefing. Analysis runs only when the user selects **Analyze**. It never runs automatically in response to vault changes.

The panel has explicit states:

- **Not analyzed:** deterministic findings are available; no narrative has been requested.
- **Analyzing:** the current request is in progress and controls prevent accidental duplicate requests.
- **Current:** the narrative matches the current project snapshot and provider configuration.
- **Stale:** an older narrative remains readable after the snapshot or provider configuration changes, with a clear prompt to analyze again.
- **Disabled:** model analysis is disabled in settings; deterministic findings remain fully available.
- **Failed:** the request or response validation failed; the last valid narrative, if any, remains visible and the deterministic findings remain available.

The UI must never imply that a model narrative is current when its cache key no longer matches the active snapshot and provider configuration.

## Architecture

### 1. Deterministic intelligence engine

A new pure module, `src/research/intelligence.ts`, consumes a `ProjectSnapshot` and produces typed `IntelligenceFinding` values without importing Obsidian or calling a model.

Each finding has:

- a stable identifier derived from its rule and normalized affected paths;
- a category: `contradiction`, `method-difference`, `research-gap`, or `evidence-quality`;
- a severity and confidence;
- an epistemic label: `observation`, `inference`, or `suggested-investigation`;
- a concise title and rationale;
- exact project record paths;
- a suggested verification or repair action.

The engine owns rule evaluation, normalization, deduplication, and stable ordering. It does not render UI or provider prompts. Existing helpers from `graph.ts` and findings from `audit.ts` should be reused where they express the same trust rules rather than reimplemented inconsistently.

### 2. Provider-agnostic narrative layer

A new pure request/response module, `src/research/intelligenceNarrative.ts`, owns:

- the bounded prompt payload built from deterministic findings and the minimum supporting record fields or captured excerpts needed to explain them;
- the strict structured response schema;
- parsing and validation;
- rejection of references outside the allowed project-path set;
- normalization into a renderable narrative result.

Provider execution is injected at the Obsidian integration boundary. The narrative module does not know about Anthropic, Ollama, settings UI, or the workbench view.

The model may group, explain, and prioritize deterministic findings. It may identify an inference only when it cites the supplied records and labels the statement as an inference or suggested investigation. It may not add a source, evidence relationship, methodological fact, or factual conclusion that is absent from the supplied payload.

### 3. Provider routing

One new setting controls the Intelligence narrator:

- **Current backend** (default): use the configured chat backend.
- **Claude only:** start with Claude.
- **Local only:** use the configured local model.
- **Disabled:** do not offer model analysis.

“Current backend” preserves the existing chat semantics:

- chat `local` uses the selected local model;
- chat `claude` uses Claude;
- chat `auto` starts with Claude and uses the existing eligible fallback behavior when Claude is unavailable and a local model is available.

The implementation should reuse the existing provider router, model selection, error hints, and fallback policy. It must not create a second credential system or a competing definition of Auto behavior.

### 4. Workbench integration

The existing Research Workbench owns the selected project and loads its `ProjectSnapshot`. The Intelligence tab derives deterministic findings from that snapshot and passes the selected findings to the narrative coordinator when the user requests analysis.

The view consumes typed view state. It should not contain graph rules, response parsing, provider-selection policy, or cache-key construction.

## Deterministic Analysis Rules

The first implementation is deliberately conservative. A finding reports what the structured project can support, not what a general model might infer from outside knowledge.

### Contradiction candidates

A contradiction candidate requires a single Claim with both:

- at least one trusted supporting Evidence Card; and
- at least one reviewed, locatable, non-stale challenging Evidence Card linked to that Claim.

The finding says that the project contains conflicting evidence around a proposition. It does not conclude that one source disproves another or that the Claim is false.

### Methodological differences

A methodological-difference candidate compares the supporting and challenging source/evidence sets attached to the same Claim. Deterministic comparisons may use only structured fields already captured by the project, such as:

- source kind;
- publication metadata;
- locator kind;
- evidence interpretation;
- review and staleness state.

The deterministic layer reports the differing fields and paths. The model may explain the supplied differences or captured interpretations, but it may not assert an uncaptured study design, population, measurement, or limitation.

### Research gaps

Gap findings include:

- open project questions;
- unsupported or weakly supported Claims;
- Claims with no challenging evidence;
- unused reviewed Evidence Cards;
- narrow source diversity or recency where the available metadata makes that rule computable;
- unresolved invalid-record, broken-reference, locator, staleness, or review findings.

Each rule states the observable condition. For example, “no challenging evidence is linked” is valid; “the literature has no counterargument” is not.

### Evidence quality

Quality findings reuse the Phase 1 trust model and available structured metadata:

- review state;
- locator completeness;
- source resolution;
- source/evidence fingerprint agreement;
- broken relationships;
- source diversity;
- publication recency where dates exist;
- existing audit severity.

Citation presence and review state must not be presented as proof of scientific validity.

## Narrative Contract and Validation

The model response uses a strict structured schema. It contains a short briefing, prioritized insight groups, and optional suggested investigations. Every insight must:

- use only allowed project paths supplied with the request;
- cite at least one relevant path;
- identify itself as an observation, inference, or suggested investigation;
- remain grounded in the supplied finding rationale and bounded record context.

Validation occurs before rendering:

- insights with unknown or out-of-project paths are discarded;
- unsupported insight categories or epistemic labels are rejected;
- empty groups are removed;
- a wholly malformed or unusable response produces a visible validation error instead of displaying free-form text.

A validation failure never removes or blocks deterministic findings. The product should say that the narrative could not be verified, not that project intelligence is unavailable.

## Refresh, Fingerprints, and Cache

Deterministic findings recompute whenever the loaded `ProjectSnapshot` changes.

Narratives are cached as plugin-owned derived data, never as canonical vault records. The cache key includes:

- project path;
- a stable fingerprint of the normalized `ProjectSnapshot` inputs used by intelligence rules;
- narrator setting and resolved provider/model configuration;
- narrative schema version.

The snapshot fingerprint must be deterministic across equivalent record ordering. It must change when any field used by the deterministic findings or narrative context changes.

When the active cache key changes:

- the previous valid narrative may remain visible;
- it is immediately marked stale;
- the user must explicitly select **Analyze** to replace it.

Only a validated response is stored as the current cache entry. Failed or invalid responses do not overwrite the last valid narrative. Cache deletion must be safe because the content is rebuildable.

## Error Handling

- **No project:** show an empty state directing the user to select or create a Research Project.
- **No findings:** show that no deterministic issues were found from the current structured records, without claiming the research is complete or correct.
- **Provider unavailable:** show the existing actionable provider hint and preserve deterministic findings.
- **Auto fallback:** disclose which provider produced the final narrative.
- **Local model unavailable:** explain how to configure or start the local provider; do not silently switch when Local only is selected.
- **Malformed response:** show a verification error and retain the prior valid narrative as stale if one exists.
- **Record changed during analysis:** accept the response only for the request's original cache key; render it as stale if the active snapshot has already moved on.
- **View closed or project changed:** cancel or safely ignore late UI updates. Provider work must not write to the vault.

## Data Ownership and Privacy

- Vault Markdown and attachments remain canonical.
- Deterministic intelligence and model narratives are derived plugin data.
- Running deterministic analysis performs no network request.
- Model analysis sends only the bounded project fields and captured excerpts assembled for the request.
- The UI identifies the resolved provider before or during analysis so users can understand whether content is staying local or being sent to Claude.
- This slice performs no vault writes and exposes no new MCP write path.

## Verification Strategy

### Pure-module tests

Test `intelligence.ts` with fixtures covering:

- every deterministic rule and its negative boundary;
- trusted versus proposed, rejected, stale, missing-locator, and broken evidence;
- contradiction candidates that require both trusted support and qualifying challenge;
- method-difference comparisons restricted to captured fields;
- stable identifiers, deduplication, and ordering;
- conservative wording and epistemic labels;
- empty and malformed project data.

Test fingerprinting and narrative parsing for:

- equivalent snapshots producing the same fingerprint;
- relevant changes invalidating the fingerprint;
- schema-version and provider/model changes invalidating cache keys;
- valid structured responses;
- unknown-path removal;
- malformed output and wholly invalid responses.

### Routing and coordinator tests

With injected fake providers, verify:

- Current backend routes through Claude, Local, and Auto according to existing chat settings;
- Claude only and Local only honor their explicit selections;
- Disabled performs no provider call;
- Auto uses the existing eligible local fallback behavior and records the resolved provider;
- Local only does not silently fall back to Claude;
- stale responses cannot become current after a project change;
- failed analysis preserves the last valid narrative;
- no analysis path writes to the vault.

### UI tests

Verify category counts, stable cards, record links, epistemic labels, and all narrative states: not analyzed, analyzing, current, stale, disabled, and failed. Verify that deterministic findings refresh automatically while the narrative changes only after explicit analysis.

### Real Obsidian proof

Use an isolated Obsidian app/profile and representative research vault to prove:

- deterministic findings render and open their linked records;
- a local-only analysis runs with the configured local model and displays its provider identity;
- a project edit refreshes findings and marks the prior narrative stale;
- the view remains useful with model analysis disabled or failed;
- no intelligence note or other vault mutation is created.

If Claude credentials can be used without exposing secrets, also prove Claude or Auto routing. Otherwise, cover those paths with provider-injected tests and record that limitation rather than weakening credential safety.

## Acceptance Criteria

The slice is complete when:

1. An active Research Project has a native Intelligence tab with deterministic, traceable findings in all four categories.
2. Findings automatically reflect project changes and remain useful without a model.
3. The user can explicitly request a validated narrative using Current backend, Claude only, or Local only; Disabled makes no model call.
4. Every rendered narrative insight cites only records from the active project's allowed path set and declares its epistemic status.
5. Provider, parsing, or validation failures cannot hide deterministic findings or overwrite the last valid narrative.
6. Snapshot or provider changes mark old narratives stale rather than silently re-running analysis.
7. The feature performs no vault writes and its derived cache can be deleted safely.
8. Pure tests, routing tests, UI tests, the existing plugin quality gates, and isolated Obsidian proof pass.

## Follow-On Phase 2 Slices

After this live intelligence foundation is stable, separate designs can add:

1. open scholarly discovery and citation-network expansion;
2. stronger identity, deduplication, and version resolution;
3. monitoring and field-change updates;
4. Zotero round-trip and external research-report bridges;
5. broader diversity, recency, and evidence-quality audits supported by richer metadata.

Each follow-on capability should feed normalized vault records into the same project graph so the Intelligence view becomes richer without changing its trust boundary.
