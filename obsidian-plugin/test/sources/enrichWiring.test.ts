import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<typeof import("obsidian")>(),
  PluginSettingTab: class {},
}));

import ClaudeCompanionPlugin from "../../src/main";
import { DEFAULT_SETTINGS } from "../../src/types";
import type { EnrichDeps } from "../../src/sources/enrich";
import { App, clearNotices, FakeElement, getLastOpenedModal, getNoticeMessages, Platform, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import { ChoiceModal } from "../../src/view/ChoiceModal";
import { ProviderRouter, type ProviderSelection } from "../../src/providers/router";
import { InboxView } from "../../src/view/InboxView";
import { summarizeAndTag } from "../../src/indexing/autoTagger";
import { OrganizeReviewModal } from "../../src/view/OrganizeReviewModal";

interface PrivateEnrich {
  enrichDeps(selection: ProviderSelection): EnrichDeps;
  resolvedEnrichDeps(): Promise<EnrichDeps>;
  sourceEnrichmentErrorHint(message: string): string | null;
  triageClippings(): Promise<void>;
  buildEnrichProposal(file: TFile, options: { rename: boolean; frontmatter: boolean; links: boolean; lint: boolean }): Promise<unknown>;
  organizeFolderFlow(folder: TFolder): Promise<void>;
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
  const router = plugin.router();
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
  clearNotices();
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
    expect(getNoticeMessages().at(-1)).toMatch(/not approved.*LAN or remote endpoint/i);
    expect(getNoticeMessages().at(-1)).not.toMatch(/see console/i);
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

  it("gates auto-tag utility completion through the same mobile consent boundary", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const { app, plugin, router } = mobilePlugin();
    const ollamaComplete = vi.spyOn(router.ollama, "complete").mockResolvedValue("unsafe");
    const claudeComplete = vi.spyOn(router.anthropic, "complete").mockResolvedValue("unsafe");
    const opened = vi.spyOn(ChoiceModal.prototype, "open");

    const pending = summarizeAndTag(app, router, "Private note content.", []);
    await settle();

    expect(opened).toHaveBeenCalledTimes(1);
    choose("Don't send");
    await expect(pending).rejects.toThrow(/not approved.*LAN or remote endpoint/i);
    expect(ollamaComplete).not.toHaveBeenCalled();
    expect(claudeComplete).not.toHaveBeenCalled();
  });

  it("serializes concurrent mobile fallback consent and keeps denial authoritative", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const { plugin, router } = mobilePlugin();
    const ollamaComplete = vi.spyOn(router.ollama, "complete").mockResolvedValue("unsafe");
    const claudeComplete = vi.spyOn(router.anthropic, "complete").mockResolvedValue("unsafe");
    const opened = vi.spyOn(ChoiceModal.prototype, "open");

    const first = (plugin as unknown as PrivateEnrich).resolvedEnrichDeps();
    const second = (plugin as unknown as PrivateEnrich).resolvedEnrichDeps();
    const settled = Promise.allSettled([first, second]);
    await settle();

    expect(opened).toHaveBeenCalledTimes(1);
    const buttons = (getLastOpenedModal()?.contentEl as unknown as FakeElement).querySelectorAll("button");
    const deny = buttons.find((button) => button.textContent === "Don't send");
    const allow = buttons.find((button) => button.textContent === "Use Claude this session");
    deny?.dispatchEvent({ type: "click" });
    allow?.dispatchEvent({ type: "click" });

    expect((await settled).map((result) => result.status)).toEqual(["rejected", "rejected"]);
    await expect((plugin as unknown as PrivateEnrich).resolvedEnrichDeps()).rejects.toThrow(/not approved/i);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(ollamaComplete).not.toHaveBeenCalled();
    expect(claudeComplete).not.toHaveBeenCalled();
  });

  it("shows an actionable Notice and performs no I/O for configured Claude without credentials", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const { app, file, plugin, router } = mobilePlugin({ utilityBackend: "claude", apiKey: "", oauthToken: "" });
    const before = await app.vault.cachedRead(file);
    const complete = vi.spyOn(router.anthropic, "complete").mockResolvedValue("unsafe");

    await plugin.enrichInboxItem(file);

    expect(complete).not.toHaveBeenCalled();
    expect(await app.vault.cachedRead(file)).toBe(before);
    expect(getNoticeMessages().at(-1)).toMatch(/no Anthropic credential.*add a credential/i);
    expect(getNoticeMessages().at(-1)).not.toMatch(/see console/i);
  });

  it("attributes a provider failure to the pinned endpoint even if settings change in flight", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const original = "https://models.example.com/v1";
    const { plugin, router } = mobilePlugin({
      utilityBackend: "custom",
      openaiCompatHost: original,
      openaiCompatModel: "remote-model",
    });
    let fail!: (reason: Error) => void;
    const response = new Promise<string>((_resolve, reject) => { fail = reject; });
    vi.spyOn(router.openaiCompat, "complete").mockReturnValue(response);

    const pending = plugin.enrichInboxItem((plugin.app.vault.getAbstractFileByPath("Clippings/private.md") as TFile));
    await settle();
    plugin.settings.openaiCompatHost = "https://changed.example.com/v1";
    fail(new Error("failed to fetch"));
    await pending;

    expect(getNoticeMessages().at(-1)).toContain(`OpenAI-compatible endpoint at ${original}`);
    expect(getNoticeMessages().at(-1)).not.toContain("changed.example.com");
  });

  it("redacts invalid endpoint credentials from the actionable Notice", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const { file, plugin, router } = mobilePlugin({
      utilityBackend: "custom",
      openaiCompatHost: "http://alice:supersecret@models.example.com/v1",
      openaiCompatModel: "remote-model",
    });
    const complete = vi.spyOn(router.openaiCompat, "complete").mockResolvedValue("unsafe");

    await plugin.enrichInboxItem(file);

    expect(complete).not.toHaveBeenCalled();
    expect(getNoticeMessages().at(-1)).toContain("http://models.example.com/v1");
    expect(getNoticeMessages().at(-1)).toMatch(/invalid/i);
    expect(getNoticeMessages().join("\n")).not.toMatch(/alice|supersecret/i);
  });

  it("aborts clipping organization when enrichment fallback is denied instead of proposing default moves", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const { app, file, plugin, router } = mobilePlugin();
    const before = await app.vault.cachedRead(file);
    const review = vi.spyOn(OrganizeReviewModal.prototype, "open");
    const ollamaComplete = vi.spyOn(router.ollama, "complete").mockResolvedValue("unsafe");
    const claudeComplete = vi.spyOn(router.anthropic, "complete").mockResolvedValue("unsafe");

    const pending = plugin.organizeClippings();
    await settle();
    choose("Don't send");
    await pending;

    expect(review).not.toHaveBeenCalled();
    expect(ollamaComplete).not.toHaveBeenCalled();
    expect(claudeComplete).not.toHaveBeenCalled();
    expect(await app.vault.cachedRead(file)).toBe(before);
    expect(getNoticeMessages().at(-1)).toMatch(/organizing stopped.*not approved/i);
  });

  it("aborts triage on denied enrichment before excerpts reach the chat provider or a board is written", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const { app, plugin, router } = mobilePlugin();
    const claudeComplete = vi.spyOn(router.anthropic, "complete").mockResolvedValue(
      JSON.stringify({ groups: [{ theme: "Private", paths: ["Clippings/private.md"], rationale: "private" }] }),
    );

    const pending = (plugin as unknown as PrivateEnrich).triageClippings();
    await settle();
    choose("Don't send");
    await pending;

    expect(claudeComplete).not.toHaveBeenCalled();
    expect(app.vault.getAbstractFileByPath("Clippings/Triage.md")).toBeNull();
    expect(getNoticeMessages().at(-1)).toMatch(/triage failed.*not approved/i);
  });

  it("propagates denied utility tagging so note enrichment cannot continue into chat lint or review", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const { app, file, plugin, router } = mobilePlugin();
    const before = await app.vault.cachedRead(file);
    const claudeComplete = vi.spyOn(router.anthropic, "complete").mockResolvedValue("unsafe");

    const pending = (plugin as unknown as PrivateEnrich).buildEnrichProposal(file, {
      rename: true,
      frontmatter: true,
      links: true,
      lint: true,
    });
    await settle();
    choose("Don't send");

    await expect(pending).rejects.toThrow(/not approved/i);
    expect(claudeComplete).not.toHaveBeenCalled();
    expect(await app.vault.cachedRead(file)).toBe(before);
  });

  it("aborts folder organization on denied utility inference instead of proposing misc moves", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const { file, plugin, router } = mobilePlugin();
    const folder = Object.assign(new TFolder("Clippings"), { children: [file], name: "Clippings" });
    const review = vi.spyOn(OrganizeReviewModal.prototype, "open");
    const claudeComplete = vi.spyOn(router.anthropic, "complete").mockResolvedValue("unsafe");

    const pending = (plugin as unknown as PrivateEnrich).organizeFolderFlow(folder);
    await settle();
    choose("Don't send");
    await pending;

    expect(review).not.toHaveBeenCalled();
    expect(claudeComplete).not.toHaveBeenCalled();
    expect(getNoticeMessages().at(-1)).toMatch(/organize failed.*not approved/i);
  });
});
