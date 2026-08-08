import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<typeof import("obsidian")>(),
  PluginSettingTab: class {},
}));

import { App, FakeElement, TFile, WorkspaceLeaf } from "obsidian";
import ClaudeCompanionPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/types";
import { InboxView } from "../src/view/InboxView";

interface EnrichmentLifecyclePlugin {
  queueEnrich(file: TFile): void;
  markEnrichRecentlyWritten(path: string): void;
  enrichTimers: Map<string, number>;
  enrichRecentlyWritten: Set<string>;
  enrichRecentlyWrittenExpiryTimers: Map<string, number>;
}

const settle = async (turns = 12): Promise<void> => {
  for (let turn = 0; turn < turns; turn++) await Promise.resolve();
};

function inboxPlugin(app: App, enrichInboxItem: (file: TFile) => Promise<void>): ClaudeCompanionPlugin {
  const plugin = Object.create(ClaudeCompanionPlugin.prototype) as ClaudeCompanionPlugin;
  Object.assign(plugin, {
    app,
    settings: { ...DEFAULT_SETTINGS, sourceCaptureEnabled: true, sourceInboxFolder: "Clippings" },
    enrichInboxItem,
    sourceEnrichmentBackendLabel: () => "Ollama · utility-model",
  });
  return plugin;
}

afterEach(() => vi.useRealTimers());

describe("enrichment lifecycle", () => {
  it("catches a regression that leaves queued enrichment or expiry work alive after unload", () => {
    vi.useFakeTimers();
    const plugin = Object.create(ClaudeCompanionPlugin.prototype) as ClaudeCompanionPlugin;
    const file = new TFile("Clippings/later.md", "Later", 0);
    Object.assign(plugin, {
      utilityLifecycleEnded: false,
      utilityLifecycleGeneration: 0,
      enrichTimers: new Map<string, number>(),
      enrichRecentlyWritten: new Set<string>(),
      enrichRecentlyWrittenExpiryTimers: new Map<string, number>(),
      reindexTimer: null,
      _ontologyReloadTimer: null,
      researchRefreshTimer: null,
      inboxBadgeTimer: null,
    });
    const lifecycle = plugin as unknown as EnrichmentLifecyclePlugin;

    lifecycle.queueEnrich(file);
    lifecycle.markEnrichRecentlyWritten(file.path);
    expect(vi.getTimerCount()).toBe(2);

    plugin.onunload();
    lifecycle.markEnrichRecentlyWritten("Clippings/stale.md");
    vi.runAllTimers();

    expect(lifecycle.enrichTimers.size).toBe(0);
    expect(lifecycle.enrichRecentlyWrittenExpiryTimers.size).toBe(0);
    expect(lifecycle.enrichRecentlyWritten.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("catches a regression that reports an Inbox enrichment failure only through a Notice", async () => {
    const app = new App();
    app.vault.seed("Clippings/failed.md", "Private clip");
    const plugin = inboxPlugin(app, async () => { throw new Error("remote model unavailable"); });
    const view = new InboxView(new WorkspaceLeaf(app), plugin);

    await view.render();
    const button = (view.contentEl as unknown as FakeElement).querySelector(".cc-inbox-enrich");
    button?.dispatchEvent({ type: "click" });
    await settle();

    const status = (view.contentEl as unknown as FakeElement).querySelector(".cc-inbox-enrichment-status");
    expect(status?.textContent).toContain("remote model unavailable");
    expect(status?.classList.has("cc-inbox-enrichment-error")).toBe(true);
  });

  it("catches a regression that leaves an Inbox batch locked after one file fails", async () => {
    const app = new App();
    app.vault.seed("Clippings/failed.md", "Private clip");
    app.vault.seed("Clippings/next.md", "Another clip");
    let calls = 0;
    const plugin = inboxPlugin(app, async () => {
      if (++calls === 1) throw new Error("remote model unavailable");
    });
    const view = new InboxView(new WorkspaceLeaf(app), plugin);

    await view.render();
    const button = (view.contentEl as unknown as FakeElement).querySelector(".cc-inbox-enrich-all");
    button?.dispatchEvent({ type: "click" });
    await settle(32);

    const retry = (view.contentEl as unknown as FakeElement).querySelector(".cc-inbox-enrich-all");
    expect(retry?.disabled).toBe(false);
    expect((view.contentEl as unknown as FakeElement).querySelector(".cc-inbox-enrichment-status")?.textContent)
      .toContain("remote model unavailable");
  });
});
