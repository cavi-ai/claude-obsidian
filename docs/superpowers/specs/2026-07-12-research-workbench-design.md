# Research Workbench Design

**Date:** 2026-07-12

**Status:** Approved design

**Target:** Companion for Claude (`obsidian-plugin/`) with supporting Claude Code workflows (`claude-plugin/`)

## Summary

Companion for Claude will evolve from a broad vault-aware assistant into a research workbench for solo knowledge workers producing evidence-heavy white papers, scientific documents, and deep-research reports.

The product promise is:

> Turn accumulated knowledge into finished, trustworthy work without losing the chain from source to evidence to claim to published document.

The vault remains the canonical source of truth. External discovery and reference services are optional, replaceable adapters. Companion owns durable research state, provenance, synthesis, composition continuity, and release assurance.

## Problem

The target user captures substantial research but loses continuity across discovery, reading, synthesis, drafting, revision, and publication. Material becomes difficult to rediscover, source provenance is weakened by copy-and-paste workflows, and the rationale behind claims and revisions disappears.

Existing products solve adjacent slices:

- Obsidian Copilot offers vault question answering with note citations and project-oriented AI interactions.
- Smart Connections provides local semantic retrieval, related-note discovery, and grounded chat.
- NotebookLM provides source-grounded answers, citations, source discovery, and deep-research reports.
- Elicit and SciSpace specialize in scholarly search, screening, extraction, literature reviews, and report drafting.
- ResearchRabbit specializes in citation-network exploration and iterative paper discovery.
- Zotero provides mature bibliographic management, annotations, citations, and bibliography generation.

The gap is the durable chain between these activities. Most tools center a chat, notebook, search result, paper collection, or document. Companion will center an inspectable research project whose reasoning survives every stage.

## Strategic Direction

Three directions were considered:

1. **Research Workbench:** preserve the complete evidence-to-publication lifecycle.
2. **AI Research Librarian:** focus on capture, rediscovery, monitoring, and knowledge maintenance.
3. **Scientific Writing Copilot:** focus on drafting, revision, citation insertion, and export.

The Research Workbench is the chosen direction. Research Librarian capabilities support its intake and discovery stages. Scientific Writing Copilot capabilities support its final composition and publication stages. Neither becomes the product's primary identity.

## Target User and Initial Scope

The initial user is a serious solo knowledge worker whose Obsidian vault functions as both a second brain and a production studio. The first output categories are:

- white papers;
- scientific and technical documents;
- deep-research reports;
- rigorous literature-based explainers.

Team collaboration, institutional review, and general-purpose creative writing are outside the initial scope.

## Core Product Model

A research project progresses through seven connected stages:

1. **Frame:** define the research question, audience, scope, intended contribution, and success criteria.
2. **Gather:** discover or import relevant sources.
3. **Read:** capture precise evidence and observations.
4. **Reason:** form claims, connect evidence, expose disagreement, and record uncertainty.
5. **Shape:** build a synthesis matrix, argument, counterarguments, and outline.
6. **Write:** compose document sections from approved claims and evidence.
7. **Assure:** audit support, citations, contradictions, provenance, and publication readiness.

Claims are the connective tissue. A source collection alone does not preserve reasoning continuity. Each Claim records:

- the proposition;
- confidence and review state;
- supporting, challenging, and contextual evidence;
- unresolved questions or limitations;
- outline and draft locations where it is used;
- relevant revision history.

### Canonical entities

#### Research Project

Stores the question, scope, audience, intended outputs, workflow stage, decision log, open questions, next actions, and relationships to the project's records.

#### Source Record

Stores bibliographic identity, source type, origin, local attachment, import provenance, version identity, reading state, and normalized metadata. It may originate from a vault PDF, URL, DOI, arXiv, Zotero, an external report, or a discovery adapter.

#### Evidence Card

Stores an atomic excerpt, observation, or extracted result with a resolvable source, precise locator, interpretation, extraction provenance, and review state. AI-proposed evidence remains visibly unreviewed until accepted.

#### Claim

Stores a proposition and its relationships to evidence. Evidence relationships are typed as supporting, challenging, or contextual. Claims expose confidence, status, limitations, and downstream document usage.

#### Question

Stores an unresolved research question, gap, conflict, or verification task. Questions may be project-level or attached to a source, evidence card, claim, or section.

#### Document

Stores the outline and draft sections for an intended output. Sections link to the claims they express, allowing citation and support checks to follow revisions.

#### Audit Finding

Stores a deterministic or AI-assisted finding with its rule, severity, affected records, evidence, explanation, and repair action. Findings are derived and may be rebuilt.

## User Experience

The primary surface is a Research Workbench view composed around ordinary vault files.

