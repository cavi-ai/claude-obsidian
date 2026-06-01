---
description: Distill the current Claude session into one consolidated, tagged, linked Obsidian note saved to the vault.
argument-hint: "[optional note title]"
---

Turn the current Claude session into a single, durable knowledge note in the
Obsidian vault, following the **claude-obsidian:session-to-note** skill.

Optional title: `$1`

Steps:

1. Locate the active session transcript (`.jsonl` under
   `~/.claude/projects/<encoded-cwd>/`) and run the bundled parser
   (`skills/session-to-note/scripts/parse-transcript.mjs`) to get clean turns.
2. Distill the turns into goal / decisions / what changed / open questions /
   durable ideas — a note understood in a minute, not a transcript.
3. Tag it via claude-obsidian:consistent-tagging (always include `session`),
   then save with `note_create` (title `$1` if given; otherwise topic + date).
4. Call `update_frontmatter` on the new note with `fields: { type: "session" }`
   (note_create can't set `type` itself) so it indexes as a session.
5. Link it into the vault via claude-obsidian:wikilink-weaver.
6. Tell the user the path of the note you created.
