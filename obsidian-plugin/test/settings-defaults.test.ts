import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, normalizeDiscoverySettings } from "../src/types";

describe("source-capture defaults", () => {
  it("ships dormant (opt-in) with a default inbox", () => {
    expect(DEFAULT_SETTINGS.sourceCaptureEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.sourceEnrichOnCreate).toBe(true);
    expect(DEFAULT_SETTINGS.sourceInboxFolder).toBe("Clippings");
    expect(DEFAULT_SETTINGS.sourceBaseTags).toEqual(["source"]);
    expect(DEFAULT_SETTINGS.sourceSchemaOverrides).toEqual({});
  });
});

describe("memory settings defaults", () => {
  it("ships sane defaults", () => {
    expect(DEFAULT_SETTINGS.memoryEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.memoryFolder).toBe("Claude/Sessions");
    expect(DEFAULT_SETTINGS.memoryIngestOnSave).toBe(false);
    expect(DEFAULT_SETTINGS.memoryBaseTags).toEqual(["claude", "session"]);
  });
  it("has a plans folder default", () => {
    expect(DEFAULT_SETTINGS.planFolder).toBe("Claude/Plans");
  });
  it("defaults max tokens to 20k for headroom", () => {
    expect(DEFAULT_SETTINGS.maxTokens).toBe(20000);
  });
  it("opens artifacts in Obsidian by default", () => {
    expect(DEFAULT_SETTINGS.artifactOpenTarget).toBe("obsidian");
  });
});

describe("agent mode defaults", () => {
  it("agent mode ships on, writes off, 10 iterations (spec 2026-07-05, Franco-approved)", () => {
    expect(DEFAULT_SETTINGS.agentModeEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.agentAllowWrites).toBe(false);
    expect(DEFAULT_SETTINGS.agentMaxIterations).toBe(10);
  });
});

describe("memory consolidation defaults", () => {
  it("auto-consolidate ships off (utility-model cost is opt-in)", () => {
    expect(DEFAULT_SETTINGS.memoryAutoConsolidate).toBe(false);
  });
});

describe("ontology defaults", () => {
  it("ships dormant with the Ontology folder (spec 2026-07-08)", () => {
    expect(DEFAULT_SETTINGS.ontologyEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.ontologyFolder).toBe("Ontology");
  });
});

describe("embedding engine defaults", () => {
  it("built-in engine is the default; semantic search stays opt-in (spec 2026-07-09)", () => {
    expect(DEFAULT_SETTINGS.embeddingEngine).toBe("builtin");
    expect(DEFAULT_SETTINGS.semanticEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.embeddingModel).toBe("nomic-embed-text"); // still the Ollama model
  });
});

describe("research intelligence defaults", () => {
  it("defaults research intelligence to the current chat backend", () => {
    expect(DEFAULT_SETTINGS.intelligenceNarrator).toBe("current");
  });
});

describe("scholarly discovery settings", () => {
  it("ships the exact discovery defaults", () => {
    expect(DEFAULT_SETTINGS).toEqual(expect.objectContaining({
      discoveryEnabled: true,
      openAlexContactEmail: "",
      discoveryReranker: "current",
      discoveryMaxResults: 20,
      discoveryExpansionLimit: 20,
      discoveryCacheHours: 24,
    }));
  });

  it("clamps boundaries and repairs corrupt numbers", () => {
    expect(normalizeDiscoverySettings({ discoveryMaxResults: 4, discoveryExpansionLimit: 51, discoveryCacheHours: 0 }))
      .toEqual({ discoveryMaxResults: 5, discoveryExpansionLimit: 50, discoveryCacheHours: 1 });
    expect(normalizeDiscoverySettings({ discoveryMaxResults: 101, discoveryExpansionLimit: 4, discoveryCacheHours: 169 }))
      .toEqual({ discoveryMaxResults: 100, discoveryExpansionLimit: 5, discoveryCacheHours: 168 });
    expect(normalizeDiscoverySettings({ discoveryMaxResults: Number.NaN, discoveryExpansionLimit: Infinity, discoveryCacheHours: -Infinity }))
      .toEqual({ discoveryMaxResults: 20, discoveryExpansionLimit: 20, discoveryCacheHours: 24 });
    expect(normalizeDiscoverySettings({ discoveryMaxResults: 12.9, discoveryExpansionLimit: 21.7, discoveryCacheHours: 8.4 }))
      .toEqual({ discoveryMaxResults: 12, discoveryExpansionLimit: 21, discoveryCacheHours: 8 });
  });
});
