---
description: Audit and optimize the Obsidian vault — diagnose orphans, tag sprawl, missing links, and stale notes, then fix with consent.
argument-hint: "[optional focus: tags | links | orphans | stale]"
---

Run a vault-health pass following the **claude-obsidian:manifest-vault** skill.

Optional focus: `$1` (tags, links, orphans, or stale — otherwise all)

Steps:

1. Survey the vault (`list_titles`, `vault_tags`, `list_recent`, backlinks) and
   diagnose health issues, scoped to `$1` if given.
2. Present a prioritized report as a self-contained `claude-html` artifact
   (claude-obsidian:note-to-artifact), highest-impact issue first.
3. With the user's go-ahead per batch, delegate fixes:
   missing links/orphans → claude-obsidian:wikilink-weaver; tag sprawl →
   claude-obsidian:consistent-tagging.
4. Offer a recurring health-sweep routine (claude-obsidian:vault-routines).
