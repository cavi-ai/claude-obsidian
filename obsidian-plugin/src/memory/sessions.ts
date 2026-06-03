// Filesystem-backed discovery of Claude Code CLI sessions for a vault. The FS is
// reached through an injected SessionReader so the discovery logic is unit-tested
// against fixtures; the real reader (node fs) is desktop-only. Pure helpers
// (encodeProjectDir, metaFromTranscript) carry no IO.

import { digestTranscript } from "./transcript";

/**
 * Encode an absolute cwd into the directory name Claude Code uses under
 * ~/.claude/projects/. Confirmed on-disk: every non-alphanumeric char → "-"
 * (so "/a/.b" → "-a--b"). Lossy in reverse — we match the exact `cwd` field
 * inside the records, not by decoding this name.
 */
export function encodeProjectDir(vaultPath: string): string {
  return vaultPath.replace(/[^A-Za-z0-9]/g, "-");
}
