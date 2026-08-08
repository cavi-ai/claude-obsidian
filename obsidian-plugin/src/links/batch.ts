// Batch link planning and application: build reviewable per-note link plans,
// then apply the selected hunks while isolating stale or failed files.

import { applyPlan, planEdits, type EditPlan } from "../edit/diff";
import { mentionEdits } from "./suggest";
import { findUnlinkedMentions, type LinkCandidate } from "./unlinkedMentions";

export interface BatchLinkEntry {
  path: string;
  basename: string;
  content: string;
}

export interface BatchLinkPlan {
  path: string;
  basename: string;
  original: string;
  plan: EditPlan;
}

export type BatchLinkSelection = boolean[][];

export interface BatchLinkApplyResult {
  appliedFiles: number;
  appliedHunks: number;
  conflicts: string[];
  failures: Array<{ path: string; message: string }>;
}

/** Build one reviewable edit plan per note with at least one usable mention. */
export function planBatchLinks(entries: BatchLinkEntry[], candidates: LinkCandidate[]): BatchLinkPlan[] {
  const plans: BatchLinkPlan[] = [];
  for (const entry of entries) {
    const mentions = findUnlinkedMentions(entry.content, candidates, entry.path);
    const edits = mentionEdits(entry.content, mentions);
    if (edits.length === 0) continue;
    plans.push({
      path: entry.path,
      basename: entry.basename,
      original: entry.content,
      plan: planEdits(entry.content, edits),
    });
  }
  return plans.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Apply selected plans independently. A note that changed after review is a
 * conflict, while read, planning, or write errors are recorded per file.
 */
export async function applyBatchLinkPlans(
  plans: BatchLinkPlan[],
  selected: BatchLinkSelection,
  deps: { read(path: string): Promise<string>; write(path: string, content: string): Promise<void> },
): Promise<BatchLinkApplyResult> {
  const result: BatchLinkApplyResult = { appliedFiles: 0, appliedHunks: 0, conflicts: [], failures: [] };

  for (let i = 0; i < plans.length; i++) {
    const item = plans[i]!;
    const accepted = selected[i] ?? [];
    if (!accepted.some(Boolean)) continue;

    try {
      const current = await deps.read(item.path);
      if (current !== item.original) {
        result.conflicts.push(item.path);
        continue;
      }
      const next = applyPlan(current, item.plan, accepted);
      await deps.write(item.path, next);
      result.appliedFiles++;
      result.appliedHunks += accepted.filter(Boolean).length;
    } catch (error) {
      result.failures.push({ path: item.path, message: error instanceof Error ? error.message : String(error) });
    }
  }

  return result;
}
