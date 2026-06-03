// The one place a session becomes a note. Enforces the security contract: every
// text field of the digest is sanitized before anything is rendered or written.
// transcript → sanitize → render → idempotent write.

import { App, TFile } from "obsidian";
import { digestTranscript, type SessionDigest } from "./transcript";
import { sanitizeWithReport } from "./sanitize";
import { renderDigestNote, writeDigestNote } from "./note";

export interface IngestDeps {
  app: App;
  /** Reads the raw .jsonl for a session (injected for testability). */
  read: (path: string) => Promise<string>;
  folder: string;
  baseTags: string[];
}

export interface IngestTarget {
  id: string;
  path: string;
}

export interface IngestResult {
  file: TFile;
  sessionId: string;
  redactions: number;
}

export async function ingestSession(deps: IngestDeps, target: IngestTarget): Promise<IngestResult> {
  const jsonl = await deps.read(target.path);
  const digest = digestTranscript(jsonl);

  let redactions = 0;
  const scrub = (t: string): string => {
    const r = sanitizeWithReport(t);
    redactions += r.redactions.reduce((sum, x) => sum + x.count, 0);
    return r.text;
  };

  const safe: SessionDigest = {
    ...digest,
    prose: digest.prose.map((p) => ({ ...p, text: scrub(p.text) })),
    toolActions: digest.toolActions.map((a) => ({ ...a, target: a.target ? scrub(a.target) : undefined })),
    filesTouched: digest.filesTouched.map(scrub),
  };

  const sessionId = safe.sessionId ?? target.id;
  const vaultNoteBasenames = new Set(deps.app.vault.getMarkdownFiles().map((f) => f.basename));
  const content = renderDigestNote(safe, { baseTags: deps.baseTags, vaultNoteBasenames, redactions });

  const date = (safe.startedAt ?? safe.endedAt ?? "").slice(0, 10) || "session";
  const previewLine = (safe.prose.find((p) => p.role === "user")?.text.split("\n")[0] ?? sessionId).slice(0, 50);
  const fileBase = `${date}-${previewLine}`;

  const file = await writeDigestNote(deps.app, deps.folder, sessionId, content, fileBase);
  return { file, sessionId, redactions };
}
