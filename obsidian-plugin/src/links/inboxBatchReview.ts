import {
  applyBatchLinkPlans,
  planBatchLinks,
  type BatchLinkApplyResult,
  type BatchLinkEntry,
  type BatchLinkPlan,
  type BatchLinkSelection,
} from "./batch";
import type { LinkCandidate } from "./unlinkedMentions";

export interface InboxBatchFile {
  path: string;
  basename: string;
  extension: string;
}

export interface InboxBatchReviewDeps<File extends InboxBatchFile> {
  read(file: File): Promise<string>;
  getFile(path: string): File | null;
  write(file: File, content: string): Promise<void>;
  select(plans: BatchLinkPlan[]): Promise<BatchLinkSelection | null>;
}

/**
 * Plans and applies an Inbox link batch while isolating initial read and plan
 * failures. A bad Inbox file must never prevent a readable sibling from being
 * reviewed and applied.
 */
export async function reviewInboxBatchLinks<File extends InboxBatchFile>(
  files: File[],
  candidates: LinkCandidate[],
  deps: InboxBatchReviewDeps<File>,
): Promise<BatchLinkApplyResult | null> {
  const failures: BatchLinkApplyResult["failures"] = [];
  const entries: BatchLinkEntry[] = [];

  for (const file of files) {
    if (file.extension !== "md") continue;
    try {
      entries.push({ path: file.path, basename: file.basename, content: await deps.read(file) });
    } catch (error) {
      failures.push({ path: file.path, message: error instanceof Error ? error.message : String(error) });
    }
  }

  const plans: BatchLinkPlan[] = [];
  for (const entry of entries) {
    try {
      plans.push(...planBatchLinks([entry], candidates));
    } catch (error) {
      failures.push({ path: entry.path, message: error instanceof Error ? error.message : String(error) });
    }
  }
  plans.sort((a, b) => a.path.localeCompare(b.path));

  const empty: BatchLinkApplyResult = { appliedFiles: 0, appliedHunks: 0, conflicts: [], failures };
  if (plans.length === 0) return empty;

  const selected = await deps.select(plans);
  if (!selected) return failures.length > 0 ? empty : null;

  const applied = await applyBatchLinkPlans(plans, selected, {
    read: async (path) => {
      const file = deps.getFile(path);
      if (!file) throw new Error(`Note no longer exists: ${path}`);
      return deps.read(file);
    },
    write: async (path, content) => {
      const file = deps.getFile(path);
      if (!file) throw new Error(`Note no longer exists: ${path}`);
      await deps.write(file, content);
    },
  });
  return { ...applied, failures: [...failures, ...applied.failures] };
}
