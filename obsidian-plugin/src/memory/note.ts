// Pure rendering of a SessionDigest into a vault note (frontmatter + body), plus
// an idempotent writer (separate, IO section below). The renderer takes only
// data — callers MUST have already sanitized the digest's text fields.

import { buildFrontmatter, normalizeTags, type FrontmatterData } from "../indexing/frontmatter";
import type { SessionDigest } from "./transcript";

export interface RenderOptions {
  baseTags: string[];
  /** Basenames (no extension) of vault markdown notes, for wikilinking. */
  vaultNoteBasenames?: Set<string>;
  /** Total redaction count, surfaced in frontmatter. */
  redactions?: number;
  /** Caps to keep huge sessions from producing huge notes. */
  maxProse?: number;
  maxActions?: number;
}

const DEFAULT_MAX_PROSE = 200;
const DEFAULT_MAX_ACTIONS = 200;

function basename(p: string): string {
  const name = p.split("/").pop() ?? p;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function renderFile(path: string, vaultNotes?: Set<string>): string {
  if (path.endsWith(".md") && vaultNotes?.has(basename(path))) return `[[${basename(path)}]]`;
  return `\`${path}\``;
}

export function renderDigestNote(d: SessionDigest, opts: RenderOptions): string {
  const fm: FrontmatterData = {
    "claude-session": d.sessionId ?? "",
    model: d.model,
    branch: d.gitBranch,
    started: d.startedAt,
    ended: d.endedAt,
    "user-turns": d.userTurns,
    "assistant-turns": d.assistantTurns,
    "input-tokens": d.inputTokens,
    "output-tokens": d.outputTokens,
    "files-touched": d.filesTouched,
    redactions: opts.redactions ?? 0,
    tags: normalizeTags(opts.baseTags),
  };

  const maxProse = opts.maxProse ?? DEFAULT_MAX_PROSE;
  const maxActions = opts.maxActions ?? DEFAULT_MAX_ACTIONS;
  const lines: string[] = [buildFrontmatter(fm), ""];

  const summary = d.prose.find((p) => p.role === "user")?.text.split("\n")[0] ?? "Claude session";
  lines.push(`# ${summary}`, "");

  lines.push("## Conversation", "");
  for (const turn of d.prose.slice(0, maxProse)) {
    lines.push(`**${turn.role === "user" ? "You" : "Claude"}:**`, "", turn.text, "");
  }
  if (d.prose.length > maxProse) lines.push(`_…and ${d.prose.length - maxProse} more turns._`, "");

  if (d.toolActions.length > 0) {
    lines.push("## What Claude did", "");
    for (const a of d.toolActions.slice(0, maxActions)) {
      lines.push(a.target ? `- ${a.tool} — \`${a.target}\`` : `- ${a.tool}`);
    }
    if (d.toolActions.length > maxActions) lines.push(`- _…and ${d.toolActions.length - maxActions} more._`);
    lines.push("");
  }

  if (d.filesTouched.length > 0) {
    lines.push("## Files touched", "");
    for (const f of d.filesTouched) lines.push(`- ${renderFile(f, opts.vaultNoteBasenames)}`);
    lines.push("");
  }

  return lines.join("\n");
}
