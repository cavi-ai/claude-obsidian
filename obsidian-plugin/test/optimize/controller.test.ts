import { describe, expect, it, vi } from "vitest";
import { formatApplyNotice, OptimizeController, type OptimizeDeps } from "../../src/optimize/controller";
import { pairKey } from "../../src/optimize/tagScan";
import type { NoteTagInput } from "../../src/optimize/mergePlan";

function setup(over: Partial<OptimizeDeps> = {}, notes: Record<string, { fm: string[]; inline?: Array<{ tag: string; start: number; end: number }> }> = {}) {
  let state = { dismissed: [] as string[] };
  const rewritten: string[] = [];
  const writes: Array<{ content: string; now: string }> = [];
  const entries = Object.entries(notes).map(([path, n]) => ({ path, tags: [...n.fm, ...(n.inline ?? []).map((i) => i.tag)] }));
  const deps: OptimizeDeps = {
    tagEntries: () => entries,
    noteVectors: async () => null,
    noteTags: (path): NoteTagInput | null => {
      const n = notes[path];
      return n ? { path, frontmatterTags: n.fm, inline: n.inline ?? [] } : null;
    },
    rewriteNote: async (plan) => {
      rewritten.push(plan.path);
      return { inlineApplied: plan.inline.length, inlineSkipped: 0 };
    },
    writeRunNote: async (content, now) => {
      writes.push({ content, now });
      return "Claude/Optimize/run.md";
    },
    getState: () => state,
    setState: async (next) => {
      state = next;
    },
    now: () => "2026-10-05T10:00:00.000Z",
    ...over,
  };
  return { controller: new OptimizeController(deps), rewritten, writes, getState: () => state };
}

const NOTES = {
  "a.md": { fm: ["llms", "llm"] },
  "b.md": { fm: ["llm"] },
  "c.md": { fm: ["x"], inline: [{ tag: "llms", start: 0, end: 5 }] },
};

describe("OptimizeController.scan", () => {
  it("returns name-based candidates when the index is missing, empty, or throws, and never errors", async () => {
    for (const noteVectors of [async () => null, async () => () => null, async () => { throw new Error("boom"); }]) {
      const { controller } = setup({ noteVectors }, NOTES);
      const report = await controller.scan();
      expect(report.candidates.map((c) => c.id)).toEqual([pairKey("llm", "llms")]);
    }
  });

  it("skips noteVectors when semantic is false", async () => {
    const noteVectors = vi.fn(async () => null);
    const { controller } = setup({ noteVectors }, NOTES);
    await controller.scan({ semantic: false });
    expect(noteVectors).not.toHaveBeenCalled();
  });

  it("adds semantic candidates from note vectors only when semantic is on", async () => {
    const vecs: Record<string, number[]> = { "a.md": [1, 0], "b.md": [1, 0.01], "c.md": [1, 0.02], "d.md": [1, 0.015] };
    const notes = { "a.md": { fm: ["machine-learning"] }, "b.md": { fm: ["machine-learning"] }, "c.md": { fm: ["machine-learning"] }, "d.md": { fm: ["ml"] } };
    const { controller } = setup({ noteVectors: async () => (p) => vecs[p] ?? null }, notes);
    const on = await controller.scan();
    expect(on.candidates).toMatchObject([{ from: "ml", to: "machine-learning", evidence: ["semantic"] }]);
    expect((await controller.scan({ semantic: false })).candidates).toEqual([]);
  });

  it("honors persisted dismissals", async () => {
    const { controller } = setup({}, NOTES);
    await controller.dismiss(pairKey("llm", "llms"));
    expect((await controller.scan()).candidates).toEqual([]);
  });
});

describe("OptimizeController.apply", () => {
  it("rewrites the union of the from-tags' notes, writes one run note, reports counts", async () => {
    const { controller, rewritten, writes } = setup({}, NOTES);
    const result = await controller.apply([{ from: "llms", to: "llm" }]);
    expect(rewritten.sort()).toEqual(["a.md", "c.md"]);
    expect(result).toMatchObject({ merges: 1, notes: 2, inlineSkipped: 0, cycles: [], runNote: "Claude/Optimize/run.md" });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.now).toBe("2026-10-05T10:00:00.000Z");
    expect(writes[0]?.content).toContain("`llms` → `llm`");
  });

  it("sums skipped inline occurrences", async () => {
    const { controller } = setup({ rewriteNote: async () => ({ inlineApplied: 0, inlineSkipped: 2 }) }, NOTES);
    expect((await controller.apply([{ from: "llms", to: "llm" }])).inlineSkipped).toBe(4);
  });

  it("writes no run note and touches nothing when no note changes", async () => {
    const { controller, rewritten, writes } = setup({}, NOTES);
    const result = await controller.apply([{ from: "nothing", to: "llm" }]);
    expect(result).toMatchObject({ merges: 0, notes: 0, runNote: null });
    expect(rewritten).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("collapses a chain and reports a cycle without applying it", async () => {
    const { controller, rewritten } = setup({}, { "a.md": { fm: ["a"] }, "b.md": { fm: ["x"] }, "c.md": { fm: ["y"] } });
    const result = await controller.apply([
      { from: "a", to: "b" }, { from: "b", to: "c" },
      { from: "x", to: "y" }, { from: "y", to: "x" },
    ]);
    expect(result.cycles).toEqual([["x", "y"]]);
    expect(rewritten).toEqual(["a.md"]);
  });
});

describe("OptimizeController.dismiss", () => {
  it("writes only plugin state, never a note", async () => {
    const { controller, rewritten, writes, getState } = setup({}, NOTES);
    await controller.dismiss("a|b");
    await controller.dismiss("a|b");
    expect(getState().dismissed).toEqual(["a|b"]);
    expect(rewritten).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("scan alone writes nothing", async () => {
    const { controller, rewritten, writes } = setup({}, NOTES);
    await controller.scan();
    expect(rewritten).toEqual([]);
    expect(writes).toEqual([]);
  });

describe("formatApplyNotice", () => {
  it("adds the skipped inline count only when there is one", () => {
    const r = { merges: 3, notes: 7, inlineSkipped: 0, cycles: [], runNote: null };
    expect(formatApplyNotice(r)).toBe("Merged 3 tags across 7 notes");
    expect(formatApplyNotice({ ...r, inlineSkipped: 2 })).toBe("Merged 3 tags across 7 notes, 2 inline tags skipped");
  });
});
});
