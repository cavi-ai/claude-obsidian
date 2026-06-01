---
name: vault-synthesis
description: Use when answering "what do I know about X", synthesizing across many notes, producing a grounded topic summary, or building a literature/research digest from an Obsidian vault.
---

# Vault synthesis

Answer a question from the vault itself — grounded, cited, honest about gaps and
contradictions. Not a general-knowledge essay.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## Process

1. **Gather.** `vault_search` the topic. For the most relevant hits, `note_read`
   them in full, then follow `get_backlinks` / `get_outgoing_links` to pull in
   connected notes the search missed. Breadth here determines quality.
2. **Extract claims, attributed.** As you read, collect each claim with its
   source note. Every claim carries a `[[Source Note]]` citation.
3. **Dedupe and group.** Merge claims that repeat across notes; group by theme.
4. **Surface contradictions.** When notes disagree, say so explicitly with both
   citations — don't silently pick one. Contradictions are signal.
5. **Name the gaps.** State what the vault does *not* cover on this topic.
6. **Output.** Lead with the single most important takeaway. For a rich
   synthesis, render a self-contained `claude-html` artifact
   (claude-obsidian:note-to-artifact). Every claim stays cited to its note.

## Hard requirements

- No claim about the topic without a `[[note]]` citation behind it.
- If the vault is thin on the topic, say so — do not pad with outside knowledge.
- A "Contradictions" and a "Gaps" section whenever either exists.

## Common mistakes

- Answering from training knowledge instead of the vault.
- Only reading search hits, never following links/backlinks.
- Uncited claims; silently resolving conflicting notes.
