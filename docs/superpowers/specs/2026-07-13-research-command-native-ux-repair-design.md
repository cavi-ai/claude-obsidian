# Research Command Native UX Repair Design

**Date:** 2026-07-13
**Target:** Companion for Claude (`obsidian-plugin/`)

## Problem

Companion's `/research` command currently inserts an internal, 716-character tool instruction into the composer. When the chat backend is local, agent tools are unavailable because the agent loop runs only with Anthropic. Ollama therefore receives tool names as plain text and may respond with tool-call code, Python-like output, or a generic statement that the tools are unavailable.

This leaks implementation details into the conversation and fails to deliver a useful Research Workbench experience. The native workbench and deterministic audit already exist; the command is routed through the wrong product surface.

## Goal

Make `/research` a model-independent native entry point that opens the Research Workbench, resolves the active project when possible, and exposes deterministic project state and audits without sending a chat message.

## Native Command Behavior

`/research` becomes an action command mapped to the existing `open-research-workbench` plugin command.

When selected:

1. the slash menu closes;
2. no prompt is inserted or submitted;
3. no user or assistant chat message is created;
4. the Research Workbench view opens;
5. the active note is resolved to its owning research project when it is a project or project-linked research record;
6. otherwise, the view shows its existing project-selection/create state.

The command works with Claude, Auto, and Local-only backends and requires no model credential.

## Project Resolution

Project resolution remains a pure, testable routing function:

- a `research-project` resolves to its own path;
- a valid Source, Evidence, Claim, Question, or Document resolves through its canonical `project` relationship;
- malformed or unrelated notes resolve to no project;
- resolution never guesses from folder layout alone when canonical metadata is missing.

The workbench reloads the resolved project through `ResearchRepository`, so Overview and Audit reflect current vault state.

## Deterministic User Value

The native workbench remains useful without AI:

- project question, stage, and status;
- source, evidence, claim, question, and document counts;
- unsupported claims, unreviewed evidence, missing locators, stale fingerprints, broken references, and unused evidence;
- direct next-action buttons already backed by canonical research operations.

No LLM is needed to inspect these facts or run the audit.

## Claude Analysis Boundary

Claude-powered interpretation is not triggered by `/research`.

If an “Analyze with Claude” action is added within this repair, it must:

- be explicit and user-initiated;
- be available only when the active provider is Anthropic and agent mode is enabled;
- explain why it is unavailable under Local-only mode rather than inserting tool instructions;
- use the same canonical research tools and trust rules as the Claude Code skill;
- never block access to the deterministic workbench.

YAGNI default: this repair may omit the analysis action entirely. Opening and operating the native cockpit is the required fix.

## Claude Code Compatibility

`/claude-obsidian:research-workbench` remains unchanged. Claude Code has its own MCP tool context and continues to invoke the canonical `research-workbench` skill.

The two entry points share the same workflow and canonical records, but use product-native adapters:

- Companion `/research` opens the native cockpit;
- Claude Code `/claude-obsidian:research-workbench` runs the agent skill.

## Error Handling

- A damaged project record opens the workbench and surfaces parse/audit findings rather than failing silently.
- An unrelated active note opens the empty/select-project state.
- A project read failure renders the existing transparent workbench error state.
- Slash dispatch must not fall back to chat if the workbench cannot open.

## Verification

- Registry test: `/research` is an action, not a prompt, and maps to `open-research-workbench`.
- Dispatch test: choosing `/research` calls the native open handler and leaves the composer/conversation untouched.
- Routing tests: project notes and project-linked records resolve correctly; unrelated/malformed notes do not.
- Backend matrix test: Claude, Auto, and Local-only settings all use the same native action with no completion request.
- Regression assertion: the internal Research Workbench tool prompt is absent from Companion's production slash registry and bundle.
- Full typecheck, lint, unit tests, production build, and `git diff --check` pass.
- Isolated-vault screenshot proves `/research` opens the populated native workbench while the chat remains empty under Local-only mode.

## Scope Boundaries

- No version bump.
- No changes to canonical research record types or trust rules.
- No changes to MCP tool names, compatibility aliases, authentication, or write defaults.
- No autonomous research or Phase 2 intelligence features.
- No unrelated chat, slash-menu, or workbench redesign.
- No changes to the pinned `upstream/html-effectiveness` submodule.
