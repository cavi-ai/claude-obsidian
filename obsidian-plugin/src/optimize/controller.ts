import { buildVocabulary, tagId } from "../tags/vocabulary";
import {
  collapseMerges,
  planTagMerges,
  renderRunNote,
  type NoteMergePlan,
  type NoteTagInput,
} from "./mergePlan";
import { normalizeOptimizeState, type OptimizeState } from "./state";
import { tagCentroids } from "./tagCentroids";
import { scanTags, type TagScanReport } from "./tagScan";

export interface OptimizeDeps {
  tagEntries(): Array<{ path: string; tags: string[] }>;
  noteVectors(): Promise<((path: string) => number[] | null) | null>;
  noteTags(path: string): NoteTagInput | null;
  rewriteNote(plan: NoteMergePlan, map: ReadonlyMap<string, string>): Promise<{ inlineApplied: number; inlineSkipped: number; changed: string[] }>;
  orderTagTriggers(): Array<{ path: string; tag: string }>;
  writeRunNote(content: string, now: string): Promise<string>;
  getState(): OptimizeState;
  setState(next: OptimizeState): Promise<void>;
  now(): string;
}

export interface ApplyResult {
  merges: number;
  notes: number;
  inlineSkipped: number;
  failed: string[];
  unchanged: number;
  dropped: string[];
  orders: string[];
  runNote: string | null;
}

export function formatApplyNotice(result: ApplyResult): string {
  let text = `Merged ${result.merges} tags across ${result.notes} notes`;
  if (result.inlineSkipped > 0) text += `, ${result.inlineSkipped} inline tags skipped`;
  if (result.failed.length > 0) text += `, ${result.failed.length} notes failed`;
  if (result.unchanged > 0) text += `, ${result.unchanged} notes left unchanged`;
  if (result.dropped.length > 0) text += `, ${result.dropped.length} merges dropped (cycle: ${result.dropped.join(", ")})`;
  if (result.orders.length > 0) text += `, ${result.orders.length} standing orders trigger on a merged tag`;
  return text;
}

export class OptimizeController {
  constructor(private deps: OptimizeDeps) {}

  async scan(opts: { semantic?: boolean } = {}): Promise<TagScanReport> {
    const vocab = buildVocabulary(this.deps.tagEntries(), tagId);
    let centroid: ((tag: string) => number[] | null) | undefined;
    if (opts.semantic !== false) {
      try {
        const noteVector = await this.deps.noteVectors();
        if (noteVector) {
          const memo = new Map<string, number[] | null>();
          centroid = tagCentroids(vocab, (path) => {
            if (!memo.has(path)) memo.set(path, noteVector(path));
            return memo.get(path) ?? null;
          });
        }
      } catch {
        centroid = undefined;
      }
    }
    return scanTags({ vocab, ...(centroid ? { centroid } : {}), dismissed: new Set(this.deps.getState().dismissed) });
  }

  async apply(merges: Array<{ from: string; to: string }>): Promise<ApplyResult> {
    const { map, dropped } = collapseMerges(merges);
    const vocab = buildVocabulary(this.deps.tagEntries(), tagId);
    const paths = new Set<string>();
    for (const from of map.keys()) for (const path of vocab.get(from)?.notes ?? []) paths.add(path);
    const byMerge = new Map<string, string[]>();
    const failed: string[] = [];
    let inlineSkipped = 0;
    let unchanged = 0;
    let notes = 0;
    for (const path of paths) {
      const input = this.deps.noteTags(path);
      if (!input) {
        failed.push(path);
        continue;
      }
      const plan = planTagMerges(map, [input])[0];
      if (!plan) {
        unchanged++;
        continue;
      }
      try {
        const result = await this.deps.rewriteNote(plan, map);
        inlineSkipped += result.inlineSkipped;
        if (result.changed.length === 0) {
          unchanged++;
          continue;
        }
        notes++;
        for (const from of result.changed) byMerge.set(from, [...(byMerge.get(from) ?? []), path]);
      } catch {
        failed.push(path);
      }
    }
    const orders = this.deps.orderTagTriggers().filter((t) => map.has(tagId(t.tag)));
    let runNote: string | null = null;
    if (notes > 0) {
      const applied = [...byMerge].map(([from, notePaths]) => ({ from, to: map.get(from) as string, paths: notePaths }));
      const now = this.deps.now();
      try {
        runNote = await this.deps.writeRunNote(renderRunNote({ applied, failed, orders }, now), now);
      } catch {
        runNote = null;
      }
    }
    return { merges: byMerge.size, notes, inlineSkipped, failed, unchanged, dropped, orders: orders.map((o) => o.path), runNote };
  }

  async dismiss(id: string): Promise<void> {
    const state = this.deps.getState();
    await this.deps.setState(normalizeOptimizeState({ dismissed: [...state.dismissed, id] }));
  }
}
