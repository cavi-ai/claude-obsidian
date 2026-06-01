---
name: manifest-vault
description: Use when asked to optimize, clean up, audit, or improve an Obsidian vault, assess vault health, or find structural problems in a vault.
---

# Manifest: vault optimizer

Diagnose a vault's health, present a prioritized plan, then delegate the fixes.
This is an orchestrator — you survey and route, you don't hand-roll the fixes.

**REQUIRED SUB-SKILLS:** claude-obsidian:vault-grounding for all reads/writes;
fixes MUST be performed by invoking claude-obsidian:wikilink-weaver and
claude-obsidian:consistent-tagging — never edit tags or links inline yourself.

## Process

1. **Survey.** `list_titles` (all notes), `vault_tags` (taxonomy), `list_recent`
   (freshness). Sample notes with `note_read`; use `get_backlinks` /
   `get_outgoing_links` to find orphans (no links in or out).
2. **Diagnose** these health signals:
   - Orphan notes (unconnected to the graph)
   - Tag sprawl (case/plural duplicates, one-off tags)
   - Missing links (notes that mention other notes' titles but don't link them)
   - Stale notes (old, possibly superseded)
3. **Present a prioritized report** — a self-contained `claude-html` artifact
   (claude-obsidian:note-to-artifact) leading with the highest-impact issue and
   a ranked fix list. Show before you change anything.
4. **Delegate fixes** — invoke the worker skills, with the user's go-ahead per
   batch; do not perform the edits yourself:
   - Missing links / orphans → invoke claude-obsidian:wikilink-weaver
   - Tag sprawl → invoke claude-obsidian:consistent-tagging
5. **Offer a routine.** Propose a recurring health sweep via
   claude-obsidian:vault-routines.

## Hard requirements

- Diagnose and present BEFORE changing anything; bulk changes need consent.
- Delegate to worker skills — don't reimplement tagging/linking inline.

## Common mistakes

- Sweeping edits with no diagnosis or consent.
- Rebuilding wikilink-weaver / consistent-tagging by hand instead of invoking them.
