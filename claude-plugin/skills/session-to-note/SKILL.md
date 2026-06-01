---
name: session-to-note
description: Use when distilling or saving a Claude session into the Obsidian vault, capturing what was decided or learned in a session, or turning session memory into a persistent, linked knowledge note.
---

# Session → note

Distill the current Claude session into ONE consolidated vault note — the ideas,
decisions, and conclusions you'd remember walking out of a meeting, not a
keystroke log.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Process

1. **Get clean turns.** Locate the active session transcript (`.jsonl`, under
   `~/.claude/projects/<encoded-cwd>/`) and run the bundled parser to strip
   thinking, tool calls/results, and harness noise:
   `node "${CLAUDE_PLUGIN_ROOT}/skills/session-to-note/scripts/parse-transcript.mjs" <transcript.jsonl>`
2. **Distill, don't transcribe.** From the clean turns, extract: the goal, key
   decisions, what was built/changed, open questions, and the few durable ideas
   worth keeping. Drop chatter. Aim for a note a reader understands in a minute.
3. **Tag it.** Apply tags via claude-obsidian:consistent-tagging (reuse the
   vault's taxonomy). Always include a `session` tag.
4. **Write the note.** `note_create` with a clear title (topic + date) and a
   body that leads with the goal and the decisions. `note_create` writes
   `title`, `created` (date), `source`, and `tags` frontmatter automatically.
5. **Stamp the type.** `note_create` cannot set arbitrary frontmatter, so call
   `update_frontmatter` on the new note with `fields: { type: "session" }` —
   this is what makes it index as a session in search/Dataview/the tag pane.
6. **Link into the graph.** Use claude-obsidian:wikilink-weaver to connect the
   new note to related existing notes, so the session becomes connected
   knowledge, not an island.

## Hard requirements

- The note is a distillation, NOT the raw transcript. No tool calls, no
  thinking, no harness noise.
- Date/time + `type: session` + a `session` tag, so it indexes for search,
  Dataview, and the tag pane.
- At least attempt to link the note to related notes via wikilink-weaver.

## Common mistakes

- Pasting the raw conversation instead of distilling it.
- Missing frontmatter/date → the note doesn't index.
- Leaving the note orphaned (no links in or out).
