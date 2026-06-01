---
name: plan-to-spec
description: Use when turning a planning note into a build spec, preparing a note for handoff to a Claude Code build, or creating a spec and tracker from a plan.
---

# Plan → spec

Convert a planning note into a structured build spec (plus a tracker note) that
the claude-obsidian:build-from-spec command can drive directly.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Process

1. **Read the plan.** `note_read` the planning note. Extract concrete, ordered
   tasks from its steps/checklist — don't invent tasks the plan doesn't imply.
2. **Write the spec note** with `note_create`, body in EXACTLY this shape so the
   build harness can parse it:

   ```
   # Build spec: <title>

   Tracker: <tracker note path>

   ## Tasks

   - [ ] First task
   - [ ] Second task

   ## Plan

   <the relevant plan detail, verbatim or tightened>
   ```

   The `Tracker:` line names the tracker note so `build-from-spec` can find it
   even when the user doesn't pass the tracker path explicitly.
3. **Create the tracker note** (`note_create`) — an empty note the build will
   append progress to (one per spec). Name it `<title> — tracker`, and write its
   path into the spec's `Tracker:` line.
4. **Hand off.** Tell the user to run
   `/claude-obsidian:build-from-spec <spec path> <tracker path>` to start the
   build, and confirm both paths.

## Hard requirements

- `## Tasks` uses `- [ ]` checkboxes (the harness extracts these).
- Tasks come from the plan, in order — no invented scope.
- A tracker note exists, its path is written into the spec's `Tracker:` line,
  and it is reported to the user.

## Common mistakes

- An ad-hoc spec format the build harness can't parse.
- Forgetting the tracker note, or not telling the user the next command.
