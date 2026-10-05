import { describe, it, expect } from "vitest";
import { buildVocabulary } from "../../src/tags/vocabulary";
import { resolveTags, variantKeys } from "../../src/tags/resolve";

function vocabOf(counts: Record<string, number>) {
  const files: Array<{ path: string; tags: string[] }> = [];
  for (const [tag, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) files.push({ path: `${tag}-${i}.md`, tags: [tag] });
  }
  return buildVocabulary(files);
}

describe("resolveTags", () => {
  it("maps a plural to the singular in the vault", () => {
    expect(resolveTags(["llms"], vocabOf({ llm: 3 }))).toEqual([
      { input: "llms", tag: "llm", match: "variant", via: "plural" },
    ]);
  });

  it("maps separator variants", () => {
    const vocab = vocabOf({ "ai-agents": 2, "machine-learning": 4 });
    expect(resolveTags(["ai_agents", "machinelearning"], vocab)).toEqual([
      { input: "ai_agents", tag: "ai-agents", match: "variant", via: "separator" },
      { input: "machinelearning", tag: "machine-learning", match: "variant", via: "separator" },
    ]);
  });

  it("does not map token-order, prefix, or non-plural pairs", () => {
    const vocab = vocabOf({ "design-system": 2, new: 2, window: 2, clas: 2, "agents/ai": 2 });
    const out = resolveTags(["system-design", "news", "windows", "class", "ai/agents"], vocab);
    expect(out.map((r) => [r.tag, r.match])).toEqual([
      ["system-design", "new"],
      ["news", "new"],
      ["windows", "new"],
      ["class", "new"],
      ["ai/agents", "new"],
    ]);
  });

  it("never singularizes short or invariant words", () => {
    const vocab = vocabOf({ cs: 2, io: 2, aw: 2 });
    expect(resolveTags(["css", "ios", "aws"], vocab).every((r) => r.match === "new")).toBe(true);
    expect(variantKeys("css").plural).toBe("css");
    expect(variantKeys("windows").plural).toBe("windows");
  });

  it("singularizes -ies, -es and plain -s words", () => {
    expect(variantKeys("categories").plural).toBe("category");
    expect(variantKeys("boxes").plural).toBe("box");
    expect(variantKeys("classes").plural).toBe("class");
    expect(variantKeys("class").plural).toBe("class");
    expect(variantKeys("ai/ml-models").plural).toBe("ai/mlmodel");
    expect(variantKeys("ai/ml-models").separator).toBe("ai/mlmodels");
  });

  it("prefers the variant with more notes over an exact match", () => {
    const vocab = vocabOf({ llm: 9, llms: 2 });
    expect(resolveTags(["LLMs"], vocab)).toEqual([{ input: "llms", tag: "llm", match: "variant", via: "plural" }]);
  });

  it("breaks ties by exact, then shorter, then alphabetical", () => {
    expect(resolveTags(["llms"], vocabOf({ llm: 2, llms: 2 }))[0]).toMatchObject({ tag: "llms", match: "exact" });
    expect(resolveTags(["llm"], vocabOf({ "ai-agent": 1, "ai-agents": 1, aiagent: 1 }))).toEqual([
      { input: "llm", tag: "llm", match: "new" },
    ]);
    expect(resolveTags(["ai-agents"], vocabOf({ aiagent: 1, "ai-agent": 1 }))[0].tag).toBe("aiagent");
    expect(resolveTags(["abc"], vocabOf({ "ab-c": 1, "a-bc": 1 }))[0].tag).toBe("a-bc");
  });

  it("writes a tag with no family unchanged as new", () => {
    expect(resolveTags(["Brand New"], vocabOf({ llm: 1 }))).toEqual([{ input: "brand-new", tag: "brand-new", match: "new" }]);
  });

  it("drops empty tags and dedupes by resolved tag in first-seen order", () => {
    const out = resolveTags(["#", "llms", "LLM", "rust"], vocabOf({ llm: 3 }));
    expect(out.map((r) => r.tag)).toEqual(["llm", "rust"]);
  });
});
