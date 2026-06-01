---
name: tracker-driver
description: Use when driving a spec-based build against the vault and updating its tracker note, or reporting build progress honestly to a tracker as tasks complete.
---

# Tracker driver

Keep a build's tracker note an honest, live record of progress.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## The discipline

1. **One line per task, as it finishes.** After each task, `note_append` to the
   tracker:
   `- [x] <task> — <one-line note> (<ISO timestamp>)`. Don't batch at the end —
   update as you go so the tracker reflects reality at any moment.
2. **Blocked is not done.** If a task can't complete, append
   `- [ ] <task> — BLOCKED: <reason>` and move on. Never check off work that
   isn't actually done and verified.
3. **Finish with a summary.** When the build ends — every task is either `[x]`
   or `[ ] … BLOCKED` — append a `## Summary` section: what shipped, what's
   blocked/left, and anything the user must do. A blocked build still gets one.
4. **Honest status only.** The tracker is a source of truth — a green box must
   mean the task truly works, not "should work."

## Common mistakes

- Marking a blocked/partial task as `[x]`.
- Batching all updates at the end (tracker is stale mid-build).
- Omitting timestamps, or never writing the final `## Summary`.
