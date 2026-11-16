# Security Policy

## Supported versions

Security fixes are released for the latest version of Companion for Claude
published in the Obsidian community plugin store. Older versions are not
patched; update to the latest release.

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

### Credential storage

- API keys and tokens (Anthropic API key, OAuth token, custom endpoint key,
  Zotero, Brave Search, MCP bridge token, cloud routine and reply tokens,
  publishing GitHub token) are stored in Obsidian's secret storage, not in the
  vault's `data.json`.
- Plaintext credentials found in `data.json` from earlier versions are moved to
  secret storage on load and blanked in the file. A credential is removed from
  `data.json` only after it has been read back from secret storage.
- If the operating system's secret backend does not retain a value, that
  credential stays in `data.json`, which lives inside the vault and is included
  in vault sync and version control. Rotate any credential that was stored in a
  synced or committed vault.
- The MCP bridge token can instead be supplied through the
  `OBSIDIAN_COMPANION_MCP_TOKEN` environment variable, which takes precedence
  over the stored value.

### MCP bridge

- Desktop only. The bridge listens on `127.0.0.1` and is off until enabled.
- It refuses to start without a non-empty bearer token, and rejects every
  request to `/mcp` that lacks the matching `Authorization: Bearer` header
  (constant-time comparison).
- Requests whose `Host` header is not `127.0.0.1`, `localhost`, or `::1` are
  rejected, which blocks DNS-rebinding access from web pages.
- Request bodies larger than 5 MB are rejected.
- Write tools are disabled by default; the "Allow writes" setting enables note
  creation and edits of notes. The write folder setting is the default folder
  for new notes.

### Rendered artifacts

- `claude-html` artifacts are model-generated HTML rendered in an iframe with
  `sandbox="allow-scripts"` (no `allow-same-origin`, so no access to the vault,
  Obsidian, or its storage).
- A Content-Security-Policy injected into each artifact sets
  `default-src 'none'`, `connect-src 'none'`, `form-action 'none'`, and allows
  images, fonts, and media only from `data:` and `blob:` URLs, blocking network
  requests and form submission. Inline scripts and `eval` are permitted so
  charts and interactive artifacts work.
- The same policy is applied to artifacts opened in the fullscreen view and
  exported for an external browser.

### Provider authentication

- Direct Anthropic API access uses one of three modes: an API key (sent as
  `x-api-key`), a long-term OAuth token from `claude setup-token`
  (`sk-ant-oat…`, sent as a Bearer token), or credentials imported from the
  environment (`ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`).
- On desktop, the Claude Code backend runs the installed `claude` command and
  checks its sign-in status through the CLI; the plugin does not read the CLI's
  credential files.
