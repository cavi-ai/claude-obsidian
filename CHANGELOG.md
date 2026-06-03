# Changelog

All notable changes to **Companion for Claude** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] — 2026-06-03

### Added
- **Episodic session memory.** Capture Claude Code CLI sessions for this vault into
  sanitized digest notes — clean prose, the tools Claude ran, files touched, and
  provenance (model, branch, token usage, timespan).
  - Pure transcript parser (`memory/transcript.ts`) and first-class secret
    redaction (`memory/sanitize.ts`) — no text reaches the vault unscrubbed.
  - "Capture session memory…" command + a picker over this vault's sessions.
  - An "ingest" checkbox next to Save that also captures the latest session.
  - A "Session memory" sidebar listing captured notes, with open / re-ingest.
  - Idempotent: re-ingesting a session updates its existing note.
  - Settings: enable toggle, memory folder, ingest-on-save default.

### Changed
- Author/owner display name set to **Sasan Sotoodehfar** (was "CAVI", not a legal entity).

## [0.5.1] — 2026-06-03

### Fixed
- Hardening pass; adaptive Save button; release-workflow fix.

## [0.5.0] — 2026-06-01

### Added
- Initial public release: in-vault Claude chat, interactive `claude-html` artifacts,
  model/thinking controls, conversation history, slash commands, offline fallback,
  loopback MCP bridge, and cloud Claude Code sessions.
