import { describe, expect, it, vi } from "vitest";
import { formatApplyNotice, type ApplyResult, OptimizeController, type OptimizeDeps } from "../../src/optimize/controller";
import { tagId } from "../../src/tags/vocabulary";
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
    rewriteNote: async (plan, map) => {
      rewritten.push(plan.path);
      const changed = new Set(plan.inline.map((e) => e.from));
      for (const t of plan.before) if (map.has(tagId(t))) changed.add(tagId(t));
      return { inlineApplied: plan.inline.length, inlineSkipped: 0, changed: [...changed] };
    },
    orderTagTriggers: () => [],
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

describe("OptimizeController tag identity", () => {
  const many = (tag: string, n: number, prefix: string) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}.md`, { fm: [tag] }]));

  it("pairs emoji tags by their own spelling", async () => {
    const { controller } = setup({}, { ...many("📚book", 4, "b"), ...many("📚books", 1, "s") });
    const report = await controller.scan();
    expect(report.candidates).toMatchObject([{ from: "📚books", to: "📚book", evidence: ["plural"] }]);
  });

  it("does not pair unrelated non-latin tags", async () => {
    const { controller } = setup({}, { ...many("हिंदी", 3, "h"), ...many("हद", 1, "d") });
    expect((await controller.scan()).candidates).toEqual([]);
  });

  it("keeps a numeric-looking tag's own spelling", async () => {
    const { controller } = setup({}, { ...many("2024-01", 3, "h"), ...many("2024_01", 1, "d") });
    expect((await controller.scan()).candidates).toMatchObject([{ from: "2024_01", to: "2024-01" }]);
  });

  it("every candidate side is the tagId of some entry tag", async () => {
    const notes = { ...many("📚book", 4, "b"), ...many("#LLMs", 1, "l"), ...many("llm", 3, "m"), ...many("2024_01", 1, "d"), ...many("2024-01", 3, "e") };
    const { controller } = setup({}, notes);
    const ids = new Set(["📚book", "llms", "llm", "2024_01", "2024-01"]);
    const report = await controller.scan();
    expect(report.candidates.length).toBeGreaterThan(0);
    for (const c of report.candidates) {
      expect(ids.has(c.from)).toBe(true);
      expect(ids.has(c.to)).toBe(true);
    }
  });

  it("plans the written spelling for a merge selected from the scan", async () => {
    const plans: string[][] = [];
    const { controller } = setup(
      {
        noteTags: (path) => ({ path, frontmatterTags: ["📚books"], inline: [] }),
        rewriteNote: async (plan) => {
          plans.push(plan.after);
          return { inlineApplied: 0, inlineSkipped: 0, changed: ["📚books"] };
        },
      },
      { "s0.md": { fm: ["📚books"] } },
    );
    await controller.apply([{ from: "📚books", to: "📚book" }]);
    expect(plans).toEqual([["📚book"]]);
  });
});

describe("OptimizeController.apply", () => {
  it("rewrites the union of the from-tags' notes, writes one run note, reports counts", async () => {
    const { controller, rewritten, writes } = setup({}, NOTES);
    const result = await controller.apply([{ from: "llms", to: "llm" }]);
    expect(rewritten.sort()).toEqual(["a.md", "c.md"]);
    expect(result).toMatchObject({ merges: 1, notes: 2, inlineSkipped: 0, failed: [], unchanged: 0, dropped: [], orders: [], runNote: "Claude/Optimize/run.md" });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.now).toBe("2026-10-05T10:00:00.000Z");
    expect(writes[0]?.content).toContain("`llms` → `llm`");
  });

  it("sums skipped inline occurrences", async () => {
    const { controller } = setup({ rewriteNote: async () => ({ inlineApplied: 0, inlineSkipped: 2, changed: ["llms"] }) }, NOTES);
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
    expect(result.dropped.sort()).toEqual(["x", "y"]);
    expect(rewritten).toEqual(["a.md"]);
  });
});

describe("OptimizeController.apply results", () => {
  const empty = async () => ({ inlineApplied: 0, inlineSkipped: 0, changed: [] as string[] });
  const inlineNotes = {
    "a.md": { fm: ["x"], inline: [{ tag: "llms", start: 0, end: 5 }] },
    "b.md": { fm: ["x"], inline: [{ tag: "llms", start: 0, end: 5 }] },
  };

  it("counts only what was really written", async () => {
    const { controller, writes } = setup({ rewriteNote: empty }, inlineNotes);
    const result = await controller.apply([{ from: "llms", to: "llm" }]);
    expect(result).toMatchObject({ merges: 0, notes: 0, unchanged: 2, runNote: null });
    expect(writes).toEqual([]);
  });

  it("keeps going when one note throws and lists it without a wikilink", async () => {
    const notes = { "a.md": { fm: ["llms"] }, "b.md": { fm: ["llms"] }, "c.md": { fm: ["llms"] } };
    const done: string[] = [];
    const { controller, writes } = setup({
      rewriteNote: async (plan) => {
        if (plan.path === "b.md") throw new Error("locked");
        done.push(plan.path);
        return { inlineApplied: 0, inlineSkipped: 0, changed: ["llms"] };
      },
    }, notes);
    const result = await controller.apply([{ from: "llms", to: "llm" }]);
    expect(done.sort()).toEqual(["a.md", "c.md"]);
    expect(result).toMatchObject({ notes: 2, failed: ["b.md"] });
    const note = writes[0]?.content ?? "";
    expect(note).toContain("## Not rewritten");
    expect(note).toContain("`b.md`");
    expect(note).not.toContain("[[b");
  });

  it("lists a note whose tags cannot be read as failed", async () => {
    const { controller } = setup({ noteTags: () => null }, NOTES);
    expect((await controller.apply([{ from: "llms", to: "llm" }])).failed.sort()).toEqual(["a.md", "c.md"]);
  });

  it("resolves with runNote null when the run note write throws", async () => {
    const { controller } = setup({ writeRunNote: async () => { throw new Error("disk"); } }, NOTES);
    const result = await controller.apply([{ from: "llms", to: "llm" }]);
    expect(result).toMatchObject({ notes: 2, runNote: null });
  });

  it("reports every dropped merge and names it in the notice", async () => {
    const { controller } = setup({}, { "a.md": { fm: ["a"] } });
    const result = await controller.apply([
      { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }, { from: "x", to: "a" },
    ]);
    expect([...result.dropped].sort()).toEqual(["a", "b", "c", "x"]);
    expect(formatApplyNotice(result)).toContain("4 merges dropped (cycle: ");
  });

  it("reports standing orders that trigger on a merged tag", async () => {
    const { controller, writes } = setup({
      orderTagTriggers: () => [{ path: "Claude/Templates/Meet.md", tag: "meetings" }, { path: "Claude/Templates/Other.md", tag: "other" }],
    }, { "a.md": { fm: ["meetings"] } });
    const result = await controller.apply([{ from: "meetings", to: "meeting" }]);
    expect(result.orders).toEqual(["Claude/Templates/Meet.md"]);
    expect(writes[0]?.content).toContain("## Standing orders that trigger on a merged tag");
    expect(writes[0]?.content).toContain("[[Claude/Templates/Meet]] — `meetings`");
    expect(formatApplyNotice(result)).toContain("1 standing order triggers on a merged tag");
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
    const r: ApplyResult = { merges: 3, notes: 7, inlineSkipped: 0, failed: [], unchanged: 0, dropped: [], orders: [], runNote: null };
    expect(formatApplyNotice(r)).toBe("Merged 3 tags across 7 notes");
    expect(formatApplyNotice({ ...r, inlineSkipped: 2 })).toBe("Merged 3 tags across 7 notes, 2 inline tags skipped");
    expect(formatApplyNotice({ ...r, merges: 1, notes: 1, inlineSkipped: 1, failed: ["a"], unchanged: 1, dropped: ["a"], orders: ["o"] })).toBe(
      "Merged 1 tag across 1 note, 1 inline tag skipped, 1 note failed, 1 note left unchanged, 1 merge dropped (cycle: a), 1 standing order triggers on a merged tag",
    );
    expect(formatApplyNotice({ ...r, merges: 2, notes: 2, inlineSkipped: 2, failed: ["a", "b"], unchanged: 2, dropped: ["a", "b"], orders: ["o", "p"] })).toBe(
      "Merged 2 tags across 2 notes, 2 inline tags skipped, 2 notes failed, 2 notes left unchanged, 2 merges dropped (cycle: a, b), 2 standing orders trigger on a merged tag",
    );
    expect(formatApplyNotice({ ...r, merges: 0, notes: 0 })).toBe("Merged 0 tags across 0 notes");
  });
});
});
