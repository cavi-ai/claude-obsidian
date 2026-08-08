import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<typeof import("obsidian")>(),
  PluginSettingTab: class {},
}));

import ClaudeCompanionPlugin from "../../src/main";
import { DEFAULT_SETTINGS } from "../../src/types";
import type { EnrichDeps } from "../../src/sources/enrich";
import { App, FakeElement, getLastOpenedModal, Platform, TFile, WorkspaceLeaf } from "obsidian";
import { ChoiceModal } from "../../src/view/ChoiceModal";
import { ProviderRouter, type ProviderSelection } from "../../src/providers/router";
import { InboxView } from "../../src/view/InboxView";

interface PrivateEnrich {
  enrichDeps(selection: ProviderSelection): EnrichDeps;
  resolvedEnrichDeps(): Promise<EnrichDeps>;
  sourceEnrichmentErrorHint(message: string): string | null;
}

function pluginHarness(completeResolved: ReturnType<typeof vi.fn>): ClaudeCompanionPlugin {
  const plugin = Object.create(ClaudeCompanionPlugin.prototype) as ClaudeCompanionPlugin;
  plugin.settings = { ...DEFAULT_SETTINGS };
  Object.defineProperty(plugin, "router", {
    value: () => ({
      completeResolved,
    }),
  });
  return plugin;
}

function selection(): ProviderSelection {
  return {
    provider: { id: "ollama", label: "Ollama" } as ProviderSelection["provider"],
    model: "utility-model",
  };
}

function mobilePlugin(overrides: Partial<typeof DEFAULT_SETTINGS> = {}): {
  app: App;
  file: TFile;
  plugin: ClaudeCompanionPlugin;
  router: ProviderRouter;
} {
  const app = new App();
  const file = app.vault.seed("Clippings/private.md", "Private note content.");
  app.workspace = {
    getLeaf: () => ({ openFile: async () => undefined }),
    getLeavesOfType: () => [],
  } as never;
  const plugin = Object.create(ClaudeCompanionPlugin.prototype) as ClaudeCompanionPlugin;
  plugin.settings = {
    ...DEFAULT_SETTINGS,
    apiKey: "sk-ant-api-test",
    sourceCaptureConsent: "allow",
    utilityBackend: "ollama",
    ollamaHost: "http://localhost:11434",
    ...overrides,
  };
  Object.assign(plugin, { app, enrichRecentlyWritten: new Set<string>() });
  const router = new ProviderRouter(plugin.settings);
  Object.defineProperty(plugin, "router", { value: () => router });
  return { app, file, plugin, router };
}

function choose(label: string): void {
  const modal = getLastOpenedModal();
  const button = (modal?.contentEl as unknown as FakeElement | undefined)
    ?.querySelectorAll("button")
    .find((candidate) => candidate.textContent === label);
  expect(button).toBeDefined();
  button?.dispatchEvent({ type: "click" });
}

async function settle(turns = 8): Promise<void> {
  for (let turn = 0; turn < turns; turn++) await Promise.resolve();
}

afterEach(() => {
  Platform.isMobile = false;
  Platform.isDesktop = true;
  vi.restoreAllMocks();
});

describe("source enrichment wiring", () => {
  it("routes extraction through JSON mode with thinking disabled and a larger budget", async () => {
    // Regression: enrichment sent free-form 1024-token completions, so a
    // thinking utility model exhausted the budget on hidden reasoning and
    // replied empty — ExtractError "reply was not valid JSON".
    const complete = vi.fn(async () => ({ text: "{}", provider: selection().provider }));
    const selected = selection();
    const deps = (pluginHarness(complete) as unknown as PrivateEnrich).enrichDeps(selected);
    await deps.complete("sys", "user", { maxTokens: 4096, responseSchema: { type: "object" }, disableThinking: true });
    expect(complete).toHaveBeenCalledWith(selected, expect.objectContaining({
      maxTokens: 4096,
      responseFormat: "json",
      responseSchema: { type: "object" },
      thinking: { type: "disabled" },
    }));
  });

  it("leaves the default completion shape untouched when no opts are given", async () => {
    const complete = vi.fn(async () => ({ text: "ok", provider: selection().provider }));
    const selected = selection();
    const deps = (pluginHarness(complete) as unknown as PrivateEnrich).enrichDeps(selected);
    await deps.complete("sys", "user");
    expect(complete).toHaveBeenCalledWith(selected, { system: "sys", user: "user" });
  });

  it("uses one approved Claude selection for both completion and enrichedBy without changing settings", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const { plugin, router } = mobilePlugin();
    const complete = vi.spyOn(router, "completeResolved").mockResolvedValue({ text: "{}", provider: router.anthropic });
    const opened = vi.spyOn(ChoiceModal.prototype, "open");

    const pending = (plugin as unknown as PrivateEnrich).resolvedEnrichDeps();
    await Promise.resolve();
    choose("Use Claude this session");
    const deps = await pending;
    await deps.complete("sys", "private note");

    expect(deps.enrichedBy).toBe("claude");
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ provider: router.anthropic, model: DEFAULT_SETTINGS.model }),
      { system: "sys", user: "private note" },
    );
    expect(plugin.settings.utilityBackend).toBe("ollama");

    await (plugin as unknown as PrivateEnrich).resolvedEnrichDeps();
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("denial is session-cached and prevents a model call or note write", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const { app, file, plugin, router } = mobilePlugin();
    const before = await app.vault.cachedRead(file);
    const complete = vi.spyOn(router, "completeResolved");
    const opened = vi.spyOn(ChoiceModal.prototype, "open");

    const pending = plugin.enrichInboxItem(file);
    await settle();
    choose("Don't send");
    await pending;

    expect(complete).not.toHaveBeenCalled();
    expect(await app.vault.cachedRead(file)).toBe(before);
    await expect((plugin as unknown as PrivateEnrich).resolvedEnrichDeps()).rejects.toThrow(/not approved.*LAN or remote endpoint/i);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(plugin.settings.utilityBackend).toBe("ollama");
  });

  it("missing Claude credentials blocks mobile loopback enrichment without prompting", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const { plugin, router } = mobilePlugin({ apiKey: "", oauthToken: "" });
    const complete = vi.spyOn(router, "completeResolved");
    const opened = vi.spyOn(ChoiceModal.prototype, "open");

    await expect((plugin as unknown as PrivateEnrich).resolvedEnrichDeps()).rejects.toThrow(/Anthropic credential.*LAN or remote endpoint/i);

    expect(opened).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("shows the actual mobile LAN utility backend in Inbox", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const { app, plugin } = mobilePlugin({
      utilityBackend: "custom",
      openaiCompatHost: "http://192.168.1.24:1234",
      openaiCompatModel: "mlx-3b",
    });
    const view = new InboxView(new WorkspaceLeaf(app), plugin);

    await view.render();

    expect((view.contentEl as unknown as FakeElement).querySelector(".cc-inbox-backend")?.textContent).toBe(
      "Utility: OpenAI-compatible endpoint · mlx-3b",
    );
  });

  it("attributes enrichment failures to the runtime-selected custom endpoint", () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const { plugin } = mobilePlugin({
      utilityBackend: "custom",
      openaiCompatHost: "https://models.example.com",
      openaiCompatModel: "remote-model",
    });

    expect((plugin as unknown as PrivateEnrich).sourceEnrichmentErrorHint("failed to fetch")).toContain(
      "OpenAI-compatible endpoint at https://models.example.com",
    );
  });
});
