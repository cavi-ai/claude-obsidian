# claude-obsidian (Claude Code plugin)

Cowork with Claude **inside your Obsidian vault**. This Claude Code plugin pairs
with the **Companion for Claude** Obsidian plugin: Companion runs a local MCP
bridge exposing your vault over 15 read/write tools, and this plugin gives
Claude Code the commands and skills to use it well.

## What you get

**Commands** (you invoke with `/claude-obsidian:<name>`):

- **`note-to-artifact`** — turn a note (or topic) into a beautiful,
  self-contained HTML artifact saved back into the vault as a `claude-html` block.
- **`session-to-note`** — distill the current Claude session into one
  consolidated, tagged, linked knowledge note (turns session memory into vault
  knowledge).
- **`daily-rollup`** — summarize recent vault activity into a skimmable review
  (decisions, changes, open tasks).
- **`manifest-vault`** — audit and optimize the vault: orphans, tag sprawl,
  missing links, stale notes — then fix with your consent.
- **`frontmatter`** — audit and normalize note frontmatter to a consistent
  schema: survey first, confirm the schema, then apply additively with consent.
- **`manifest-pm`** — a prioritized, client-facing product roadmap from your
  project notes, routed into the build pipeline.
- **`manifest-infra`** — grounded infrastructure/system designs (with diagrams)
  from your architecture notes, routed into the build pipeline.
- **`manifest-feature`** — a prioritized, evidence-backed feature backlog from
  your idea/feedback notes, routed into the build pipeline.
- **`manifest-content`** — a prioritized content plan from your vault knowledge,
  routed into grounded drafting.
- **`manifest-risk`** — a grounded, ranked risk register (blockers,
  contradictions, SPOFs) from your project notes.
- **`manifest-research`** — vault coverage map, specific knowledge gaps, and a
  prioritized research agenda.
- **`moc-builder`** — build or refresh a Map of Content hub note that groups and
  annotates the notes on a topic or folder.
- **`source-digest`** — digest research source notes into a cited evidence /
  comparison table artifact with conflicts and gaps.
- **`research-workbench`** — frame a research project, capture and review
  provenance-linked evidence, build claims, audit support, and generate an
  evidence-backed outline.
- **`task-harvester`** — collect open tasks scattered across the vault into one
  consolidated, source-linked, prioritized action list.
- **`build-from-spec`** — read an Obsidian "build spec" note, implement its task
  checklist, and report progress to a tracker note.

**Skills** (Claude invokes automatically when relevant):

- **Foundations** — `vault-grounding` (cite real notes, never fabricate,
  write-safe) and `vault-routines` (offer editable scheduled routines).
- **Knowledge** — `vault-synthesis` (grounded, cited "what do I know about X"),
  `connection-finder` (surface non-obvious, unlinked relationships),
  `source-digest` (cited evidence table from source notes), and
  `research-workbench` (the canonical evidence-backed research workflow).
- **Hygiene** — `consistent-tagging`, `wikilink-weaver`, `moc-builder`,
  `frontmatter-normalizer` (consistent metadata schema), `note-splitter` (break
  up bloated notes), `dedup-merge` (consolidate duplicates).
- **Writing** — `outline-to-draft`, `daily-rollup`, `session-to-note`,
  `meeting-cleanup`, `summarize-and-link`.
- **Build** — `plan-to-spec` (planning note → build spec, feeding
  `build-from-spec`), `task-harvester` (consolidate open tasks),
  `tracker-driver` (honest live progress), and `build-retrospective` (close-out:
  shipped / left / lessons).
- **Cloud** — `cloud-reply` (a dispatched cloud session writes its result back
  as a reply note + PR so Companion can pull it into the vault on any device).
- **Advisor personas** — `manifest-vault`, `manifest-pm`, `manifest-infra`,
  `manifest-feature`, `manifest-content`, `manifest-risk`, `manifest-research`
  (orchestrators that survey the vault and delegate to the worker skills above).
- **`note-to-artifact`** — the design system Claude uses for artifacts.

**`obsidian-vault` MCP server** — pre-wired HTTP connection to the Companion
bridge (15 tools: search, read, list, tags, backlinks, titles, frontmatter query,
create, append, update, frontmatter merge, move/rename, Base, Canvas).

## Setup

1. Install the **Companion for Claude** Obsidian plugin and enable the MCP bridge in
   its settings. Note the **port** (default `22360`) and copy the **bearer
   token**.
2. Make them available to Claude Code (e.g. in your shell or project env):
   ```bash
   export OBSIDIAN_MCP_PORT=22360
   export OBSIDIAN_MCP_TOKEN=<token from Companion settings>
   ```
3. Add this marketplace and install the plugin:
   ```bash
   /plugin marketplace add cavi-ai/claude-obsidian
   /plugin install claude-obsidian@claude-obsidian
   ```
4. Open Obsidian (the bridge only runs while Obsidian is open).
5. Try the research workflow with
   `/claude-obsidian:research-workbench "Investigate this project's sources"`.

The bridge binds to `127.0.0.1` only — your vault is never exposed to the
network.

## Credits

The artifact design system is inspired by **Thariq Shihipar's** "HTML is all you
need to make effective reports/dashboards." See the repository `NOTICE` for full
attribution. This plugin is an original work, not a copy of that repo.
