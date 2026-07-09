import { describe, it, expect } from "vitest";
import { OllamaEmbedder, embedderId } from "../../src/semantic/embedder";
import { BUILTIN_EMBEDDING_MODEL } from "../../src/semantic/transformers/model";

describe("embedderId", () => {
  it("ollama keeps the raw model name — existing indexes stay valid", () => {
    expect(embedderId("ollama", "nomic-embed-text")).toBe("nomic-embed-text");
  });
  it("builtin uses the pinned prefixed id", () => {
    expect(embedderId("builtin", "nomic-embed-text")).toBe(BUILTIN_EMBEDDING_MODEL.id);
  });
});

describe("OllamaEmbedder", () => {
  it("delegates to the injected embed fn with its model", async () => {
    const calls: Array<{ model: string; input: string[] }> = [];
    const e = new OllamaEmbedder("nomic-embed-text", (model, input) => {
      calls.push({ model, input });
      return Promise.resolve([[0.1]]);
    });
    expect(e.id).toBe("nomic-embed-text");
    await expect(e.embed(["hi"])).resolves.toEqual([[0.1]]);
    expect(calls).toEqual([{ model: "nomic-embed-text", input: ["hi"] }]);
  });
});
