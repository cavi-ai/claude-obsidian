# The Claude Code bridge

Companion can expose your **live, running vault** as a local MCP server. Claude
Code connects to it and works the same notes you're looking at — no export, no
file sync, no second copy of the truth.

Desktop only: it needs a local HTTP server. On mobile, use the cloud-session
features instead.

## 1. Enable the bridge

*Settings → Companion for Claude → Agent bridge — MCP server (desktop)*

<!-- screenshot: ../assets/mcp-bridge-settings.png — pending capture -->

| Setting | Default | Notes |
|---|---|---|
| **Enable MCP server** | Off | Starts the loopback server. Turning it on mints an access token if you don't have one. |
| **Port** | `22360` | Loopback only. Any port 1–65535. |
| **Access token** | generated | Required by clients as a bearer token. Stored as a password field, with a **Regenerate** button. |
| **Allow writes** | Off | Lets connected clients mutate the vault. Reads and search are always allowed. |
| **Write folder** | `Claude/Inbox` | Default folder for notes created over MCP. |

A live status line shows `✓ Running at http://127.0.0.1:<port>/mcp`, or tells you
the port is in use.

### Keeping the token out of your vault

Set `OBSIDIAN_COMPANION_MCP_TOKEN` in your environment and Companion uses that
instead of the stored value — useful when the vault is synced, since `data.json`
would otherwise carry the secret. The settings tab shows which source is active.

Connection snippets are **masked by default** so the settings tab is safe to
screen-share; *Show token in snippets* reveals them, and **Copy** always copies
the real, working command. When the token comes from the environment, the snippet
shows `${OBSIDIAN_COMPANION_MCP_TOKEN}` — which expands in your own shell, so the
snippet itself carries no secret.

## 2. Connect Claude Code

The settings tab generates both snippets for you. Copy the one you need.

**Claude Code** — run in a terminal:

```bash
claude mcp add --transport http obsidian-vault http://127.0.0.1:22360/mcp --header "Authorization: Bearer <token>"
```

