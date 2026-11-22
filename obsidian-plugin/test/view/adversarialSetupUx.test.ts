import { describe, expect, it, vi } from "vitest";
import {
  App,
  ButtonComponent,
  DropdownComponent,
  FakeElement,
  getLastOpenedModal,
  openSettingTab,
  Setting,
  TextComponent,
  WorkspaceLeaf,
} from "../fakes/obsidian";
import { agyBackend } from "../../src/cli/backends/agy";
import { ConnectionController } from "../../src/providers/connection";
import { ClaudeCompanionSettingTab } from "../../src/settings";
import { connectionItems, type ConnectionItemsContext } from "../../src/settingsItems/connection";
import { localModelsItems, type LocalModelsItemsContext } from "../../src/settingsItems/localModels";
import { DEFAULT_SETTINGS, type PluginSettings } from "../../src/types";
import { ChatView } from "../../src/view/ChatView";
import { SetupCard, type SetupCardDeps } from "../../src/view/chat/SetupCard";
import { ProviderSetupWizardModal, type ProviderSetupWizardDeps } from "../../src/view/ProviderSetupWizardModal";
import { QuickOptionsModal } from "../../src/view/QuickOptionsModal";
import { conversationFakes } from "../fakes/conversations";
import { curatedModels } from "../fakes/curatedModels";
import { fakeSemantic } from "../fakes/semantic";
import type ClaudeCompanionPlugin from "../../src/main";

