# Agent mode

In agent mode Claude works the vault itself instead of answering from whatever
you pasted. It searches, reads, follows links, and — when you allow it — writes,
all inside a single turn, with every step shown to you.

## The loop

One turn is not one request. It's a loop:

1. Claude streams a response. If it wants a tool, the stream ends with a tool request instead of a final answer.
2. Companion runs the requested tools **in the order Claude asked for them**, rendering a chip per call.
3. The results are fed back as a new message and Claude streams again — now with the notes it just read.
4. Repeat until Claude answers without asking for a tool, or the iteration cap is hit.

Failures don't kill the turn. A malformed argument, a missing note, or a write you
declined all come back to Claude as an error result, so it can adapt and try
something else.

## Tool chips

Every call renders as an expandable chip: the tool name, a summary of its
arguments, and a preview of what came back (green for success, flagged for error).
Chips are recorded with the conversation, so reopening an old chat shows the same
trace.

<!-- screenshot: ../assets/agent-tool-chips.png — pending capture -->

## What Claude can do

**Reads — always available when agent mode is on:**

| Tool | What it does |
|---|---|
| `vault_search` | Search by meaning and keyword (semantic when enabled, otherwise keyword) |
| `note_read` | Read a note's full Markdown by vault path |
| `list_recent` | List the most recently modified notes |
| `vault_tags` | List existing tags with usage counts |
| `list_titles` | List every note as `path — title` |
| `get_backlinks` | Notes linking to a given note |
| `get_outgoing_links` | Notes a given note links to |
| `frontmatter_query` | Find notes by a frontmatter field, optionally by value |
| `research_project_read` | Read a research project snapshot |
| `research_audit` | Audit a research project and return findings |

**Writes — only with *Allow write tools* on, and each one asks you first:**

| Tool | What it does |
|---|---|
| `note_create` | Create a note with indexed frontmatter |
| `note_append` | Append to an existing note |
| `note_update` | Replace a note's body or one section |
| `update_frontmatter` | Set tags and frontmatter fields |
| `note_move` | Rename/move a note, rewriting backlinks |
| `canvas_create` | Build a `.canvas` mind map wired to real notes |
| `base_create` | Build a `.base` database view over frontmatter |
| `research_project_create` · `research_source_import` · `research_evidence_capture` · `research_evidence_review` · `research_claim_create` · `research_claim_link` · `research_outline_generate` | Research record mutations |

That's **10 reads and 14 write-gated tools**. The same set is what the
[MCP bridge](claude-code-bridge.md) exposes to Claude Code.

## Editing notes: diffs, not writes

Changing an existing note doesn't go through the write tools. Claude calls
`propose_note_edit` with exact string replacements; Companion shows you a
**per-hunk red/green diff**; only the hunks you accept are written, and Claude is
told which ones those were.

<!-- screenshot: ../assets/diff-review.png — pending capture -->

This is deliberately *not* classified as a write tool, so it stays available even
with *Allow write tools* off — reviewing a diff is already your decision point.
Each replacement must match the note exactly once, which is why Claude includes
surrounding lines instead of matching a bare word.

## Plan Mode

Sometimes you want Claude to work out *what* it would do before it does anything.
The **Plan** button in the composer turns on Plan Mode for the conversation.

While it's on:

- Claude gets the **read-only tool set only** — write tools are excluded regardless of your *Allow write tools* setting.
- `propose_note_edit` isn't offered either, so the turn ends in a plan rather than an edit proposal.
- Claude is instructed to explore first (search and read the relevant notes), then propose concrete ordered steps naming the vault paths involved.

Turn it off to execute. Plan Mode is **per-conversation and never persisted** — a
fresh chat always starts with it off, so you can't leave it on by accident and
wonder why nothing writes.

This is the strongest guarantee in the plugin: not "Claude was asked not to
write", but "the write tools were never handed over".

## The guardrails

- **Per-action confirmation.** Every write tool call pops a confirmation showing what it's about to do. Decline and Claude gets "User declined." and carries on.
- **Fail closed.** If the confirmation handler isn't wired up, write tools return an error rather than running. A mis-wired caller cannot mutate the vault.
- **Iteration cap.** *Max tool iterations per turn* (default 10, range 1–20) bounds the loop. On hitting it you get a notice — "Stopped after N tool iterations — ask me to continue if the answer is incomplete" — not a silent truncation.
- **Result truncation.** A single tool result is capped at 8,000 characters, and the cut is labelled inline so Claude knows something was omitted rather than assuming it read everything.
- **Stop anytime.** Aborting a turn stops the loop between tool calls; nothing further runs.

## How Claude is told to behave

Agent mode appends an instruction block to the system prompt. The rules that
matter to you:

- Search or read before answering anything the vault could answer — never guess at note contents.
- Cite the vault paths actually used, and prefer `[[wikilinks]]` in prose.
- Never fabricate a note, path, or quote; if the vault doesn't have it, say so.
- Only create or modify notes when asked, and describe what changed.
- If asked to write with writes off, say so plainly — **never paste note content into chat as if it had been saved**.
- Prefer `propose_note_edit` over rewriting a note wholesale.
- Prefer `canvas_create` with `file` nodes pointing at real notes over text cards restating them.
- Discover real frontmatter property names with `frontmatter_query`/`vault_tags` before building a `base_create` view.

## Memory feeds back in

With session memory on (*Settings → Companion for Claude → Session memory*,
desktop only, default folder `Claude/Sessions`), Claude Code session transcripts
are digested into per-session notes, and those digests are consolidated into one
evolving **"What Claude Knows"** note.

That note is not injected into every prompt. The agent instruction tells Claude
to *look for it* — by `type: claude-memory` frontmatter via `vault_search` or
`frontmatter_query` — when durable context about your past work would help. So
memory arrives through the same visible tool calls as everything else, and you
can read, edit, or delete the note like any other.

Consolidation reads the newest digests only: up to 15 notes and 24,000
characters, oldest dropped first.

## Settings reference

*Settings → Companion for Claude → Agent (act on your vault)*

| Setting | Default | Effect |
|---|---|---|
| Let Claude use vault tools | On | Enables the read-only loop. Off = plain chat with pre-attached context only. |
| Allow write tools | On | Adds the 14 write tools. Every call still asks first. |
| Max tool iterations per turn | 10 | Rounds of search/read/write before Claude must answer. |

Plan Mode has no setting — it's the **Plan** toggle in the composer, per
conversation.

One agent, three surfaces: in chat here, over the
[MCP bridge](claude-code-bridge.md) for Claude Code on desktop, and via a cloud
session on mobile. Same vault, same guardrails.
