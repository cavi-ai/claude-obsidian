import { normalizeTag } from "../indexing/frontmatter";
import { buildVocabulary } from "../tags/vocabulary";
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
  rewriteNote(plan: NoteMergePlan, map: ReadonlyMap<string, string>): Promise<{ inlineApplied: number; inlineSkipped: number }>;
  writeRunNote(content: string, now: string): Promise<string>;
  getState(): OptimizeState;
  setState(next: OptimizeState): Promise<void>;
  now(): string;
}

export interface ApplyResult {
  merges: number;
  notes: number;
  inlineSkipped: number;
  cycles: string[][];
  runNote: string | null;
}

export class OptimizeController {
  constructor(private deps: OptimizeDeps) {}

  async scan(opts: { semantic?: boolean } = {}): Promise<TagScanReport> {
    const vocab = buildVocabulary(this.deps.tagEntries());
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
    return scanTags({ vocab, centroid, dismissed: new Set(this.deps.getState().dismissed) });
  }

  async apply(merges: Array<{ from: string; to: string }>): Promise<ApplyResult> {
    const { map, cycles } = collapseMerges(merges);
    const vocab = buildVocabulary(this.deps.tagEntries());
    const paths = new Set<string>();
    for (const from of map.keys()) for (const path of vocab.get(from)?.notes ?? []) paths.add(path);
    const inputs: NoteTagInput[] = [];
    for (const path of paths) {
      const input = this.deps.noteTags(path);
      if (input) inputs.push(input);
    }
    const plans = planTagMerges(map, inputs);
    const byMerge = new Map<string, string[]>();
    let inlineSkipped = 0;
    for (const plan of plans) {
      const touched = new Set<string>();
      for (const tag of plan.before) {
        const key = normalizeTag(tag);
        if (map.has(key)) touched.add(key);
      }
      for (const edit of plan.inline) touched.add(edit.from);
      for (const from of touched) byMerge.set(from, [...(byMerge.get(from) ?? []), plan.path]);
      inlineSkipped += (await this.deps.rewriteNote(plan, map)).inlineSkipped;
    }
    let runNote: string | null = null;
    if (plans.length > 0) {
      const applied = [...byMerge].map(([from, notePaths]) => ({ from, to: map.get(from) as string, paths: notePaths }));
      const now = this.deps.now();
      runNote = await this.deps.writeRunNote(renderRunNote(applied, now), now);
    }
    return { merges: byMerge.size, notes: plans.length, inlineSkipped, cycles, runNote };
  }

  async dismiss(id: string): Promise<void> {
    const state = this.deps.getState();
    await this.deps.setState(normalizeOptimizeState({ dismissed: [...state.dismissed, id] }));
  }
}