function createWizardEnv(overrides: {
  settings?: Partial<PluginSettings>;
  agySignedIn?: boolean;
  agyInstalled?: boolean;
  claudeSignedIn?: boolean;
  claudeInstalled?: boolean;
  anthropicTest?: (candidate: PluginSettings) => Promise<{ ok: boolean; detail: string }>;
  ollamaTest?: () => Promise<{ ok: boolean; detail: string }>;
  ollamaModels?: () => Promise<string[]>;
  endpointTest?: () => Promise<{ ok: boolean; detail: string }>;
  deviceTest?: () => Promise<{ ok: boolean; detail: string }>;
} = {}) {
  const app = new App();
  const settings: PluginSettings = { ...structuredClone(DEFAULT_SETTINGS), ...overrides.settings };
  const storeMap = new Map<string, string>();
  const store = {
    available: () => true,
    get: (id: string) => storeMap.get(id) ?? null,
    set: (id: string, val: string) => {
      storeMap.set(id, val);
      return true;
    },
  };
  const state = {
    agySignedIn: overrides.agySignedIn ?? false,
    agyInstalled: overrides.agyInstalled ?? overrides.agySignedIn ?? false,
    claudeSignedIn: overrides.claudeSignedIn ?? false,
    claudeInstalled: overrides.claudeInstalled ?? overrides.claudeSignedIn ?? false,
  };

  const makeCli = (
    id: "agy-cli" | "claude-cli" | "codex-cli" | "opencode-cli",
    label: string,
    binary: string,
    isSignedIn: () => boolean,
    isInstalled: () => boolean,
  ) => ({
    id,
    label,
    available: () => true,
    hasCredentials: () => isSignedIn(),
    probe: () =>
      isInstalled()
        ? {
            executable: `/usr/local/bin/${binary}`,
            version: "1.4.3",
            loggedIn: isSignedIn(),
            method: isSignedIn() ? label : "",
          }
        : null,
    refresh: vi.fn(async () => ({
      ok: isSignedIn(),
      detail: isSignedIn() ? `${label} ready` : `${label} not signed in`,
    })),
    test: vi.fn(async () => ({
      ok: isSignedIn(),
      detail: isSignedIn() ? `${label} ready` : `${label} is not signed in.`,
    })),
    listModels: vi.fn(async () => [{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" }]),
    modelLabel: (m: string) => m || `${label} default`,
  });

  const agyCli = makeCli("agy-cli", "Antigravity", "agy", () => state.agySignedIn, () => state.agyInstalled);
  const claudeCli = makeCli("claude-cli", "Claude Code", "claude", () => state.claudeSignedIn, () => state.claudeInstalled);
  const codexCli = makeCli("codex-cli", "Codex", "codex", () => false, () => false);
  const opencodeCli = makeCli("opencode-cli", "OpenCode", "opencode", () => false, () => false);

  const router = {
    get chatBackend() {
      return settings.chatBackend;
    },
    anthropic: {
      hasCredentials: () => Boolean(settings.apiKey.trim() || settings.oauthToken.trim()),
      test: vi.fn(async () => (overrides.anthropicTest ? overrides.anthropicTest(settings) : { ok: true, detail: "Connected" })),
    },
    ollama: {
      hasCredentials: () => true,
      listModels: vi.fn(overrides.ollamaModels ?? (async () => ["llama3.1", "qwen2.5"])),
      capabilities: vi.fn(async () => ["tools", "thinking"]),
      test: vi.fn(overrides.ollamaTest ?? (async () => ({ ok: true, detail: "Ollama ready" }))),
    },
    openaiCompat: {
      hasCredentials: () => Boolean(settings.openaiCompatHost.trim()),
      listModels: vi.fn(async () => ["local-mlx"]),
      test: vi.fn(overrides.endpointTest ?? (async () => ({ ok: true, detail: "Endpoint ready" }))),
    },
    device: {
      hasCredentials: () => true,
      test: vi.fn(overrides.deviceTest ?? (async () => ({ ok: true, detail: "WebGPU ready" }))),
    },
    agyCli,
    claudeCli,
    codexCli,
    opencodeCli,
  };

  const saveSettings = vi.fn(async () => undefined);
  const connection = new ConnectionController({
    settings: () => settings,
    store,
    save: saveSettings,
    test: async (candidate) => {
      if (candidate.chatBackend === "agy-cli") return agyCli.test();
      if (candidate.chatBackend === "claude-cli") return claudeCli.test();
      if (candidate.chatBackend === "codex-cli") return codexCli.test();
      if (candidate.chatBackend === "opencode-cli") return opencodeCli.test();
      return overrides.anthropicTest ? overrides.anthropicTest(candidate) : { ok: true, detail: "Connected" };
    },
  });

  const openDesktopIntegrations = vi.fn();
  const activateChat = vi.fn();
  const refreshViews = vi.fn();

  const deps: ProviderSetupWizardDeps = {
    settings: () => settings,
    saveSettings,
    router: () => router as never,
    connection: () => connection,
    secrets: () => store,
    refreshViews,
    openDesktopIntegrations,
    activateChat,
    isMobile: () => false,
  };

  return {
    app,
    settings,
    state,
    router,
    connection,
    saveSettings,
    openDesktopIntegrations,
    activateChat,
    refreshViews,
    deps,
  };
}

describe("ProviderSetupWizardModal 3-step guided flows & adversarial edge cases", () => {
  it("completes the 3-step flow for signed-in Antigravity (agy-cli) and offers desktop integrations or Start chatting", async () => {
    const env = createWizardEnv({ agySignedIn: true, agyInstalled: true });
    const modal = new ProviderSetupWizardModal(env.app as never, env.deps);
    modal.open();
    const content = modal.contentEl as unknown as FakeElement;

    const agyCard = content.querySelectorAll(".cc-wizard-provider-card").find((el) => el.getAttribute("data-provider") === "agy-cli");
    expect(agyCard).toBeDefined();
    expect(agyCard?.querySelector(".cc-wizard-badge")?.textContent).toBe("Signed in");
    agyCard!.dispatchEvent({ type: "click" });

    // Step 2: signed-in Antigravity
    await vi.waitFor(() => expect(content.querySelector(".cc-wizard-connect")?.textContent).toBe("Use Antigravity"));
    content.querySelector(".cc-wizard-connect")!.dispatchEvent({ type: "click" });

    // Step 3: Connected summary
    await vi.waitFor(() => expect(env.settings.chatBackend).toBe("agy-cli"));
    await vi.waitFor(() => expect(content.querySelector(".cc-wizard-summary")?.querySelector("p")?.textContent).toContain("Antigravity connected"));
    expect(content.querySelector(".cc-wizard-desktop-integrations")?.textContent).toBe("Set up desktop & CLI vault tools…");

    content.querySelector(".cc-wizard-finish")!.dispatchEvent({ type: "click" });
    expect(env.activateChat).toHaveBeenCalledTimes(1);
    expect(env.refreshViews).toHaveBeenCalled();
  });

  it("recovers from an installed-but-signed-out CLI via Copy command and Re-check", async () => {
    const env = createWizardEnv({ claudeSignedIn: false, claudeInstalled: true });
    const modal = new ProviderSetupWizardModal(env.app as never, env.deps);
    modal.open();
    const content = modal.contentEl as unknown as FakeElement;

    const claudeCard = content.querySelectorAll(".cc-wizard-provider-card").find((el) => el.getAttribute("data-provider") === "claude-cli")!;
    expect(claudeCard.querySelector(".cc-wizard-badge")?.textContent).toBe("Sign-in required");
    claudeCard.dispatchEvent({ type: "click" });

    // Step 2 shows sign-in command, Copy command, and Re-check
    expect(content.querySelector(".cc-wizard-cmd-code")?.textContent).toBe("claude auth login");
    expect(content.querySelector(".cc-wizard-copy-cmd")?.textContent).toBe("Copy command");

    // First Re-check while still signed out stays on Step 2 with error detail
    content.querySelector(".cc-wizard-recheck")!.dispatchEvent({ type: "click" });
    await vi.waitFor(() => expect(content.querySelector(".cc-wizard-status")?.textContent).toContain("not signed in"));
    expect(env.settings.chatBackend).toBe("claude");

    // User completes login in terminal, then clicks Re-check
    env.state.claudeSignedIn = true;
    content.querySelector(".cc-wizard-recheck")!.dispatchEvent({ type: "click" });
    await vi.waitFor(() => expect(env.settings.chatBackend).toBe("claude-cli"));
    await vi.waitFor(() => expect(content.querySelector(".cc-wizard-summary")?.querySelector("p")?.textContent).toContain("Claude Code connected"));
  });

  it("recovers when a missing CLI binary is installed and signed in before clicking Re-check", async () => {
    const env = createWizardEnv({ agySignedIn: false, agyInstalled: false });
    const modal = new ProviderSetupWizardModal(env.app as never, env.deps);
    modal.open();
    const content = modal.contentEl as unknown as FakeElement;

    const agyCard = content.querySelectorAll(".cc-wizard-provider-card").find((el) => el.getAttribute("data-provider") === "agy-cli")!;
    expect(agyCard.querySelector(".cc-wizard-badge")?.textContent).toBe("Not detected");
    agyCard.dispatchEvent({ type: "click" });

    expect(content.querySelector(".cc-wizard-status")?.textContent).toContain("was not found");
    env.state.agyInstalled = true;
    env.state.agySignedIn = true;
    content.querySelector(".cc-wizard-recheck")!.dispatchEvent({ type: "click" });
    await vi.waitFor(() => expect(env.settings.chatBackend).toBe("agy-cli"));
    await vi.waitFor(() => expect(content.querySelector(".cc-wizard-summary")?.querySelector("p")?.textContent).toContain("Antigravity connected"));
  });

  it("rolls back settings on invalid Anthropic API key or unreachable Ollama server", async () => {
    const env = createWizardEnv({
      settings: { chatBackend: "claude-cli", ollamaHost: "http://localhost:11434", ollamaModel: "llama3.1" },
      anthropicTest: async () => ({ ok: false, detail: "Invalid Anthropic credential (HTTP 401)" }),
      ollamaTest: async () => ({ ok: false, detail: "Cannot reach Ollama at http://127.0.0.1:9999" }),
    });
    const modal = new ProviderSetupWizardModal(env.app as never, env.deps);
    modal.open();
    const content = modal.contentEl as unknown as FakeElement;

    // 1. Try invalid Claude API key
    content.querySelectorAll(".cc-wizard-provider-card").find((el) => el.getAttribute("data-provider") === "claude")!.dispatchEvent({ type: "click" });
    const keyInput = content.querySelector(".cc-wizard-input")!;
    keyInput.value = "sk-ant-invalid-input";
    keyInput.dispatchEvent({ type: "input" });
    content.querySelector(".cc-wizard-connect")!.dispatchEvent({ type: "click" });

    await vi.waitFor(() => expect(content.querySelector(".cc-wizard-status")?.textContent).toContain("HTTP 401"));
    expect(env.settings.chatBackend).toBe("claude-cli");
    expect(env.settings.apiKey).toBe("");

    // 2. Go back, try unreachable Ollama server
    content.querySelector(".cc-wizard-back")!.dispatchEvent({ type: "click" });
    content.querySelectorAll(".cc-wizard-provider-card").find((el) => el.getAttribute("data-provider") === "local")!.dispatchEvent({ type: "click" });
    const hostInput = content.querySelector(".cc-wizard-host-input")!;
    hostInput.value = "http://127.0.0.1:9999";
    hostInput.dispatchEvent({ type: "input" });
    content.querySelector(".cc-wizard-connect")!.dispatchEvent({ type: "click" });

    await vi.waitFor(() => expect(content.querySelector(".cc-wizard-status")?.textContent).toContain("Cannot reach Ollama"));
    expect(env.settings.chatBackend).toBe("claude-cli");
    expect(env.settings.ollamaHost).toBe("http://localhost:11434");
  });

  it("ignores late probe and verification completions after the modal is closed", async () => {
    let finishCheck!: (res: { ok: boolean; detail: string }) => void;
    const env = createWizardEnv({
      ollamaTest: () => new Promise((resolve) => { finishCheck = resolve; }),
    });
    const modal = new ProviderSetupWizardModal(env.app as never, env.deps);
    modal.open();
    const content = modal.contentEl as unknown as FakeElement;

    content.querySelectorAll(".cc-wizard-provider-card").find((el) => el.getAttribute("data-provider") === "local")!.dispatchEvent({ type: "click" });
    content.querySelector(".cc-wizard-connect")!.dispatchEvent({ type: "click" });
    modal.close();

    finishCheck({ ok: true, detail: "Late success" });
    await Promise.resolve();
    await Promise.resolve();
    expect(env.settings.chatBackend).toBe("claude");
    expect(content.children).toHaveLength(0);
  });
});

describe("SetupCard signed-out CLI re-check without draft loss and non-empty chat wizard entry", () => {
  it("renders signed-out CLI hint with Copy command and Re-check, then promotes to Use sign-in without losing a typed key", async () => {
    let agyLogged = false;
    const env = createWizardEnv();
    const openWizard = vi.fn();
    const parent = new FakeElement();
    const deps: SetupCardDeps = {
      plugin: {
        settings: env.settings,
        secrets: () => ({ available: () => true } as never),
        router: () => env.router as never,
        connection: () => env.connection,
      },
      cliEntries: () => [
        {
          backend: agyBackend,
          provider: {
            available: () => true,
            hasCredentials: () => agyLogged,
            probe: () => ({ executable: "/usr/local/bin/agy", version: "1.4.3", loggedIn: agyLogged, method: agyLogged ? "Antigravity" : "" }),
            refresh: async () => { agyLogged = true; },
          },
        },
      ],
      messagesEl: () => parent as unknown as HTMLElement,
      hasMessages: () => false,
      renderEmptyState: vi.fn(),
      refreshModelLabel: vi.fn(),
      openSettings: vi.fn(),
      openWizard,
    };

    const card = new SetupCard(deps);
    card.render(parent as unknown as HTMLElement);

    // Type a partial API key while signed-out CLI row is shown
    const keyField = parent.querySelector(".cc-setup-input")!;
    keyField.value = "sk-ant-partial-draft";
    keyField.dispatchEvent({ type: "input" });

    expect(parent.querySelector(".cc-setup-cli-signedout")).not.toBeNull();
    expect(parent.querySelector(".cc-setup-cli-copy")?.textContent).toBe("Copy command");
    const recheckBtn = parent.querySelector(".cc-setup-cli-recheck")!;
    recheckBtn.dispatchEvent({ type: "click" });

    await vi.waitFor(() => expect(parent.querySelector(".cc-setup-cli-use")?.textContent).toBe("Use Antigravity sign-in"));
    expect(parent.querySelector(".cc-setup-cli-signedout")).toBeNull();
    expect(parent.querySelector(".cc-setup-input")?.value).toBe("sk-ant-partial-draft");

    // Guided setup button opens wizard
    parent.querySelector(".cc-setup-wizard")!.dispatchEvent({ type: "click" });
    expect(openWizard).toHaveBeenCalledTimes(1);
  });

  it("exposes Connect Companion… in HeaderControls overflow and QuickOptionsModal when a non-empty chat is unconnected", () => {
    const openSetupWizard = vi.fn();
    const settings: PluginSettings = { ...structuredClone(DEFAULT_SETTINGS), chatBackend: "claude", apiKey: "" };
    const plugin = {
      settings,
      claudeModels: curatedModels,
      router: () => ({
        chatBackend: "claude",
        chatProvider: () => ({ provider: { id: "anthropic", hasCredentials: () => false }, model: DEFAULT_SETTINGS.model }),
        chatCapabilities: () => ({ agentActions: true, claudeControls: true, metered: true, local: false, cli: false }),
        anthropic: { hasCredentials: () => false },
        claudeCli: { hasCredentials: () => false, available: () => true },
      }),
      ...conversationFakes({
        conversations: [{ id: "c1", title: "Existing chat", createdAt: 1, updatedAt: 1, messages: [{ role: "user", content: "hi" }] }],
        activeId: "c1",
      }, settings).host,
      secrets: () => ({ available: () => true }),
      saveSettings: vi.fn(async () => undefined),
      onboarding: () => ({ openSetupWizard }),
      composeSystemPrompt: () => "sys",
      agentTools: () => ({ definitions: () => [] }),
      externalMcpTools: async () => [],
    } as unknown as ClaudeCompanionPlugin;

    const view = new ChatView(new WorkspaceLeaf(new App()) as never, plugin);
    (view as unknown as { openOverflowMenu(): void }).openOverflowMenu();
    const overflowContent = getLastOpenedModal()?.contentEl as unknown as FakeElement;
    const connectBtn = overflowContent.querySelectorAll("button").find((b) => b.getAttribute("aria-label") === "Connect Companion…");
    expect(connectBtn).toBeDefined();
    connectBtn!.dispatchEvent({ type: "click" });
    expect(openSetupWizard).toHaveBeenCalledTimes(1);

    // QuickOptionsModal also renders Connect Companion… when needsConnection is true
    const quickModal = new QuickOptionsModal(new App() as never, "chat", {
      snapshot: () => ({
        needsConnection: true,
        chatBackend: "claude",
        chatModel: DEFAULT_SETTINGS.model,
        agentModeEnabled: true,
        vaultContextEnabled: false,
        memoryIngestOnSave: false,
        utilityBackend: "claude",
        sourceEnrichOnCreate: true,
        sourceInboxFolder: "Clippings",
        sourceCaptureEnabled: true,
        clipperStatus: "current",
        semanticEnabled: true,
        embeddingEngine: "builtin",
        embeddingModel: "arctic",
        embeddingHealth: "Ready",
        indexHealth: "Ready",
        memoryEnabled: true,
        memoryFolder: "Claude/Sessions",
        memoryAutoConsolidate: false,
        discoveryEnabled: true,
        researchModel: "chat",
      }),
      save: vi.fn(),
      run: vi.fn(),
      openAllSettings: vi.fn(),
      openDesktopIntegrations: vi.fn(),
      openSetupWizard,
    });
    quickModal.open();
    const quickConnectBtn = (quickModal.contentEl as unknown as FakeElement).querySelector(".cc-quick-options-connect");
    expect(quickConnectBtn?.textContent).toBe("Connect Companion…");
    quickConnectBtn!.dispatchEvent({ type: "click" });
    expect(openSetupWizard).toHaveBeenCalledTimes(2);
  });
});

describe("SettingsNavigation and connectionItems / localModelsItems coverage", () => {
  it("renders Step 1 — connect to Claude in SettingsNavigation on the Chat & models tab when unconnected", () => {
    const env = createWizardEnv({ settings: { chatBackend: "agy-cli", apiKey: "" }, agySignedIn: false });
    const openSetupWizard = vi.fn();
    const plugin = {
      settings: env.settings,
      saveSettings: env.saveSettings,
      claudeModels: curatedModels,
      router: () => ({
        ...env.router,
        chatProvider: () => ({ provider: { id: "agy-cli", label: "Antigravity" }, model: "" }),
        providerLabel: () => "Antigravity",
      }),
      secrets: () => ({ available: () => true }),
      secretsWriteFailures: () => [],
      externalMcp: () => ({ errorFor: () => null, test: async () => ({ ok: true }) }),
      mcpRunning: () => false,
      semantic: () => fakeSemantic(),
      activity: { snapshot: () => ({ records: [] }) },
      ontology: () => undefined,
      clipperSetup: () => ({ templatesStale: () => false }),
      refreshViews: env.refreshViews,
      onboarding: () => ({ loadOntologyOnStart: async () => {}, openSetupWizard }),
      desktopIntegrations: () => ({ open: () => {} }),
      publishing: () => ({ publishedItems: () => [], unpublishItem: async () => {}, testPublishToken: async () => ({ ok: true, message: "" }) }),
    } as unknown as ClaudeCompanionPlugin;

    const tab = new ClaudeCompanionSettingTab(new App() as never, plugin as never);
    openSettingTab(tab as never);
    const container = tab.containerEl as unknown as FakeElement;
    const names = container.querySelectorAll(".setting-item-name").map((el) => el.textContent);
    expect(names).toContain("Step 1 — connect to Claude");

    const buttons = container.querySelectorAll("button");
    const guidedBtn = buttons.find((b) => b.textContent === "Guided setup…");
    expect(guidedBtn).toBeDefined();
    guidedBtn!.dispatchEvent({ type: "click" });
    expect(openSetupWizard).toHaveBeenCalledTimes(1);
  });

  it("renders connectionItems and localModelsItems actions (Antigravity check/model, Ollama detect/test, endpoint detect/test)", async () => {
    const env = createWizardEnv({
      settings: { chatBackend: "agy-cli", agyModel: "gemini-2.5-pro", authMode: "oauthToken" },
      agySignedIn: true,
      agyInstalled: true,
    });
    const connCtx: ConnectionItemsContext = {
      plugin: {
        settings: env.settings,
        saveSettings: env.saveSettings,
        refreshViews: env.refreshViews,
        router: () => env.router as never,
        connection: () => env.connection,
        claudeModels: curatedModels as never,
        deviceChat: () => ({ busy: () => false, cancel: () => {}, download: async () => {} }) as never,
        onboarding: () => ({ openSetupWizard: () => {} }) as never,
      },
      storageBlurb: () => "Stored in device secret storage.",
      renderStatus: (el, status) => el.setText(status.detail),
    };

    type RenderableRow = { name?: string; render?: (setting: Setting, group?: undefined) => unknown };
    const items = connectionItems(connCtx) as unknown as RenderableRow[];
    const agyStatusRow = items.find((i) => i.name === "Antigravity")!;
    const agySetting = new Setting(new FakeElement("div"));
    agyStatusRow.render!(agySetting, undefined);
    const checkBtn = agySetting.components.find((c) => c instanceof ButtonComponent) as ButtonComponent;
    expect(checkBtn.buttonEl.textContent).toBe("Check Antigravity");
    checkBtn.simulateClick();
    await vi.waitFor(() => expect(env.router.agyCli.test).toHaveBeenCalledTimes(1));

    const agyModelRow = items.find((i) => i.name === "Antigravity model")!;
    const modelSetting = new Setting(new FakeElement("div"));
    agyModelRow.render!(modelSetting, undefined);
    await vi.waitFor(() => expect(env.router.agyCli.listModels).toHaveBeenCalled());
    const dd = modelSetting.components.find((c) => c instanceof DropdownComponent) as DropdownComponent;
    expect(dd.options.get("gemini-2.5-pro")).toBe("Gemini 2.5 Pro");

    // Local models items: Ollama detect & test, Endpoint detect & test
    const detected = { ollama: ["llama3.1"], endpoint: ["local-mlx"] };
    const update = vi.fn();
    const localCtx: LocalModelsItemsContext = {
      plugin: {
        settings: env.settings,
        saveSettings: env.saveSettings,
        refreshViews: env.refreshViews,
        router: () => env.router as never,
      },
      detected,
      update,
      renderStatus: (el, status) => el.setText(status.detail),
    };
    const localRows = localModelsItems(localCtx) as unknown as RenderableRow[];
    for (const row of localRows) {
      if (row.render) {
        const s = new Setting(new FakeElement("div"));
        row.render(s, undefined);
        for (const comp of s.components) {
          if (comp instanceof ButtonComponent) comp.simulateClick();
          if (comp instanceof TextComponent) comp.simulateInput("updated-val");
        }
      }
    }
    await vi.waitFor(() => expect(env.router.ollama.test).toHaveBeenCalled());
    await vi.waitFor(() => expect(env.router.openaiCompat.test).toHaveBeenCalled());
  });
});