### Project cockpit

The cockpit restores working context at a glance:

- current research intent and stage;
- recent changes and decisions;
- source, evidence, claim, and document counts;
- open questions and next actions;
- evidence coverage;
- unsupported claims;
- citation drift;
- unreviewed AI work.

### Six capabilities

1. **Research Projects:** persistent workflow state and continuity.
2. **Source Inbox:** hybrid source intake, normalization, deduplication, and routing.
3. **Evidence Capture:** one-action creation of evidence from selected source text with exact locators.
4. **Claim Studio:** evidence grouping, disagreement analysis, uncertainty, and counterevidence discovery.
5. **Argument Builder:** synthesis matrices, outlines, and claim-grounded composition.
6. **Evidence Audit:** support, provenance, drift, contradiction, diversity, and readiness checks.

The workbench must not require users to maintain graph records manually. Normal research actions update the structured project state:

- selecting a PDF passage may propose an Evidence Card;
- accepting a synthesis may create or revise Claims;
- moving a Claim into an outline records document usage;
- revising a grounded paragraph updates the affected Claim and citation checks.

Every inferred or generated relationship remains inspectable and correctable.

## Architecture

### Canonical vault layer

Markdown notes and local attachments remain canonical. Research Project, Source, Evidence, Claim, Question, and Document records use typed frontmatter and wikilinks. Users retain direct access to their data without the workbench UI.

### Derived intelligence

The following are caches or projections and must be rebuildable from vault files:

- semantic indexes;
- claim and evidence graph projections;
- citation indexes;
- project health metrics;
- audit findings that do not contain user-authored decisions.

### External adapters

The hybrid source strategy has two lanes:

- native open discovery and metadata adapters, initially DOI/arXiv and open scholarly metadata providers;
- import/export bridges for Zotero and external research-report tools.

Provider records are normalized into vault-native Source Records. Loss of a provider disables its adapter but does not remove prior research state.

### Existing subsystem reuse

The design extends current boundaries rather than introducing a parallel application:

- `sources/` becomes the normalized intake layer and gains scholarly metadata, document identity, import provenance, and deduplication;
- `ontology/` gains shipped research types and typed relations with advisory conformance;
- `semantic/` indexes sources, evidence, claims, and draft sections at appropriate granularity;
- new pure project services construct project state, validate locators, compute support coverage, detect drift, and produce deterministic audits;
- `agent/` gains small tools for proposing evidence, connecting claims, finding challenges, composing from approved claims, and running audits;
- the existing confirmation and diff-review mechanisms gate all mutations;
- a Research Workbench view composes the cockpit and workflow surfaces while normal notes remain usable independently;
- Canvas and Bases remain optional projections, not canonical storage.

## Data Flow

1. A user imports or discovers a source.
2. The relevant adapter normalizes identity and metadata into a Source Record and links any local attachment.
3. Deduplication checks stable identifiers first, then normalized metadata and content fingerprints.
4. The user or AI proposes Evidence Cards with precise locators.
5. The user reviews proposed evidence before it contributes to trusted project coverage.
6. Claims connect reviewed evidence using typed relationships.
7. Approved claims move into a synthesis matrix and outline.
8. Draft sections inherit links to their underlying claims and evidence.
9. Revision updates affected relationships and invalidates stale checks.
10. The release audit reports unsupported prose, citation drift, contradictory claims, weak evidence coverage, unresolved questions, and unreviewed AI work.
11. Export renders the document and its citations without replacing the vault-native project state.

## Trust and Error Handling

### Provenance

Evidence requires a resolvable source and locator. Material without one is stored as an unverified research note and cannot silently count as citation-grade evidence.

### AI review state

AI-proposed evidence, claims, and relationships store model provenance and one of three states: proposed, reviewed, or rejected. Proposed records are visually distinct and excluded from trusted coverage unless the user explicitly opts into a different policy.

### Source drift

Source Records keep identity and content/version fingerprints where available. Changed, missing, or replaced content invalidates affected Evidence Cards and surfaces dependent Claims and Documents.

### Provider failure

Provider errors are scoped to the adapter. Existing normalized records remain available. The UI explains whether discovery, metadata enrichment, import, or export failed and provides a retry or manual path.

### Audit transparency

Every health finding includes the rule, affected records, supporting detail, and repair action. Scores without inspectable causes are prohibited.

### Scientific humility

The product distinguishes citation presence from evidentiary strength and scientific validity. It surfaces uncertainty, methodological differences, population differences, and counterevidence rather than auto-concluding validity.

## Verification Strategy

### Pure-module tests

