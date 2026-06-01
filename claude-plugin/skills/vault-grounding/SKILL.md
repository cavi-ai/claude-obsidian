---
name: vault-grounding
description: Use when reading, citing, writing, or editing notes in an Obsidian vault over the MCP bridge — any time output references vault content, links notes, or modifies the vault.
---

# Vault grounding

The discipline for working honestly inside someone's vault. Every other
claude-obsidian skill builds on this.

**Violating the letter of these rules is violating their spirit.**

## The rules

1. **Cite, don't fabricate.** Every factual claim about the vault must trace to
   a note you actually read (`note_read`). Never assert vault content from
   memory or inference. If you didn't read it, you don't know it.
2. **Don't pad.** When asked what the vault says, answer from the vault only. If
   it's thin on the topic, say so plainly — do not supplement with general
   knowledge or fill gaps from memory. A short honest answer beats a padded one.
3. **Verify before you link.** Before writing a `[[Wikilink]]`, confirm the
   target exists with `list_titles` or `note_read`. A link to a non-existent
   note is a broken link, not a helpful one.
4. **Reuse the user's taxonomy and voice.** Read `vault_tags` before tagging;
   reuse existing tags over inventing near-duplicates. Match the note's
   existing tone — you are extending their vault, not imposing yours.
5. **Writes are gated and consequential.** `note_create`/`note_append`/
   `note_update`/`update_frontmatter` only work when the user enabled writes.
   Before any in-place edit or overwrite, show what will change and confirm.
   Never silently overwrite a note (`note_update` replaces — it is not append).
6. **Right output form.** Synthesis, reports, dashboards → a self-contained
   `claude-html` artifact (see claude-obsidian:note-to-artifact). Structural and
   hygiene changes (tags, links, frontmatter) → plain Markdown.

## Red flags — STOP

- About to write a fact about the vault you didn't read → read it first.
- About to write `[[X]]` without confirming X exists → verify with list_titles.
- About to `note_update` to "fix" a note → show the diff and confirm first.
- Inventing a new tag when a similar one exists → reuse the existing tag.

## Quick reference

| Need | Tool |
|------|------|
| Find notes on a topic | `vault_search` |
| Read a note's content | `note_read` |
| Confirm a note exists / get titles | `list_titles` |
| Who links here / where does this link | `get_backlinks` / `get_outgoing_links` |
| Existing tags | `vault_tags` |
| Create / append / replace / retag | `note_create` / `note_append` / `note_update` / `update_frontmatter` |
