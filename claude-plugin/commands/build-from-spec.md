---
description: Build from an Obsidian "build spec" note and report progress to its tracker note via the vault MCP bridge.
argument-hint: "<spec note path> [tracker note path]"
---

You are driving a spec-based build against an Obsidian vault. The vault is
reachable through the `obsidian-vault` MCP server (read/search/append tools).

Spec note: `$1`
Tracker note (optional; defaults to the path named inside the spec): `$2`

Do the following:

1. Read the build spec with the `note_read` tool at path `$1`. The spec
   contains a `## Tasks` checklist and a `## Plan` section.
2. Implement the tasks in order. Keep each change focused and runnable; prefer
   the smallest change that satisfies the task.
3. After each task, append one line to the tracker note with `note_append`:
   `- [x] <task> — <one-line note> (<ISO timestamp>)`
4. If a task is blocked, append `- [ ] <task> — BLOCKED: <reason>` and move on.
5. When all tasks are complete, append a `## Summary` section to the tracker
   describing what changed and anything left for the user.

Never invent file paths — discover them with `vault_search` / `list_recent`
if the spec is ambiguous, and ask the user before doing anything destructive.
