import { describe, expect, it } from "vitest";
import { App } from "obsidian";
import { collapseMerges, planTagMerges } from "../../src/optimize/mergePlan";
import { applyNoteMerge, noteTagInput, writeOptimizeRunNote } from "../../src/optimize/vaultGlue";

function seeded(content: string, fmTags: unknown) {
  const app = new App();
  const inline: Array<{ tag: string; start: number; end: number }> = [];
  for (const m of content.matchAll(/#([A-Za-z0-9_/-]+)/g)) inline.push({ tag: m[1] as string, start: m.index as number, end: (m.index as number) + m[0].length });
  const file = app.vault.seed("N.md", content, { frontmatter: { tags: fmTags }, inlineTags: inline });
  return { app: app as never as import("obsidian").App, file };
}

const read = async (app: App, path: string) => (app.vault.getAbstractFileByPath(path) as unknown as { _content: string })._content;

describe("noteTagInput", () => {
  it("reads tags and tag (array or comma/space string) plus inline positions", () => {
    const content = "---\ntags:\n  - llms\n---\nbody #LLMs end\n";
    const { app } = seeded(content, ["llms"]);
    const input = noteTagInput(app, "N.md");
    expect(input?.frontmatterTags).toEqual(["llms"]);
    expect(input?.inline).toEqual([{ tag: "LLMs", start: content.indexOf("#LLMs"), end: content.indexOf("#LLMs") + 5 }]);
    const str = seeded("x", "a, b c");
    expect(noteTagInput(str.app, "N.md")?.frontmatterTags).toEqual(["a", "b", "c"]);
  });

  it("returns null for a missing note", () => {
    expect(noteTagInput(new App() as never, "nope.md")).toBeNull();
  });
});

describe("applyNoteMerge", () => {
  it("merges [llms, llm] to one llm, rewrites #LLMs inline, leaves #ai/agents", async () => {
    const content = "---\ntags:\n  - llms\n  - llm\n  - Keep_Me\n---\nabout #LLMs and #ai/agents\n";
    const { app } = seeded(content, ["llms", "llm", "Keep_Me"]);
    const { map } = collapseMerges([{ from: "llms", to: "llm" }, { from: "ai", to: "artificial-intelligence" }]);
    const [plan] = planTagMerges(map, [noteTagInput(app, "N.md")!]);
    const result = await applyNoteMerge(app, plan!, map);
    expect(result).toEqual({ inlineApplied: 1, inlineSkipped: 0 });
    const out = await read(app as never, "N.md");
    expect(out).toContain("  - \"llm\"\n  - \"Keep_Me\"");
    expect(out.match(/- "llm"/g)).toHaveLength(1);
    expect(out).not.toContain("llms");
    expect(out).toContain("#llm and #ai/agents");
  });

  it("skips and counts an inline occurrence that moved since the cache was read", async () => {
    const content = "---\ntags:\n  - x\n---\nlead #llms\n";
    const { app } = seeded(content, ["x"]);
    const map = new Map([["llms", "llm"]]);
    const input = noteTagInput(app, "N.md")!;
    const file = app.vault.getAbstractFileByPath("N.md") as unknown as { _content: string };
    file._content = `PADDING ${file._content}`;
    const [plan] = planTagMerges(map, [input]);
    expect(await applyNoteMerge(app, plan!, map)).toEqual({ inlineApplied: 0, inlineSkipped: 1 });
    expect(file._content).toContain("#llms");
  });

  it("writes a tag key back only when it changed, keeping a string value a string", async () => {
    const { app } = seeded("---\ntag: llms other\nstatus: open\n---\nbody\n", undefined);
    (app.vault as never as { frontmatters: Map<string, unknown> }).frontmatters.set("N.md", { tag: "llms other" });
    const map = new Map([["llms", "llm"]]);
    const [plan] = planTagMerges(map, [noteTagInput(app, "N.md")!]);
    await applyNoteMerge(app, plan!, map);
    const out = await read(app as never, "N.md");
    expect(out).toContain("tag: \"llm, other\"");
    expect(out).toContain("status: \"open\"");
    expect(out).not.toContain("tags:");
  });
});

describe("writeOptimizeRunNote", () => {
  it("creates the note under Claude/Optimize and never overwrites", async () => {
    const app = new App() as never as import("obsidian").App;
    const first = await writeOptimizeRunNote(app, "one", "2026-10-05T10:00:00.000Z");
    const second = await writeOptimizeRunNote(app, "two", "2026-10-05T10:00:00.000Z");
    expect(first).toBe("Claude/Optimize/Tag merges 2026-10-05 1000.md");
    expect(second).not.toBe(first);
    expect(await read(app as never, first)).toBe("one");
  });
});
