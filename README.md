# claude-obsidian

Cowork with Claude inside your [Obsidian](https://obsidian.md) vault — chat with
your notes as context, generate gallery-grade interactive HTML artifacts, and
drive spec-based builds, with your vault as the single source of truth.

This repo holds two complementary deliverables plus the gallery that inspired
their look:

| Path | What it is |
|---|---|
| [`obsidian-plugin/`](obsidian-plugin/) | **Claude Companion** — the Obsidian community plugin (chat panel, vault-aware context, inline `claude-html` artifacts, local-model routing, MCP bridge). |
| [`claude-plugin/`](claude-plugin/) | The **claude-obsidian** Claude Code plugin + marketplace — commands, the `note-to-artifact` skill, design-system extensions, and the `obsidian-vault` MCP config. |
| [`upstream/html-effectiveness/`](upstream/) | Thariq Shihipar's original ["unreasonable effectiveness of HTML"](https://github.com/ThariqS/html-effectiveness) gallery, included as a **pinned submodule** (unmodified, under its own Apache-2.0 license). See [`NOTICE`](NOTICE) for attribution. |

## Getting it

```bash
git clone --recurse-submodules <repo-url>
# or, if already cloned:
git submodule update --init --recursive
```

## Quick start

- **Obsidian plugin** — see [`obsidian-plugin/README.md`](obsidian-plugin/README.md)
  for install, settings, and the `claude-html` artifact format.
- **Claude Code plugin** — see [`claude-plugin/README.md`](claude-plugin/README.md)
  for the commands, the `note-to-artifact` skill, and wiring the vault MCP
  bridge.

## Open-source hygiene

- [`CONTRIBUTING.md`](CONTRIBUTING.md) covers local development, release
  versioning, and security-sensitive review rules.
- [`SECURITY.md`](SECURITY.md) explains supported versions, vulnerability
  reporting, and project security boundaries.
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) sets the contributor standard.

## How the two fit together

Claude Companion can expose your vault as a local **MCP server** (`obsidian-vault`,
bound to `127.0.0.1`, bearer-token auth). The Claude Code plugin connects to that
bridge, so Claude Code and the in-vault chat operate on the *same* notes — the
compliant way to unify them without subscription OAuth.

## Provenance

Our artifact design system is an **original reformulation** of the aesthetic in
Thariq's gallery, not a copy of his HTML. The gallery itself is vendored only as
a pinned, unmodified submodule. Full attribution is in [`NOTICE`](NOTICE);
everything we authored is MIT-licensed ([`LICENSE`](LICENSE)).

## License

MIT — see [`LICENSE`](LICENSE).