Test metadata normalization, stable identity, deduplication, locator validation, graph construction, relationship typing, support coverage, citation drift, source invalidation, audit rules, and export mappings without Obsidian imports.

### Fake-vault integration tests

Test project creation, source import, evidence creation, reviewed writes, ontology conformance, project reconstruction, and degraded provider behavior against the existing in-memory Obsidian fake.

### End-to-end fixtures

Maintain representative research fixtures proving that:

- a source excerpt survives import, evidence capture, claim synthesis, outlining, drafting, and export with its citation intact;
- challenging evidence remains visible during drafting;
- modifying or removing a source invalidates downstream support;
- proposed AI work cannot silently become reviewed evidence;
- the complete project is recoverable from vault files after derived indexes are deleted.

### Visual and platform QA

Validate the project cockpit, evidence review, claim workspace, argument builder, and audit results on desktop and mobile. Include empty, large, offline, corrupted, and partially imported projects.

## Delivery Roadmap

### Phase 1: Evidence Backbone

Deliver the smallest defensible product:

- Research Project type and cockpit;
- normalized Source Records for vault PDFs, URLs, DOI/arXiv, and Zotero import;
- one-action Evidence Cards with exact locators;
- Claim Studio with supporting, challenging, and contextual evidence;
- synthesis matrix and claim-to-outline handoff;
- basic audit for unsupported claims, missing locators, unreviewed AI work, and unused evidence.

Phase 1 stops at evidence-backed outlining. It does not attempt broad autonomous web research, full paper generation, or every publication format.

### Phase 2: Research Intelligence

- open scholarly discovery adapters;
- citation-network and related-work expansion;
- stronger deduplication and version resolution;
- contradiction, methodological-difference, and research-gap analysis;
- literature monitoring and field-change updates;
- richer Zotero round-trip and external research-report bridges;
- source-diversity, recency, and evidence-quality audits.

### Phase 3: Publication Assurance

- section-aware scientific and white-paper drafting;
- claim-preserving revision and citation-drift detection;
- methodology, skeptical-peer, clarity, and audience-fit review modes;
- citation-style and bibliography generation;
- DOCX, LaTeX, PDF, and structured Markdown export;
- reproducible appendix for sources, search strategy, exclusions, AI assistance, and decisions;
- final release gate with an inspectable evidence report.

## Explicit Non-Goals

- A one-click “write my whole paper” generator.
- Replacing Zotero as the initial bibliographic system of record.
- A proprietary cloud database as canonical project storage.
- Invisible autonomous edits or silently trusted AI extraction.
- Treating citation presence as proof of scientific validity.
- Team collaboration and institutional approval workflows in the first roadmap.
- Broad refactoring unrelated to the Research Workbench.

## Product Risks and Mitigations

### Claim objects may feel burdensome

Mitigation: Claims emerge from highlighting, synthesis, and outlining. Structured forms are optional inspection and correction surfaces, not the primary creation path.

### The workbench may become too broad

Mitigation: Phase 1 ends at evidence-backed outlining and validates the claim-evidence model before discovery expansion or publication automation.

### AI extraction may create false confidence

Mitigation: preserve exact locators, make review state visible, exclude unreviewed work from trusted coverage, and show contradictory evidence.

### External integrations may dominate maintenance

Mitigation: use narrow adapters and a stable normalized Source Record. Prefer open identifiers and portable import/export formats.

### Derived state may drift from files

Mitigation: treat derived indexes as disposable, invalidate them deterministically, and continuously test project reconstruction from vault files.

## Success Criteria

Phase 1 succeeds when a researcher can:

1. create a research project from a question;
2. import a mixed set of local and scholarly sources without duplicate records;
3. capture reviewable evidence with precise provenance;
4. build claims that preserve support, challenge, and uncertainty;
5. turn claims into an evidence-backed outline;
6. resume the project later and immediately understand its state and next actions;
7. run an audit that explains every support or provenance problem;
8. reconstruct the complete trusted project state from vault files alone.

## Competitive References

- [Obsidian Copilot Vault QA](https://www.obsidiancopilot.com/en/docs/vault-qa)
- [Smart Connections](https://smartconnections.app/smart-connections/)
- [NotebookLM source discovery and Deep Research](https://support.google.com/notebooklm/answer/16215270)
- [Elicit systematic reviews](https://pro.elicit.com/solutions/systematic-reviews)
- [ResearchRabbit features](https://www.researchrabbit.ai/features)
- [SciSpace literature review workflow](https://scispace.com/help/en/articles/10660587-how-to-conduct-a-literature-review-using-scispace)
- [Scite research solutions](https://solutions.springernature.com/products/scite)
- [Zotero bibliography documentation](https://www.zotero.org/support/creating_bibliographies)
