# Security Policy

## Supported versions

Security fixes target the current `main` branch until the first public release is tagged.
After release, fixes target the latest published Obsidian plugin version unless a
maintainer explicitly marks another line as supported.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub private vulnerability reporting for this repository if it is enabled.
If private reporting is not available, open a minimal public issue asking for a
security contact without including exploit details, secrets, vault contents, or
proof-of-concept payloads.

Useful reports include:

- affected component (`obsidian-plugin`, `claude-plugin`, or repository tooling);
- version, commit, and platform;
- impact and the minimum steps needed to reproduce;
- whether the issue can expose vault contents, API keys, MCP bearer tokens, or
  permit writes through the MCP bridge.

## Security boundaries

- The Obsidian plugin stores credentials in Obsidian plugin settings on the
  user's device (desktop and mobile).
- The MCP bridge must bind to `127.0.0.1`, require a non-empty bearer token, and
  keep write tools disabled unless the user explicitly enables them.
- Rendered `claude-html` artifacts are model-generated HTML. They must remain
  sandboxed without `allow-same-origin` and with network/form submission blocked.
- Browser/session OAuth from claude.ai is not supported. The plugin authenticates
  via a user-provided API key, a long-term CLI token from `claude setup-token`
  (`sk-ant-oat…`), or environment import — not a pasted browser session cookie.
