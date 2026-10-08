// Edit with Claude at the cursor: prompt → one buffered completion → inline review. Pure; IO injected by main.ts.

import { INSERT_SYSTEM, REWRITE_PRESETS, REWRITE_SYSTEM, buildInsertUser, buildRewriteUser, parseInsert, parseRewrite, rewriteMaxTokens } from "../edit/rewrite";
import { createRangeSession, type InlineDiffSession } from "./inlineDiffState";
import type { InlinePromptHandle, InlinePromptOptions } from "./inlinePrompt";

export interface CompleteRequest {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  signal: AbortSignal;
}

export interface ModalRewrite {
  selection: string;
  rewritten: string;
  instruction: string;
  from: number;
  to: number;
}

export interface InlineEditDeps {
  path: string;
  inlineDiffEnabled: boolean;
  openPrompt(opts: InlinePromptOptions): InlinePromptHandle;
  complete(req: CompleteRequest): Promise<string>;
  currentDoc(): string;
  review(session: InlineDiffSession): Promise<boolean[] | null>;
  /** The DiffModal path used when inline diff review is off (selection mode only). */
  reviewModal(rewrite: ModalRewrite): Promise<void>;
  notice(message: string): void;
  begin(label: string): { finish(): void; fail(error: unknown): void };
  failureMessage(error: unknown): string;
}

export type InlineEditOutcome = "skipped" | "closed" | "aborted" | "stale" | "applied" | "rejected" | "modal" | "failed";

export const CHANGED_UNDER_EDIT = "The note changed under the edit; nothing was applied.";
export const INSERT_NEEDS_INLINE_DIFF = "Turn on inline diff review to write at the cursor.";

export function inlineEditMenuTitle(hasSelection: boolean): string {
  return hasSelection ? "Rewrite with Claude…" : "Write with Claude at cursor…";
}

export async function runInlineEdit(target: { doc: string; from: number; to: number }, deps: InlineEditDeps): Promise<InlineEditOutcome> {
  const mode = target.from === target.to ? "insert" : "rewrite";
  const selection = target.doc.slice(target.from, target.to);
  if (mode === "rewrite" && selection.trim().length === 0) {
    deps.notice("Select some text to rewrite, or place the cursor to write.");
    return "skipped";
  }
  if (mode === "insert" && !deps.inlineDiffEnabled) {
    deps.notice(INSERT_NEEDS_INLINE_DIFF);
    return "skipped";
  }

  const handle = deps.openPrompt({ mode, from: target.from, to: target.to, presets: REWRITE_PRESETS });
  const instruction = await handle.instruction;
  if (!instruction) return "closed";

  const progress = deps.begin(mode === "insert" ? "Writing at the cursor…" : "Rewriting selection…");
  try {
    const raw = await deps.complete(
      mode === "insert"
        ? { system: INSERT_SYSTEM, user: buildInsertUser(target.doc.slice(0, target.from), target.doc.slice(target.from), instruction), maxTokens: 2000, temperature: 0.3, signal: handle.signal }
        : { system: REWRITE_SYSTEM, user: buildRewriteUser(selection, instruction), maxTokens: rewriteMaxTokens(selection), temperature: 0.3, signal: handle.signal },
    );
    if (handle.signal.aborted) return "aborted";
    const range = handle.range();
    handle.close();
    const doc = deps.currentDoc();
    if (!range || (mode === "rewrite" && doc.slice(range.from, range.to) !== selection)) {
      deps.notice(CHANGED_UNDER_EDIT);
      return "stale";
    }

    if (mode === "insert") {
      const session = createRangeSession(doc, { from: range.from, to: range.from, newText: parseInsert(raw) }, { path: deps.path, description: `Write — ${instruction}` }, { insert: true });
      progress.finish();
      const accepted = await deps.review(session);
      if (accepted) deps.notice("Inserted.");
      return accepted ? "applied" : "rejected";
    }

    const rewritten = parseRewrite(raw, selection);
    progress.finish();
    if (deps.inlineDiffEnabled) {
      const accepted = await deps.review(createRangeSession(doc, { from: range.from, to: range.to, newText: rewritten }, { path: deps.path, description: `Rewrite — ${instruction}` }));
      if (accepted) deps.notice("Rewrite applied.");
      return accepted ? "applied" : "rejected";
    }
    await deps.reviewModal({ selection, rewritten, instruction, from: range.from, to: range.to });
    return "modal";
  } catch (e) {
    if (handle.signal.aborted) return "aborted";
    handle.close();
    progress.fail(e);
    deps.notice(deps.failureMessage(e));
    return "failed";
  } finally {
    progress.finish();
  }
}
