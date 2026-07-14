import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestUrl } = vi.hoisted(() => ({
  requestUrl: vi.fn(async () => ({ status: 200, headers: {}, text: JSON.stringify({ results: [], meta: {} }) })),
}));
vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<typeof import("obsidian")>(),
  requestUrl,
  FuzzySuggestModal: class {},
  PluginSettingTab: class {},
}));

import ClaudeCompanionPlugin from "../../src/main";
import { DEFAULT_SETTINGS } from "../../src/types";
import type { Provider } from "../../src/providers/types";
import { buildProjectSnapshot } from "../../src/research/graph";

const snapshot = buildProjectSnapshot("P.md", [{
  path: "P.md", title: "P", type: "research-project", project: "P.md", question: "What works?", audience: "Researchers", stage: "reason", status: "active",
}], []);

function provider(id: "anthropic" | "ollama", credentials = true): Provider {
  return {
    id, label: id, hasCredentials: () => credentials,
    stream: async () => undefined,
    complete: vi.fn(async () => JSON.stringify({ order: [] })),
    test: async () => ({ ok: true, detail: "ok" }),
  };
}

function pluginHarness(anthropic = provider("anthropic"), ollama = provider("ollama")): ClaudeCompanionPlugin {
  const plugin = Object.create(ClaudeCompanionPlugin.prototype) as ClaudeCompanionPlugin;
  plugin.settings = { ...DEFAULT_SETTINGS };
  Object.defineProperty(plugin, "router", { value: () => ({ anthropic, ollama, localAvailable: async () => true }) });
  Object.defineProperty(plugin, "researchRepository", { value: () => ({ importSource: vi.fn() }) });
  return plugin;
}

describe("scholarly discovery plugin wiring", () => {
  beforeEach(() => requestUrl.mockClear());

  it("owns one lazy coordinator with live adapter settings and no construction/state network work", async () => {
    const plugin = pluginHarness();
    expect(requestUrl).not.toHaveBeenCalled();
    const coordinator = plugin.discoveryCoordinator();
    expect(plugin.discoveryCoordinator()).toBe(coordinator);
    expect(coordinator.stateFor(snapshot).status).toBe("idle");
    expect(requestUrl).not.toHaveBeenCalled();

    plugin.settings.discoveryMaxResults = 999;
    plugin.settings.openAlexContactEmail = "  person@example.test  ";
    await coordinator.search(snapshot, "query");
    const url = new URL(requestUrl.mock.calls[0]![0].url);
    expect(url.searchParams.get("per-page")).toBe("100");
    expect(url.searchParams.get("mailto")).toBe("person@example.test");
  });

  it("does no discovery work while loading settings or refreshing views", async () => {
    const plugin = pluginHarness();
    Object.defineProperty(plugin, "loadData", { value: async () => ({ settings: { discoveryMaxResults: 999 } }) });
    Object.defineProperty(plugin, "app", { value: { workspace: { getLeavesOfType: () => [] } } });
    await plugin.loadSettings();
    plugin.refreshViews();
    expect(plugin.settings.discoveryMaxResults).toBe(100);
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it("resolves every reranker mode with strict credential gates and disclosed provider/model", () => {
    const anthropic = provider("anthropic");
    const ollama = provider("ollama");
    const plugin = pluginHarness(anthropic, ollama);
    plugin.settings.model = "claude-sonnet-4-6";
    plugin.settings.ollamaModel = "local-model";

    plugin.settings.discoveryReranker = "disabled";
    expect(plugin.discoveryRerankProvider()).toBeUndefined();
    plugin.settings.discoveryReranker = "claude";
    expect(plugin.discoveryRerankProvider()).toEqual({ provider: anthropic, model: "claude-sonnet-4-6" });
    plugin.settings.discoveryReranker = "local";
    expect(plugin.discoveryRerankProvider()).toEqual({ provider: ollama, model: "local-model" });
    plugin.settings.discoveryReranker = "current";
    plugin.settings.chatBackend = "local";
    expect(plugin.discoveryRerankProvider()).toEqual({ provider: ollama, model: "local-model" });
    plugin.settings.chatBackend = "claude";
    expect(plugin.discoveryRerankProvider()).toEqual({ provider: anthropic, model: "claude-sonnet-4-6" });
  });

  it("allows credential fallback only for Current plus Auto", () => {
    const anthropic = provider("anthropic", false);
    const ollama = provider("ollama", true);
    const plugin = pluginHarness(anthropic, ollama);
    plugin.settings.chatBackend = "auto";
    plugin.settings.discoveryReranker = "current";
    expect(plugin.discoveryRerankProvider()).toEqual({ provider: ollama, model: plugin.settings.ollamaModel });
    plugin.settings.discoveryReranker = "claude";
    expect(plugin.discoveryRerankProvider()).toBeUndefined();
    plugin.settings.discoveryReranker = "local";
    expect(plugin.discoveryRerankProvider()?.provider).toBe(ollama);

    const noLocal = pluginHarness(provider("anthropic"), provider("ollama", false));
    noLocal.settings.discoveryReranker = "local";
    expect(noLocal.discoveryRerankProvider()).toBeUndefined();
    noLocal.settings.discoveryReranker = "current";
    noLocal.settings.chatBackend = "auto";
    expect(noLocal.discoveryRerankProvider()?.provider.id).toBe("anthropic");
  });

  it("clears only derived coordinator state and unload cancels, clears, and releases it", () => {
    const plugin = pluginHarness();
    const coordinator = plugin.discoveryCoordinator();
    const cancel = vi.spyOn(coordinator, "cancel");
    const clear = vi.spyOn(coordinator, "clearCache");
    plugin.clearDiscoveryCache();
    expect(clear).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();

    plugin.onunload();
    expect(cancel).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledTimes(2);
    expect(plugin.discoveryCoordinator()).not.toBe(coordinator);
  });
});