**Claude Desktop** — add to `claude_desktop_config.json` (it needs `mcp-remote`
to bridge HTTP→stdio):

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:22360/mcp", "--header", "Authorization: Bearer <token>"]
    }
  }
}
```

Obsidian has to be open — the bridge only runs while the app does.

## 3. Install the claude-obsidian plugin

The Claude Code plugin ships `.mcp.json` pre-wired to the bridge, so it picks up
the connection from two environment variables instead of a hand-written config:

```bash
export OBSIDIAN_MCP_PORT=22360
export OBSIDIAN_MCP_TOKEN=<token from Companion settings>
```

Then, in Claude Code:

```
/plugin marketplace add cavi-ai/claude-obsidian
/plugin install claude-obsidian@claude-obsidian
```

Try it: `/claude-obsidian:research-workbench "Investigate this project's sources"`.

## The tool reference

Ten read/audit tools are **always** served. Fourteen mutations appear only when
*Allow writes* is on — so a client can read and audit a research project even
when writing is off.

### Reads (always)

| Tool | Purpose |
|---|---|
| `vault_search` | Search by meaning and keyword; returns matches with a snippet |
| `note_read` | Read a note's full Markdown by vault path |
| `list_recent` | Most recently modified notes |
| `vault_tags` | Existing tags with usage counts, for consistent tagging |
| `list_titles` | Every note as `path — title`, for link/MOC awareness |
| `get_backlinks` | Notes linking to a given note |
| `get_outgoing_links` | Notes a given note links to |
| `frontmatter_query` | Notes matching a frontmatter field, optionally by value |
| `research_project_read` | Compact project snapshot: sources, evidence, claims, issues, health |
| `research_audit` | Audit a research project, returning actionable JSON findings |

### Writes (gated behind *Allow writes*)

| Tool | Purpose |
|---|---|
| `note_create` | Create a note with indexed frontmatter (advertises `type`/`properties` once an ontology is seeded) |
| `note_append` | Append to a note |
| `note_update` | Replace a note's body or a single section |
| `update_frontmatter` | Set tags and frontmatter fields |
| `note_move` | Rename/move a note, rewriting backlinks automatically |
| `base_create` | Emit a `.base` database view over frontmatter |
| `canvas_create` | Emit a `.canvas` mind map with auto-layout, wired to real notes |
| `research_project_create` | Create a research project |
| `research_source_import` | Import a source; web URLs are fetched and reduced to clean readable markdown |
| `research_evidence_capture` | Capture a provenance-linked evidence card |
| `research_evidence_review` | Mark evidence `reviewed` or `rejected` |
| `research_claim_create` | Create a claim with supporting/challenging/contextual relations |
| `research_claim_link` | Link evidence to a claim under a relation |
| `research_outline_generate` | Generate an evidence-backed outline preserving provenance |

In Companion's own agent mode these same writes additionally keep their
per-action confirmation. Permanent legacy aliases stay callable for
compatibility but are intentionally omitted from the advertised catalog.

## What the plugin adds on top

**27 commands and 31 skills**, all built on a shared grounding discipline — cite
real notes, never fabricate, writes confirmed. Most skills have a matching
`/claude-obsidian:` command, so you can invoke one explicitly or let Claude reach
for it:

| Area | Commands / skills |
|---|---|
| **Knowledge** | `vault-synthesis` (grounded, cited "what do I know about X"), `connection-finder`, `source-digest`, `research-workbench` |
| **Hygiene** | `consistent-tagging`, `wikilink-weaver`, `moc-builder`, `frontmatter-normalizer`, `note-splitter`, `dedup-merge` |
| **Writing** | `outline-to-draft`, `daily-rollup`, `session-to-note`, `meeting-cleanup`, `summarize-and-link` |
| **Build** | `plan-to-spec`, `tracker-driver`, `build-retrospective`, `task-harvester`, plus the `build-from-spec` command |
| **Cloud** | `cloud-reply` — dispatch a cloud session; the result lands as a reply note plus a PR for vault import |
| **Advisor personas (`manifest-*`)** | `vault`, `pm`, `infra`, `feature`, `content`, `risk`, `research`: survey the vault, produce a prioritized `claude-html` artifact, route work into the build pipeline. All seven share the `manifest-core` spine (gather → prioritize → present → route), which Claude invokes for them rather than you calling it directly |
| **Foundations** | `vault-grounding`, `vault-routines`, and the `note-to-artifact` design system |

Headline command: `/claude-obsidian:session-to-note` distills a whole Claude
session into one consolidated, tagged, linked vault note — ephemeral session
memory becomes a persistent point in your knowledge graph.

Full list: the [claude-obsidian README](https://github.com/cavi-ai/claude-obsidian-plugin#readme).

## Security model

This is the security-sensitive part of the plugin, and it's deliberately narrow:

- **Loopback only.** The server binds `127.0.0.1`. Your vault is never reachable from the network.
- **A non-empty bearer token is mandatory.** Startup fails outright without one. There is no tokenless mode.
- **Constant-time token comparison**, so a wrong token leaks nothing through timing.
- **Loopback `Host` enforcement.** Requests whose `Host` header isn't a loopback value are rejected with 403 — defense in depth against DNS rebinding, where a page on an attacker domain resolving to `127.0.0.1` would carry that domain as `Host`.
- **Writes off by default**, and separately gated from reads.
- **Only `POST /mcp`** is routed; anything else 404s.

Reporting policy and boundaries: [`SECURITY.md`](../SECURITY.md).

## Troubleshooting

- **"Not running — check the port isn't in use."** Another process holds the port. Change it and re-copy the snippet.
- **401 from the client.** The token doesn't match. Regenerate, or check whether `OBSIDIAN_COMPANION_MCP_TOKEN` is set and shadowing the stored one.
- **403 from the client.** Something rewrote the `Host` header to a non-loopback value. Connect to `127.0.0.1` or `localhost` directly.
- **Write tools missing from the client's tool list.** *Allow writes* is off — that's the gate working.
- **Nothing responds.** Obsidian is closed, or the vault with Companion enabled isn't open.

## Pairs well with kepano's Obsidian Skills

Steph Ango (@kepano, Obsidian's CEO) publishes
[obsidian-skills](https://github.com/kepano/obsidian-skills) for Obsidian
Flavored Markdown, Bases, JSON Canvas, `obsidian-cli`, and Defuddle web clipping.
His skills teach Claude the *file formats* and work on vault files directly — even
with Obsidian closed. This bridge works the *live, running* vault. They're
complementary; install both.
