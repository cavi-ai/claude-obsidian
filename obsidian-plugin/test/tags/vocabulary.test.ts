import { describe, it, expect } from "vitest";
import { buildVocabulary, selectPromptTags } from "../../src/tags/vocabulary";

describe("buildVocabulary", () => {
  it("keys by normalized tag and counts distinct notes", () => {
    const vocab = buildVocabulary([
      { path: "a.md", tags: ["LLM", "llm", "Machine Learning"] },
      { path: "b.md", tags: ["#llm"] },
      { path: "c.md", tags: ["", "  "] },
    ]);
    expect(vocab.get("llm")).toEqual({ tag: "llm", count: 2, notes: ["a.md", "b.md"] });
    expect(vocab.get("machine-learning")?.count).toBe(1);
    expect(vocab.has("")).toBe(false);
    expect(vocab.size).toBe(2);
  });
});

describe("selectPromptTags", () => {
  const vocab = buildVocabulary([
    { path: "1", tags: ["rust", "zeta", "alpha"] },
    { path: "2", tags: ["rust", "zeta"] },
    { path: "3", tags: ["rust", "machine-learning", "ai/agents"] },
    { path: "4", tags: ["beta"] },
  ]);

  it("puts tags whose words all occur in the content first, then fills by count", () => {
    const out = selectPromptTags(vocab, "Notes on Machine learning and AI agents", 4);
    expect(out.slice(0, 2)).toEqual(["ai/agents", "machine-learning"]);
    expect(out).toEqual(["ai/agents", "machine-learning", "rust", "zeta"]);
  });

  it("caps matched tags at limit / 2 and never duplicates", () => {
    const out = selectPromptTags(vocab, "rust zeta alpha beta", 4);
    expect(out).toEqual(["rust", "zeta", "ai/agents", "alpha"]);
    expect(new Set(out).size).toBe(out.length);
  });

  it("matches whole words only", () => {
    const out = selectPromptTags(vocab, "trusted", 2);
    expect(out).toEqual(["rust", "zeta"]);
  });
});
