# Research Workbench Command Parity Design

**Date:** 2026-07-13  
**Target:** Companion for Claude (`obsidian-plugin/`) and the paired Claude Code plugin (`claude-plugin/`)

## Goal

Make the Research Workbench easy to discover from both supported command surfaces while presenting one coherent workflow:

- `/research` in Companion's chat composer;
- `/claude-obsidian:research-workbench` in Claude Code.

Both entries must guide the same project-to-publication lifecycle and use the reviewed research tools already shipped in Phase 1.

## Chosen Approach

Use one canonical, named `research-workbench` skill in the Claude Code plugin and two thin product-native entry points.

The canonical skill defines the workflow contract: frame a project, capture sources, extract and review evidence, connect claims, audit provenance, and build an evidence-backed outline. The Claude Code command delegates directly to that skill. Companion's native slash command uses an equivalent prompt registered in its existing slash-command catalog.

This avoids a runtime dependency between separately packaged plugins. A parity test protects the shared workflow vocabulary and required stages from drifting.

## Components

### Canonical skill

Add `claude-plugin/skills/research-workbench/SKILL.md`. It must:

- use the Research Workbench MCP tools rather than hand-editing canonical records;
- require `vault-grounding` for source-backed reasoning;
- preserve the trust boundary between captured, reviewed, stale, and unsupported material;
- ask before write operations that materially change the vault;
- route the user through only the stages needed for the current request.

### Claude Code command

Add `claude-plugin/commands/research-workbench.md`. It accepts optional user arguments and explicitly delegates to `claude-obsidian:research-workbench`.

### Companion slash command

Register `/research` in the existing in-chat slash palette. Its prompt mirrors the canonical skill's stages and tells the model to use the native research tools. Selecting it inserts the workflow prompt through the same path as existing Companion slash commands.

### Documentation

Update the root README, `obsidian-plugin/README.md`, and `claude-plugin/README.md` so users can find both matching commands and understand that they expose the same workflow. Command and skill totals must be derived from the repository rather than guessed.

## Data and Control Flow

1. The user selects either command surface.
2. The entry point supplies the Research Workbench workflow contract and any user arguments.
3. The model identifies the active project and current workflow stage.
4. Read operations reconstruct project state from canonical Markdown.
5. Proposed writes use the research tools and preserve review/fingerprint rules.
6. The result points to the created or updated vault records and recommends the next useful stage.

## Error Handling

- If no project is active, offer to create or select one instead of guessing.
- If required research tools are unavailable, explain which capability is missing and stop before fabricating state.
- If evidence is stale, unreviewed, or disconnected, surface that status and exclude it from supported output.
- If a requested write is unsafe or ambiguous, show the proposed action and ask for confirmation.

## Verification

- Unit-test `/research` discovery and prompt insertion in Companion's slash menu.
- Verify the Claude Code command references the exact canonical skill name.
- Add a parity test or deterministic validation that both entry points retain the required stages: project, source, evidence, claim, audit, and outline.
- Run typecheck, lint, unit tests, production build, and `git diff --check`.
- Verify the `/research` entry visually in an isolated Obsidian vault.

## Scope Boundaries

- No version bump.
- No runtime loading of files from the sibling plugin package.
- No new research record types or changes to the Phase 1 trust model.
- No unrelated slash-menu redesign.
- No changes to the pinned `upstream/html-effectiveness` submodule.

