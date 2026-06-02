---
name: build-retrospective
description: Use when a spec-based build or tracker is complete and a retrospective is needed, or when closing out a build against its spec.
---

# Build retrospective

Close a build with an honest retro grounded in what the tracker actually records.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Process

1. **Read the record.** `note_read` the tracker note and the spec note. The
   tracker holds `- [x] …` / `- [ ] … BLOCKED: …` lines and a `## Summary`.
2. **Tally honestly.** What shipped (done tasks), what's still open or blocked
   (and why), and any scope that changed. Don't claim completion the tracker
   doesn't show.
3. **Draw lessons.** A few concrete takeaways — what went well, what to do
   differently — tied to specific tasks.
4. **Write the retro** with `note_create`, titled `<Build> — retrospective`,
   linking `[[spec]]` and `[[tracker]]` (verify both exist). Lead with the
   shipped/left summary, then lessons and follow-ups (as `- [ ]` if actionable).
5. **Tag** via claude-obsidian:consistent-tagging (include `retro`).

## Common mistakes

- Writing the retro from memory instead of reading the tracker.
- Glossing over blocked/unfinished work.
- Not linking the retro to its spec and tracker.
