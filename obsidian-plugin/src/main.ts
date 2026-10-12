import { chatBackendOptions } from "./providers/runtimeBackend";
import { registerNativeResultImport } from "./native/controller";
import { registerDeviceGpuCheck } from "./device/controller";
import { DeviceChatClient } from "./device/client";
import { DeviceProvider } from "./providers/device";
import { createEmbedWorker } from "./semantic/transformers/workerSource";
import { App, FileSystemAdapter, MarkdownView, Notice, parseYaml, Platform, Plugin, requestUrl, WorkspaceLeaf } from "obsidian";
import { ChatView, CHAT_VIEW_TYPE } from "./view/ChatView";
import { MemoryView, MEMORY_VIEW_TYPE } from "./view/MemoryView";
import { InboxView, INBOX_VIEW_TYPE } from "./view/InboxView";
import { SystemView, SYSTEM_VIEW_TYPE } from "./view/SystemView";
import { buildCommandActions } from "./composition/commands";
import { buildSystemDeps } from "./composition/system";
import { vaultToolOptions } from "./composition/vaultTools";
import { RelatedView, RELATED_VIEW_TYPE } from "./view/RelatedView";
import { ResearchView, ResearchWorkbenchRedirect, RESEARCH_DESK_VIEW_TYPE, RESEARCH_WORKBENCH_VIEW_TYPE } from "./view/ResearchView";
import { BuildView, BUILD_VIEW_TYPE } from "./view/BuildView";
import { SimilarBasesView, SIMILAR_BASES_VIEW_TYPE } from "./view/SimilarBasesView";
import { ensureVaultFolder, uniqueNotePath, writeOrReplaceFile } from "./vault/vaultFiles";
import { listChatProjects } from "./projects/registry";
import { ProjectPicker } from "./projects/ProjectPicker";
import { projectSystemPrompt, projectNoteBody, type ChatProject } from "./projects/model";
import { RESEARCH_MODELS, researchModelChip, type ResearchModel } from "./research/researchModel";
import { PROVENANCE_LANGUAGE } from "./research/draftSections";
import { renderProvenanceReferences } from "./view/research/provenanceReferences";
import { ChatTurnService } from "./chat/turnService";
import { shouldNotifyTurnComplete } from "./chat/turnNotice";
import { resolveModelId } from "./claude/models";
import { inferResearchProjectPath } from "./research/workbenchRouting";
import { SessionPicker } from "./view/SessionPicker";
import { WorkflowPicker } from "./view/WorkflowPicker";
import { WORKFLOWS, type Workflow } from "./workflows/catalog";
import type { SessionMeta } from "./memory/sessions";
import { MemoryController } from "./memory/controller";
import { McpBridgeController } from "./mcp/bridgeController";
import { ClaudeCompanionSettingTab } from "./settings";
import { companionCommands, type CommandActions } from "./commands/definitions";
import { ProviderRouter } from "./providers/router";
import { sanitizeEndpointForDisplay, UtilityUnavailableError } from "./providers/endpointPolicy";
import { UtilityRouting } from "./providers/utilityRouting";
import { ClipperFeature } from "./sources/clipperFeature";
import { Onboarding } from "./onboarding/onboarding";
import { DEFAULT_SETTINGS, type PluginSettings, type ArtifactOpenTarget } from "./types";
import { DESIGN_SYSTEM_PROMPT } from "./artifacts/designSystem";
import { AGENT_INSTRUCTION, PLAN_MODE_INSTRUCTION } from "./agent/prompt";
import { findUnlinkedMentions, linkMention, withLinktext, type LinkCandidate } from "./links/unlinkedMentions";
import { mentionEdits } from "./links/suggest";
import { planEdits, applyPlan, diffToEdits } from "./edit/diff";
import { inlineDiffExtension } from "./editor/inlineDiffExtension";
import { reviewInlineWithKeys } from "./editor/reviewKeys";
import { selectionActionExtension } from "./editor/selectionAction";
import { editorViewOf } from "./editor/reviewEdits";
import { inlinePromptExtension, openInlinePrompt } from "./editor/inlinePrompt";
import { commitModalRewrite, inlineEditMenuTitle, planModalRewrite, runInlineEdit, type ModalRewrite } from "./editor/inlineEdit";
import { DiffModal } from "./view/DiffModal";
import { BatchDiffModal } from "./view/BatchDiffModal";
import { ARTIFACT_HEIGHT, renderArtifactInline, ArtifactModal, openArtifactExternally } from "./artifacts/renderInline";
import type { McpHttpServer } from "./mcp/server";
import { VaultTools } from "./mcp/vaultTools";
import { catalogPromptProvider, composeResourceProviders, substrateResourceProvider, vaultResourceProvider } from "./mcp/providers";
import { MEMORY_NOTE_BASENAME } from "./memory/consolidate";
import { ExternalMcpManager } from "./mcp/externalManager";
import { externalAnthropicTools } from "./mcp/external";
import type { AnthropicToolDef } from "./providers/types";
import { toolAccess, type ToolRunKind } from "./agent/toolAccess";
import { parseTemplateNote, TEMPLATE_SCAFFOLD, type PromptTemplate } from "./templates/promptTemplates";
import type { OrdersController } from "./orders/controller";
import { OrdersFeature } from "./orders/ordersFeature";
import { PublishFeature } from "./publish/publishFeature";
import { ResearchFeature } from "./research/researchFeature";
import { DesktopFeature } from "./integrations/desktopFeature";
import { ClippingsController } from "./sources/clippings";
import { LINT_SYSTEM, buildLintUser, lintMaxTokens, parseLintResponse } from "./enrich/noteEnrich";
import { EnrichOptionsModal, EnrichReviewModal, type EnrichDecision, type EnrichOptions, type EnrichProposal } from "./view/EnrichModal";
import { sanitizeFileName } from "./artifacts/parse";
import { stripFrontmatter } from "./markdown/frontmatter";
import { generateToken } from "./mcp/clientConfig";
import type { BridgeSetupInput } from "./integrations/desktopRuntime";
import type { AgentTurnRunner } from "./agent/loop";
import { CliSession } from "./cli/session";
import { CliSessionPool, type PoolEntry } from "./cli/sessionPool";
import { mcpConfigJson } from "./cli/argv";
import { bridgeTools, CLI_HIDDEN_TOOLS, cliAllowedTools, type InteractiveToolDeps } from "./cli/bridgeTools";
import { createNodeCliRuntime, type CliRuntime } from "./cli/runtime";
import { CliProvider } from "./providers/cliProvider";
import { claudeBackend } from "./cli/backends/claude";
import { codexBackend } from "./cli/backends/codex";
import { opencodeBackend } from "./cli/backends/opencode";
import type { CliBackend } from "./cli/backends/types";
import { type BuildRun } from "./build/run";
import { BuildController } from "./build/controller";
import type { PublishController } from "./publish/controller";
import { normalizeTags } from "./indexing/frontmatter";
import { resolveTags } from "./tags/resolve";
import { vaultVocabulary } from "./tags/vaultTags";
import { OptimizeFeature } from "./optimize/feature";
import { normalizeOptimizeState, type OptimizeState } from "./optimize/state";
import { loadedOntology } from "./optimize/vaultGlue";
import { selectPromptTags } from "./tags/vocabulary";
import { frontmatterSuggestSystem, parseFrontmatterSuggestion } from "./indexing/frontmatterSuggest";
import { FrontmatterModal } from "./view/FrontmatterModal";
import { SemanticController } from "./semantic/controller";
import { isNamespacedData, resolveSettings } from "./settingsLoad";
import { createSecretStore, hydrate, stripVerifiedSecrets, syncSecrets, type SecretField, type SecretStore } from "./secrets/store";
import { migrateSecrets, migrationNotice } from "./secrets/migrate";
import { builtinModelById } from "./semantic/transformers/model";
import {
  type Conversation,
  type ConversationState,
  emptyState,
  fromPersisted,
  cliSessionIds,
} from "./conversations/store";
import { ConversationsController } from "./conversations/controller";
import { DistillController } from "./conversations/distillController";
import { SessionActions } from "./conversations/sessionActions";
import { saveSummaryNote } from "./artifacts/artifactStore";
import type { ChatMessage } from "./types";
import { normalizePath, TFile, TFolder, type Editor } from "obsidian";
import { inboxItems } from "./sources/inbox";
import { SourceEnrichmentController, type EnrichRunOutcome } from "./sources/controller";
import { ChoiceModal } from "./view/ChoiceModal";
import { OntologyRegistry } from "./ontology/registry";
import { auditProject } from "./research/audit";
import { nextSteps } from "./research/nextSteps";
import { documentSections } from "./research/sectionStatus";
import { deriveResearchStage } from "./research/stage";
import { captureWebSource } from "./research/webCapture";
import type { WebCapture } from "./context/webCapture";
import { summarizeAndTag } from "./indexing/autoTagger";
import { resolveCompanionWorkspace, type CompanionWorkspaceCard } from "./view/companionWorkspace";
import type { BatchLinkApplyResult } from "./links/batch";
import { reviewInboxBatchLinks } from "./links/inboxBatchReview";
import { ActivityStore } from "./activity/store";
import { beginActivity } from "./activity/progress";
import type { CompanionChromeDependencies } from "./view/companionChrome";
import type { QuickOptionAction, QuickOptionChange, QuickOptionsState } from "./view/quickOptions";
import { EnrichDiagnostics } from "./sources/enrichDiagnostics";
import type { DesktopIntegrationRuntime } from "./integrations/desktopCoordinator";
import { ConfirmModal } from "./view/ConfirmModal";
import { OBSIDIAN_GENERAL_SETTINGS_TAB, type DesktopPlatform } from "./integrations/desktop";

/** Output-token ceiling for artifact-producing flows (plans, artifacts, workflows),
 *  which routinely run past the chat default. A ceiling, not a target — you only
 *  pay for what's generated. Within current models' max-output limits. */
// Artifacts/plans are long (rich layout + inline script); give generous output
// headroom so a tabbed document finishes instead of truncating into broken JS.
const ARTIFACT_MAX_TOKENS = 32000;
/**
 * Mobile's native vault bridge expands a full-file read/write into several
 * Java and JS copies. A larger note can exceed Android's renderer heap even
 * though extraction sends only the first 8,000 characters to the model.
 */
const MOBILE_SOURCE_NOTE_MAX_BYTES = 5 * 1024 * 1024;
/** PDFs expand substantially during parsing; reject large mobile semantic
 * inputs before the native vault bridge creates its first binary copy. */
const MOBILE_SEMANTIC_PDF_MAX_BYTES = 10 * 1024 * 1024;

/** Shape of this plugin's persisted data.json (settings + chat history). */
interface PersistedData {
  settings?: Partial<PluginSettings>;
  conversations?: Conversation[];
  activeConversationId?: string | null;
  buildRuns?: BuildRun[];
  activeBuildRunId?: string | null;
  standingOrders?: unknown;
  orderEditQueue?: unknown;
  published?: unknown;
  optimize?: unknown;
}

export default class ClaudeCompanionPlugin extends Plugin {
  override settings: PluginSettings = DEFAULT_SETTINGS;
  private _activity?: ActivityStore;
  get activity(): ActivityStore { return this._activity ??= new ActivityStore(); }
  private _enrichDiagnostics?: EnrichDiagnostics;
  /** Opt-in phase log for batch enrichment; lazy getter so partial test harnesses (no onload) never touch it unless enabled. */
  get enrichDiagnostics(): EnrichDiagnostics {
    return this._enrichDiagnostics ??= new EnrichDiagnostics(
      {
        append: async (path, text) => {
          const dir = path.slice(0, path.lastIndexOf("/"));
          if (dir && !(await this.app.vault.adapter.exists(dir))) await this.app.vault.adapter.mkdir(dir);
          await this.app.vault.adapter.append(path, text);
        },
        now: () => Date.now(),
        isMobile: Platform.isMobile,
        path: "Claude/enrichment-diagnostics.log",
      },
      () => this.settings.enrichmentDiagnostics,
    );
  }
  private convState: ConversationState = emptyState();
  private _conversations?: ConversationsController;
  private _clippings?: ClippingsController;
  conversations(): ConversationsController {
    return (this._conversations ??= new ConversationsController({
      state: { get: () => this.convState, set: (next) => { this.convState = next; } },
      persist: () => this.persist(),
      activity: () => this.activity,
      settings: () => this.settings,
    }));
  }
  private _distiller?: DistillController;
  private distiller(): DistillController {
    return (this._distiller ??= new DistillController({
      get: (id) => this.conversations().list().find((c) => c.id === id),
      complete: async (req) => (await this.router().complete("utility", req)).text,
      exists: (path) => this.app.vault.getAbstractFileByPath(path) instanceof TFile,
      resolveLink: (link) => this.app.metadataCache.getFirstLinkpathDest(link.replace(/\.md$/, ""), "")?.path ?? (this.app.vault.getAbstractFileByPath(link) instanceof TFile ? link : null),
      write: async (existing, folder, title, content, created) => {
        const file = existing === null ? null : this.app.vault.getAbstractFileByPath(existing);
        if (file instanceof TFile) {
          await this.app.vault.modify(file, content);
          return file.path;
        }
        return (await saveSummaryNote(this.app, folder, title, content, created)).path;
      },
      setDistilledNote: (id, path) => this.conversations().setDistilledNote(id, path),
      notice: (text) => new Notice(text),
      settings: () => this.settings,
    }));
  }
  private _sessionActions?: SessionActions;
  sessionActions(): SessionActions {
    return (this._sessionActions ??= new SessionActions({
      find: (id) => this.conversations().list().find((c) => c.id === id),
      archive: (id) => this.conversations().archive(id),
      fork: (id) => this.conversations().fork(id),
      createSeeded: (title, seed, projectId) => this.conversations().createSeeded(title, seed, projectId),
      distill: (id) => this.distiller().distill(id),
      readNote: async (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        return file instanceof TFile ? this.app.vault.cachedRead(file) : null;
      },
      openInNewTab: async (conversationId) => {
        const { workspace } = this.app;
        const leaf = workspace.getLeaf("tab");
        await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true, state: { conversationId } });
        await workspace.revealLeaf(leaf);
      },
    }));
  }
  private _turnService?: ChatTurnService;
  private turnCompleteStatusBarEl: HTMLElement | null = null;
  /** Owns in-flight chat turns independent of any ChatView instance (P5). */
  turnService(): ChatTurnService {
    if (this._turnService) return this._turnService;
    const service = new ChatTurnService();
    service.onUnattachedDone(({ conversationId, title, result }) => {
      if (!shouldNotifyTurnComplete(this.settings.notifyOnTurnComplete, result)) return;
      new Notice(`Claude finished: ${title}`);
      this.showTurnCompleteStatusBar(conversationId, title);
    });
    this._turnService = service;
    return service;
  }

  /** Desktop status-bar item pointing at a turn that finished unattended; clears itself once clicked. */
  private showTurnCompleteStatusBar(conversationId: string, title: string): void {
    if (Platform.isMobile) return;
    this.turnCompleteStatusBarEl?.remove();
    const el = this.addStatusBarItem();
    el.addClass("cc-turn-complete-status");
    el.setText(`✓ ${title}`);
    el.setAttr("aria-label", "Claude finished — click to open");
    el.addEventListener("click", () => {
      el.remove();
      if (this.turnCompleteStatusBarEl === el) this.turnCompleteStatusBarEl = null;
      void this.openConversationFromNotice(conversationId);
    });
    this.turnCompleteStatusBarEl = el;
  }

  private async openConversationFromNotice(conversationId: string): Promise<void> {
    const conversation = await this.conversations().setActive(conversationId);
    if (!conversation) return;
    const existing = this.chatLeafFor(conversationId);
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const view = await this.activateView();
    if (view) view.loadConversation(conversation);
  }

  /** A Chat leaf already showing `conversationId`, if one is open. */
  chatLeafFor(conversationId: string): WorkspaceLeaf | null {
    for (const leaf of this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)) {
      if (leaf.view instanceof ChatView && leaf.view.getState().conversationId === conversationId) return leaf;
    }
    return null;
  }

  private _build: BuildController | null = null;
  private build(): BuildController {
    return (this._build ??= new BuildController({
      settings: () => this.settings,
      persist: () => this.persist(),
      isMobile: Platform.isMobile,
      vault: {
        cachedRead: (path) => {
          const file = this.app.vault.getAbstractFileByPath(path);
          return file instanceof TFile ? this.app.vault.cachedRead(file) : Promise.reject(new Error(`File not found: ${path}`));
        },
        processFile: async (path, fn) => {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) await this.app.vault.process(file, fn);
        },
      },
      writeFile: async (path, content) => { await writeOrReplaceFile(this.app, path, content); },
      ensureFolder: (folder) => ensureVaultFolder(this.app, folder),
      openFile: async (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
      },
      normalizePath,
      notice: (msg, timeout) => new Notice(msg, timeout),
      confirm: (opts) => new Promise<boolean>((resolve) => {
        new ConfirmModal(this.app, { ...opts, onResolve: resolve }).open();
      }),
      cloud: () => this.publishing().cloud(),
      vaultBasePath: () => this.vaultBasePath(),
      desktopProcess: () => (window as { process?: { platform?: string; env?: Record<string, string | undefined> } }).process,
      desktopRuntimeLoader: () => this._desktopRuntimeLoader(),
    }));
  }
  /** data.json contains several domains; serialize snapshots so an older write cannot land last. */
  private persistChain: Promise<void> = Promise.resolve();
  /** Credentials live here, not in data.json. Lazy so tests can construct the plugin. */
  private _secrets: SecretStore | null = null;
  /** Set by the last persist: credentials the store refused, still in data.json. */
  private unverifiedSecrets: SecretField[] = [];
  private _router: ProviderRouter | null = null;
  /** Owns the sign-in probe across router rebuilds (settings saves null the router) — one per CLI backend. */
  private _cliProvider: CliProvider | null = null;
  private _codexProvider: CliProvider | null = null;
  private _opencodeProvider: CliProvider | null = null;
  private _cliPool?: CliSessionPool<CliSession>;
  private get cliPool(): CliSessionPool<CliSession> {
    return (this._cliPool ??= new CliSessionPool<CliSession>(3));
  }
  private _cliRuntime: CliRuntime | null | undefined;
  private _desktopRuntimeLoader: () => Promise<{
    createNodeDesktopRuntime(platform: DesktopPlatform, homeDir: string, env: Record<string, string | undefined>, bridge?: BridgeSetupInput): Promise<DesktopIntegrationRuntime>;
    createNodeManagedProcessPort(): import("./build/desktopExecutor").ManagedProcessPort;
  }> = () => import("./integrations/desktopRuntime");
  private _externalMcp: ExternalMcpManager | null = null;
  private _mcpServersSnapshot = "[]";
  /** Chat-scoped vault tools (agent mode) — separate instance and write gate from the MCP bridge. */
  private agentVaultTools: VaultTools | null = null;
  private mcpLifecycleGeneration = 0;
  private mcpLifecycleEnded = false;
  private _mcpBridge: McpBridgeController | null = null;
  memoryNotePath(): string {
    return normalizePath(`${this.settings.memoryFolder}/${MEMORY_NOTE_BASENAME}.md`);
  }
  private mcpBridge(): McpBridgeController {
    return (this._mcpBridge ??= new McpBridgeController({
      settings: () => this.settings,
      saveSettings: () => this.saveSettings(),
      isMobile: Platform.isMobile,
      isLifecycleEnded: () => this.mcpLifecycleEnded,
      lifecycleGeneration: () => this.mcpLifecycleGeneration ?? 0,
      buildToolOptions: () => vaultToolOptions(this, this.settings.mcpAllowWrites),
      createTools: (opts) => new VaultTools(this.app, opts),
      createServer: async (tools, port, token) => {
        const { McpHttpServer } = await import("./mcp/server");
        return new McpHttpServer(
          {
            port,
            token,
            serverInfo: { name: "obsidian-vault", version: this.manifest.version },
            resources: composeResourceProviders(
              substrateResourceProvider(this.app, { call: (n, a) => (tools as unknown as VaultTools).call(n, a), memoryPath: () => this.memoryNotePath() }),
              vaultResourceProvider(this.app),
            ),
            prompts: catalogPromptProvider(() => this.promptTemplates()),
          },
          tools as unknown as VaultTools,
          (level, message) => { if (level === "error") console.error("[Claude Companion MCP]", message); },
        );
      },
      notice: (msg) => new Notice(msg),
    }));
  }
  private _semantic: SemanticController | null = null;
  semantic(): SemanticController {
    return (this._semantic ??= new SemanticController({
      settings: () => this.settings,
      saveSettings: () => this.saveSettings(),
      manifestDir: this.manifest.dir ?? `.obsidian/plugins/${this.manifest.id}`,
      manifestId: this.manifest.id,
      activity: () => this.activity,
      enrichDiagnostics: () => this.enrichDiagnostics,
      router: () => this.router(),
      isMobile: Platform.isMobile,
      deviceChatBusy: () => this._deviceChat?.busy() ?? false,
      vault: {
        adapterSize: async (p) => (await this.app.vault.adapter.stat(p))?.size,
        adapterExists: (p) => this.app.vault.adapter.exists(p),
        adapterRead: (p) => this.app.vault.adapter.read(p),
        adapterWrite: (p, d) => this.app.vault.adapter.write(p, d),
        getMarkdownFiles: () => this.app.vault.getMarkdownFiles().map((f) => ({ path: f.path, mtime: f.stat.mtime, size: f.stat.size })),
        getPdfFiles: () => this.app.vault.getFiles().filter((f) => f.extension === "pdf").map((f) => ({ path: f.path, mtime: f.stat.mtime, size: f.stat.size })),
        getAbstractFileByPath: (p) => {
          const f = this.app.vault.getAbstractFileByPath(p);
          return f instanceof TFile ? { path: f.path, stat: { mtime: f.stat.mtime, size: f.stat.size } } : null;
        },
        cachedRead: (p) => {
          const f = this.app.vault.getAbstractFileByPath(p);
          return f instanceof TFile ? this.app.vault.cachedRead(f) : Promise.resolve("");
        },
        readBinary: (p) => {
          const f = this.app.vault.getAbstractFileByPath(p);
          if (!(f instanceof TFile)) return Promise.reject(new Error(`Not a file: ${p}`));
          return this.app.vault.readBinary(f);
        },
      },
      notice: (msg, timeout) => new Notice(msg, timeout),
      openChoiceModal: (opts) => new ChoiceModal(this.app, opts).open(),
      mobileSourceNoteMaxBytes: MOBILE_SOURCE_NOTE_MAX_BYTES,
      mobilePdfMaxBytes: MOBILE_SEMANTIC_PDF_MAX_BYTES,
    }));
  }
  private _enrichment: SourceEnrichmentController | null = null;
  enrichment(): SourceEnrichmentController {
    return (this._enrichment ??= new SourceEnrichmentController({
      settings: () => this.settings,
      saveSettings: () => this.saveSettings(),
      isMobile: Platform.isMobile,
      mobileSourceNoteMaxBytes: MOBILE_SOURCE_NOTE_MAX_BYTES,
      enrichApp: this.app,
      vault: {
        cachedRead: (path) => {
          const f = this.app.vault.getAbstractFileByPath(path);
          return f instanceof TFile ? this.app.vault.cachedRead(f) : Promise.resolve("");
        },
      },
      activity: () => this.activity,
      enrichDiagnostics: () => this.enrichDiagnostics,
      router: () => this.router(),
      resolveTags: (tags) => resolveTags(tags, vaultVocabulary(this.app)).map((r) => r.tag),
      suspendReindex: () => this.semantic().suspendReindex(),
      isUtilityLifecycleActive: (g) => this.utilityRouting().isLifecycleActive(g),
      assertUtilityLifecycleActive: (g) => this.utilityRouting().assertLifecycleActive(g),
      utilityLifecycleEnded: () => this.utilityRouting().isEnded(),
      utilityLifecycleGeneration: () => this.utilityRouting().lifecycleGeneration(),
      onEnrichQueueIdle: () => void this.optimize().checkTagMergesInBackground(),
      notice: (msg, timeout) => new Notice(msg, timeout),
      openChoiceModal: (opts) => { const m = new ChoiceModal(this.app, opts); m.open(); return m; },
    }));
  }
  private _memory: MemoryController | null = null;
  memory(): MemoryController {
    return (this._memory ??= new MemoryController({
      settings: () => this.settings,
      isMobile: Platform.isMobile,
      ingestApp: this.app,
      vaultBasePath: () => this.vaultBasePath(),
      vault: {
        markdownFilesUnder: (prefix) => this.app.vault.getMarkdownFiles()
          .filter((f) => f.path.startsWith(`${prefix}/`))
          .map((f) => ({ path: f.path, mtime: f.stat.mtime })),
        readContent: async (path) => {
          const f = this.app.vault.getAbstractFileByPath(path);
          return f instanceof TFile ? this.app.vault.cachedRead(f) : null;
        },
        writeContent: async (path, content) => {
          const f = this.app.vault.getAbstractFileByPath(path);
          if (f instanceof TFile) await this.app.vault.modify(f, content);
          else await this.app.vault.create(path, content);
        },
      },
      router: () => this.router(),
      excludedSessionIds: () => this.conversations().list().flatMap(cliSessionIds),
      getActiveConversation: () => this.conversations().getActive(),
      nodeSessionReader: async () => {
        const { nodeSessionReader, defaultProjectsRoot } = await import("./memory/nodeReader");
        return { reader: nodeSessionReader, defaultProjectsRoot };
      },
      notice: (msg, timeout) => new Notice(msg, timeout),
      refreshMemoryView: () => this.refreshMemoryView(),
      openFile: async (path) => {
        const f = this.app.vault.getAbstractFileByPath(path);
        if (f instanceof TFile) await this.app.workspace.getLeaf(false).openFile(f);
      },
      openSessionPicker: (sessions, onPick) => new SessionPicker(this.app, sessions, onPick).open(),
      normalizePath,
    }));
  }
  private _utilityRouting?: UtilityRouting;
  /** Runtime utility selection, mobile fallback consent, and the unload lifecycle for utility work. */
  utilityRouting(): UtilityRouting {
    return (this._utilityRouting ??= new UtilityRouting({
      app: this.app,
      settings: () => this.settings,
      router: () => this.router(),
      isMobile: () => Platform.isMobile,
    }));
  }
  private _clipperSetup?: ClipperFeature;
  /** Web Clipper template export, setup modal, and clip verification. */
  clipperSetup(): ClipperFeature {
    return (this._clipperSetup ??= new ClipperFeature({
      app: this.app,
      settings: () => this.settings,
      saveSettings: () => this.saveSettings(),
      persist: () => this.persist(),
      activity: () => this.activity,
    }));
  }
  private _onboarding?: Onboarding;
  /** Setup wizard, first-run prompts, and ontology seeding. */
  onboarding(): Onboarding {
    return (this._onboarding ??= new Onboarding({
      app: this.app,
      settings: () => this.settings,
      saveSettings: () => this.saveSettings(),
      router: () => this.router(),
      secrets: () => this.secrets(),
      ontology: () => this.ontology(),
      semantic: () => this.semantic(),
      openDesktopIntegrations: () => this.desktopIntegrations().open(),
      isMobile: () => Platform.isMobile,
    }));
  }
  /** Source-inbox ribbon icon + its pending-count badge (debounced). */
  private inboxRibbonEl: HTMLElement | null = null;
  private inboxBadgeTimer: number | null = null;
  private _research?: ResearchFeature;
  /** Research Desk, scholarly discovery, and the plan-to-build handoff. */
  research(): ResearchFeature {
    return (this._research ??= new ResearchFeature({
      app: this.app,
      settings: () => this.settings,
      activity: () => this.activity,
      router: () => this.router(),
      build: () => this.build(),
      activateView: () => this.activateView(),
      lastMarkdownFile: () => this.lastMarkdownFile,
      companionChrome: () => this.companionChrome(),
      openCompanionSettings: () => this.openCompanionSettings(),
      artifactMaxTokens: ARTIFACT_MAX_TOKENS,
    }));
  }
  private _desktopIntegrations?: DesktopFeature;
  /** Desktop integrations modal and the read-only bridge it prepares. */
  desktopIntegrations(): DesktopFeature {
    return (this._desktopIntegrations ??= new DesktopFeature({
      app: this.app,
      settings: () => this.settings,
      saveSettings: () => this.saveSettings(),
      router: () => this.router(),
      resolvedMcpToken: () => this.resolvedMcpToken(),
      mcpRunning: () => this.mcpRunning(),
      openCompanionSettings: () => this.openCompanionSettings(),
      openObsidianCliSettings: () => this.openObsidianCliSettings(),
      runtimeLoader: () => this._desktopRuntimeLoader(),
    }));
  }
  private _orders?: OrdersFeature;
  /** Standing orders, their queued edits, and the persisted state behind both. */
  orders(): OrdersFeature {
    return (this._orders ??= new OrdersFeature({
      app: this.app,
      settings: () => this.settings,
      activity: () => this.activity,
      persist: () => this.persist(),
      router: () => this.router(),
      composeSystemPrompt: (opts) => this.composeSystemPrompt(opts),
      agentTools: () => this.agentTools(),
      cliTurnRunner: (opts) => this.cliTurnRunner(opts),
      closeCliSession: (conversationId) => this.cliPool.close(conversationId),
      syncInboxBadge: () => this.syncInboxBadge(),
      registerEvent: (ref) => this.registerEvent(ref),
      registerInterval: (id) => this.registerInterval(id),
    }));
  }
  private _publishing?: PublishFeature;
  /** Gist publishing, the published-note registry, and cloud session dispatch. */
  publishing(): PublishFeature {
    return (this._publishing ??= new PublishFeature({
      app: this.app,
      settings: () => this.settings,
      activity: () => this.activity,
      persist: () => this.persist(),
    }));
  }
  private optimizeState: OptimizeState = { dismissed: [], verdicts: {} };
  private _optimize?: OptimizeFeature;
  /** Lazily-built ontology registry; null while the feature is disabled. */
  private _ontology: OntologyRegistry | null = null;
  /** Teardown callbacks registered by extracted controllers; run in reverse order on unload. */
  private disposables?: Array<() => void>;
  /** Listeners notified after every successful saveSettings() (per-domain reactions). */
  private settingsListeners?: Set<() => void>;

  /** Register a teardown callback run by onunload (reverse registration order). */
  registerDisposable(dispose: () => void): void {
    (this.disposables ??= []).push(dispose);
  }

  /** Subscribe to successful settings saves. Returns an unsubscribe function. */
  onSettingsChanged(listener: () => void): () => void {
    const listeners = (this.settingsListeners ??= new Set());
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  override async onload(): Promise<void> {
    this.mcpLifecycleGeneration = (this.mcpLifecycleGeneration ?? 0) + 1;
    this.mcpLifecycleEnded = false;
    this.utilityRouting().start();
    this._enrichment?.resetLifecycle();
    await this.loadSettings();

    this.registerViews();

    this.registerArtifactBlocks();

    this.registerEditorExtension(inlineDiffExtension());
    this.registerEditorExtension(inlinePromptExtension());
    if (Platform.isDesktop) {
      this.registerEditorExtension(
        selectionActionExtension({
          enabled: () => this.settings.selectionActionEnabled,
          run: () => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view) void this.startInlineEdit(view.editor, view);
          },
        }),
      );
    }

    // One ribbon icon for the plugin itself. Workflows and session capture live
    // in the chat panel's header action bar, so they don't need ribbon entries.
    this.addRibbonIcon("sparkles", "Open Companion for Claude", () => void this.activateView());
    this.inboxRibbonEl = this.addRibbonIcon("inbox", "Source inbox", () => void this.activateInboxView());
    this.inboxRibbonEl.addClass("cc-inbox-ribbon");

    this.registerContextMenus();
    for (const command of companionCommands(this.commandActions())) this.addCommand(command);
    registerNativeResultImport(this);
    registerDeviceGpuCheck(this);
    this.addCommand({
      id: "set-chat-project",
      name: "Chat: choose project",
      callback: () => void (async () => {
        const view = await this.activateView();
        if (!view) return;
        const projects = await this.listChatProjects();
        if (projects.length === 0) {
          new Notice("No chat projects yet — create one with “Chat: new project note”.");
          return;
        }
        new ProjectPicker(this.app, projects, (project) => void view.applyChosenProject(project)).open();
      })(),
    });
    this.addCommand({
      id: "new-chat-project",
      name: "Chat: new project note",
      callback: () => void (async () => {
        const folder = "Claude/Projects";
        await ensureVaultFolder(this.app, folder);
        const activeFolder = this.app.workspace.getActiveFile()?.parent?.path ?? null;
        const path = await uniqueNotePath(this.app, folder, "New project", "md");
        const file = await this.app.vault.create(path, projectNoteBody(activeFolder));
        await this.app.workspace.getLeaf(true).openFile(file);
      })(),
    });

    this.addSettingTab(new ClaudeCompanionSettingTab(this.app, this));

    // Start the MCP bridge if enabled (deferred so it doesn't block load).
    this.app.workspace.onLayoutReady(() => {
      this.startAfterLayout();
    });

    this.registerNoteTracking();
  }

  /** Every view Companion contributes, with the dependencies each one needs. */
  private registerViews(): void {
    this.registerView(CHAT_VIEW_TYPE, (leaf: WorkspaceLeaf) => new ChatView(leaf, this));
    this.registerView(MEMORY_VIEW_TYPE, (leaf: WorkspaceLeaf) => new MemoryView(leaf, this));
    this.registerView(INBOX_VIEW_TYPE, (leaf: WorkspaceLeaf) => new InboxView(leaf, this));
    this.registerView(SYSTEM_VIEW_TYPE, (leaf: WorkspaceLeaf) => new SystemView(leaf, this, buildSystemDeps(this)));
    this.registerView(RELATED_VIEW_TYPE, (leaf: WorkspaceLeaf) => new RelatedView(leaf, this));
    this.registerView(BUILD_VIEW_TYPE, (leaf: WorkspaceLeaf) => new BuildView(leaf, this.build().viewDependencies()));
    this.registerView(RESEARCH_DESK_VIEW_TYPE, (leaf: WorkspaceLeaf) => this.research().createDeskView(leaf));
    this.registerView(RESEARCH_WORKBENCH_VIEW_TYPE, (leaf: WorkspaceLeaf) => new ResearchWorkbenchRedirect(leaf));
    this.registerBasesView(SIMILAR_BASES_VIEW_TYPE, {
      name: "Similar notes",
      icon: "sparkles",
      factory: (controller, containerEl) => new SimilarBasesView(controller, containerEl, {
        semanticEnabled: () => this.settings.semanticEnabled,
        related: (path, k, accept) => this.semantic().relatedForTools(path, k, accept),
      }),
      options: () => [{ type: "slider", key: "limit", displayName: "Results", min: 5, max: 50, step: 1, default: 20 }],
    });
  }

  /** Inline interactive artifacts, rendered from claude-html fences. */
  private registerArtifactBlocks(): void {
    // Inline interactive artifacts: ```claude-html ... ```
    this.registerMarkdownCodeBlockProcessor("claude-html", (source, el, ctx) => {
      let height = ARTIFACT_HEIGHT;
      let title = "Claude artifact";
      const info = ctx.getSectionInfo(el);
      if (info) {
        const fence = info.text.split("\n")[info.lineStart] ?? "";
        const m = /height=(\d+)/.exec(fence);
        if (m?.[1]) height = parseInt(m[1], 10);
      }
      const t = /<title>([^<]+)<\/title>/i.exec(source);
      if (t?.[1]) title = t[1].trim();
      renderArtifactInline(el, source, height, title, {
        open: (h, ti) => this.openArtifact(h, ti),
        openWith: (h, ti, target) => this.openArtifactWith(h, ti, target),
        publish: (h, ti) => void this.publish().publishArtifact(h, ti),
      });
    });
    this.registerMarkdownCodeBlockProcessor(PROVENANCE_LANGUAGE, (source, el, ctx) => {
      renderProvenanceReferences(el, source, (path) => void this.app.workspace.openLinkText(path, ctx.sourcePath));
    });
  }

  /**
   * Work deferred to layout-ready. Vault listeners register here so Obsidian's
   * initial scan does not fire create/modify for every note and stampede them.
   */
  private startAfterLayout(): void {
    const cliProbe = Platform.isMobile ? undefined : this.chatCliProvider().refresh().then(() => this.refreshViews());
      void this.syncMcpServer();
      this.research().syncPlanBuildActions();
      void this.onboarding().runFirstRun(cliProbe).then(() => this.semantic().catchUpIndex());
      // Schemas/inbox changed since the clipper templates were exported →
      // the clipper is clipping against a stale schema. Offer once per session.
      if (this.settings.sourceCaptureEnabled && this.clipperSetup().templatesStale()) {
        new Notice("Source schemas changed since your Web Clipper templates were exported — re-export from Settings → Source capture.", 9000);
      }

      // Keep the semantic index fresh as notes change (debounced; no-op when
      // off). Registered AFTER layout-ready so Obsidian's initial vault scan
      // doesn't fire create/modify for every note and stampede the indexer;
      // catchUpIndex covers notes that changed while Obsidian was closed.
      this.registerEvent(this.app.vault.on("modify", (f) => { if (f instanceof TFile && (f.extension === "md" || (f.extension === "pdf" && this.settings.semanticIndexPdfs))) this.semantic().queueReindex(f.path); }));
      this.registerEvent(this.app.vault.on("create", (f) => { if (f instanceof TFile && (f.extension === "md" || (f.extension === "pdf" && this.settings.semanticIndexPdfs))) this.semantic().queueReindex(f.path); }));
      this.registerEvent(this.app.vault.on("create", (f) => {
        if (f instanceof TFile && (f.extension === "md" || f.extension === "csv") && this.settings.sourceCaptureEnabled && this.settings.sourceEnrichOnCreate) this.enrichment().queueEnrich(f);
      }));
      this.registerEvent(this.app.vault.on("create", (f) => {
        if (f instanceof TFile && f.extension === "md") this.clipperSetup().queueVerification(f);
      }));
      this.registerEvent(this.app.vault.on("delete", (f) => { if (f instanceof TFile && (f.extension === "md" || f.extension === "pdf")) void this.semantic().indexer()?.removeNote(f.path); }));
      this.registerEvent(this.app.vault.on("rename", (f, oldPath) => { if (f instanceof TFile && (f.extension === "md" || f.extension === "pdf")) void this.semantic().renameNote(oldPath, f.path); }));
      this.registerEvent(this.app.vault.on("create", (f) => { if (f.path.endsWith(".md")) this.research().scheduleResearchRefresh(f.path); }));
      this.registerEvent(this.app.vault.on("delete", (f) => { if (f.path.endsWith(".md")) this.research().scheduleResearchRefresh(f.path); }));
      this.registerEvent(this.app.vault.on("rename", (f, oldPath) => { if (f.path.endsWith(".md") || oldPath.endsWith(".md")) this.research().scheduleResearchRefresh(f.path, oldPath); }));
      this.registerEvent(this.app.vault.on("rename", (f, oldPath) => { if (f instanceof TFile && f.extension === "md") void this.publish().renameNote(oldPath, f.path); }));

      // Inbox ribbon badge: pending count, refreshed on vault + frontmatter
      // changes (debounced — enrichment stamps source_enriched via frontmatter).
      this.syncInboxBadge();
      this.registerEvent(this.app.vault.on("create", () => this.scheduleInboxBadgeSync()));
      this.registerEvent(this.app.vault.on("delete", () => this.scheduleInboxBadgeSync()));
      this.registerEvent(this.app.vault.on("rename", () => this.scheduleInboxBadgeSync()));
      this.registerEvent(this.app.metadataCache.on("changed", () => this.scheduleInboxBadgeSync()));

      // Reload the ontology when schema notes under the ontology folder change
      // (debounced; no-op while the feature is off).
      const inOntology = (path: string): boolean => path.startsWith(`${normalizePath(this.settings.ontologyFolder)}/`);
      this.registerEvent(this.app.vault.on("modify", (f) => { if (f instanceof TFile && f.extension === "md" && this.settings.ontologyEnabled && inOntology(f.path)) this.onboarding().scheduleOntologyReload(); }));
      this.registerEvent(this.app.vault.on("create", (f) => { if (f instanceof TFile && f.extension === "md" && this.settings.ontologyEnabled && inOntology(f.path)) this.onboarding().scheduleOntologyReload(); }));
      this.registerEvent(this.app.vault.on("delete", (f) => { if (f instanceof TFile && f.extension === "md" && this.settings.ontologyEnabled && inOntology(f.path)) this.onboarding().scheduleOntologyReload(); }));
      this.registerEvent(this.app.vault.on("rename", (f, oldPath) => { if (f instanceof TFile && f.extension === "md" && this.settings.ontologyEnabled && (inOntology(f.path) || inOntology(oldPath))) this.onboarding().scheduleOntologyReload(); }));

      this.orders().start();
  }

  /** Keeps the plan Build action and the last-seen note in step with the workspace. */
  private registerNoteTracking(): void {
    // Show a "Build" action in the header of any `type: plan` note.
    this.registerEvent(this.app.workspace.on("file-open", () => this.research().syncPlanBuildActions()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.research().syncPlanBuildActions()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
      if (file) this.lastMarkdownFile = file;
    }));
    // Active = last focused chat leaf: track it for activateView()'s reuse
    // preference, and point the store's active conversation at it so a save
    // from a background tab never steals the slot the user is looking at.
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      if (!(leaf?.view instanceof ChatView)) return;
      this.lastFocusedChatLeaf = leaf;
      const id = leaf.view.getState().conversationId;
      if (typeof id === "string" && id !== this.convState.activeId) void this.conversations().setActive(id);
    }));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.research().syncPlanBuildActions()));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      this.research().scheduleResearchRefresh(file.path);
    }));
  }

  /** Right-click entries that mirror commands, on a selection and in the file explorer. */
  private registerContextMenus(): void {
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        if (!(view instanceof MarkdownView) || !view.file) return;
        menu.addItem((item) =>
          item
            .setTitle(inlineEditMenuTitle(editor.getSelection()))
            .setIcon("sparkles")
            .onClick(() => void this.startInlineEdit(editor, view)),
        );
      }),
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "md") {
          menu.addItem((item) =>
            item
              .setTitle("Tidy with Claude…")
              .setIcon("sparkles")
              .onClick(() => void this.enrichNoteFlow(file)),
          );
          const published = this.publishing().publishedItems().some((entry) => entry.key === file.path);
          menu.addItem((item) =>
            item
              .setTitle(published ? "Republish to GitHub Gist" : "Publish note to GitHub Gist")
              .setIcon("share-2")
              .onClick(() => void this.publish().publishNote(file.path)),
          );
          if (published) {
            menu.addItem((item) =>
              item
                .setTitle("Copy published link")
                .setIcon("link")
                .onClick(() => void this.publish().copyLink(file.path)),
            );
            menu.addItem((item) =>
              item
                .setTitle("Unpublish from GitHub Gist")
                .setIcon("trash")
                .onClick(() => void this.publish().unpublish(file.path)),
            );
          }
        } else if (file instanceof TFolder) {
          menu.addItem((item) =>
            item
              .setTitle("Tidy notes with Claude…")
              .setIcon("sparkles")
              .onClick(() => void this.enrichFolderFlow(file)),
          );
          menu.addItem((item) =>
            item
              .setTitle("Organize notes into subfolders…")
              .setIcon("folder-tree")
              .onClick(() => void this.organizeFolderFlow(file)),
          );
        }
      }),
    );
  }

  /** Everything `companionCommands` needs, so the definitions stay free of the plugin. */
  private commandActionsCache?: CommandActions;

  commandActions(): CommandActions {
    return this.commandActionsCache ??= buildCommandActions(this);
  }

  /** Turn vault search on for the active chat tab and tell the user which engine answers. */
  async enableVaultSearch(): Promise<void> {
    const view = await this.activateView();
    if (!view) return;
    view.enableVaultSearchForChat();
    view.refreshModelLabel();
    const how = this.settings.semanticEnabled ? "semantic + keyword" : "keyword";
    new Notice(`Vault search on for this chat (${how}) — ask your question in the chat panel.`);
  }

  private clippings(): ClippingsController {
    return (this._clippings ??= new ClippingsController({
      app: this.app,
      settings: () => this.settings,
      activity: () => this.activity,
      enrichment: () => this.enrichment(),
      router: () => this.router(),
      diagnostics: () => this.enrichDiagnostics,
      providerErrorHint: (message, provider) => this.utilityRouting().providerErrorHint(message, provider),
    }));
  }

  /** Enrich, infer a folder per clip, review, and move the inbox clippings. */
  async organizeClippings(): Promise<void> {
    return this.clippings().organizeClippings();
  }

  /** Most recently focused markdown file — side views (Desk, Chat) steal active-leaf, so "active note" flows must remember it. */
  lastMarkdownFile: TFile | null = null;
  /** Most recently focused Chat leaf, for activateView()'s desktop reuse preference. */
  private lastFocusedChatLeaf: WorkspaceLeaf | null = null;

  /**
   * Edit with Claude at the cursor: the inline prompt opens over the
   * selection (rewrite) or at the cursor (insert); the flow lives in
   * editor/inlineEdit.ts and writes only through review.
   */
  async startInlineEdit(editor: Editor, view: MarkdownView): Promise<void> {
    const file = view.file;
    const cm = editorViewOf(editor);
    if (!file || !cm) {
      new Notice("Open a note in the editor to edit with Claude.");
      return;
    }
    await runInlineEdit(
      { doc: editor.getValue(), from: editor.posToOffset(editor.getCursor("from")), to: editor.posToOffset(editor.getCursor("to")) },
      {
        path: file.path,
        inlineDiffEnabled: this.settings.inlineDiffEnabled,
        openPrompt: (opts) => openInlinePrompt(cm, opts),
        complete: async (req) => (await this.router().complete("chat", req)).text,
        currentDoc: () => cm.state.doc.toString(),
        review: (session) => reviewInlineWithKeys(this.app, cm, session),
        reviewModal: (rewrite) => this.reviewRewriteInModal(file, cm.state.doc.toString(), rewrite),
        notice: (message) => new Notice(message),
        begin: (label) => beginActivity(this.activity, label),
        failureMessage: (e) => {
          const message = e instanceof Error ? e.message : String(e);
          const hint = this.utilityRouting().providerErrorHint(message, this.router().resolve("chat").provider.id);
          return `Edit failed — ${hint ?? message}`;
        },
      },
    );
  }

  /**
   * Inline diff off: per-hunk DiffModal review → vault.process apply. When the
   * selection isn't unique in the note, the diff is planned against the
   * selection alone and the apply is anchored at the editor offsets.
   */
  private async reviewRewriteInModal(file: TFile, content: string, rewrite: ModalRewrite): Promise<void> {
    const prepared = planModalRewrite(content, rewrite);
    const accepted = await new Promise<boolean[] | null>((resolve) =>
      new DiffModal(this.app, { path: file.path, description: `Rewrite — ${rewrite.instruction}`, plan: prepared.plan }, resolve).open(),
    );
    if (!accepted) return;
    await commitModalRewrite((transform) => this.app.vault.process(file, transform), prepared, accepted, (message) => new Notice(message));
  }

  /** Group a folder's clippings into research themes and write its Triage.md board. */
  private async triageClippings(folderOverride?: string): Promise<void> {
    return this.clippings().triage(folderOverride);
  }

  /** Command-palette entry: pick the folder first so moved/organized notes can be triaged too. */
  async triageClippingsWithPicker(): Promise<void> {
    return this.clippings().triageWithPicker();
  }

  override onunload(): void {
    this._deviceChat?.cancel();
    for (const dispose of [...(this.disposables ?? [])].reverse()) dispose();
    this.disposables = [];
    this.settingsListeners?.clear();
    void this.closeCliSessions();
    for (const cli of [this._cliProvider, this._codexProvider, this._opencodeProvider]) cli?.cancelAll();
    this._activity?.dispose();
    this.utilityRouting().end();
    this._enrichment?.destroy();
    this._clipperSetup?.dispose();
    this._research?.dispose();
    this._desktopIntegrations?.dispose();
    this._build?.destroy();
    this.mcpLifecycleEnded = true;
    this.mcpLifecycleGeneration = (this.mcpLifecycleGeneration ?? 0) + 1;
    this._mcpBridge?.destroy();
    void this._externalMcp?.close();
    this._externalMcp = null;
    this._semantic?.destroy();
    this._onboarding?.dispose();
    if (this.inboxBadgeTimer !== null) window.clearTimeout(this.inboxBadgeTimer);
    this._orders?.dispose();
  }

  /** Lazy external-MCP manager; null until first configured use. */
  externalMcp(): ExternalMcpManager {
    if (!this._externalMcp) this._externalMcp = new ExternalMcpManager(() => this.settings.mcpClientServers, this.manifest.version);
    return this._externalMcp;
  }

  /** External servers' namespaced tool lists (empty when none are configured/reachable). */
  async externalMcpTools(): Promise<AnthropicToolDef[]> {
    if (this.settings.mcpClientServers.every((s) => !s.enabled)) return [];
    return externalAnthropicTools(await this.externalMcp().servers());
  }

  /** Route an mcp__<server>__<tool> call to its server. */
  async callExternalMcp(name: string, args: Record<string, unknown>): Promise<string> {
    return this.externalMcp().call(name, args);
  }

  // ---------- settings ----------

  companionChrome(): CompanionChromeDependencies {
    return {
      app: this.app,
      activity: this.activity,
      snapshot: () => this.quickOptionsSnapshot(),
      save: (change) => this.saveQuickOption(change),
      run: (action) => this.runQuickOption(action),
      openAllSettings: () => this.openCompanionSettings(),
      openDesktopIntegrations: () => this.desktopIntegrations().open(),
      runActivityRecovery: (activityId, actionId) => this.runActivityRecovery(activityId, actionId),
      dismissActivity: (activityId) => this.activity.dismiss(activityId),
    };
  }

  private quickOptionsSnapshot(): QuickOptionsState {
    const clipperStatus = this.clipperSetup().status();
    const embeddingModel = this.settings.embeddingEngine === "builtin"
      ? builtinModelById(this.settings.builtinEmbeddingModel).hfRepo.split("/").at(-1) ?? "Built-in model"
      : this.settings.embeddingEngine === "ollama"
        ? this.settings.embeddingModel
        : this.settings.openaiCompatEmbeddingModel;
    const utilityEndpoint = this.settings.utilityBackend === "ollama"
      ? sanitizeEndpointForDisplay(this.settings.ollamaHost)
      : this.settings.utilityBackend === "custom"
        ? sanitizeEndpointForDisplay(this.settings.openaiCompatHost)
        : undefined;
    return {
      isMobile: Platform.isMobile,
      chatBackend: this.router().chatBackend,
      chatModel: resolveModelId(this.settings.model, this.settings.customModel),
      agentModeEnabled: this.settings.agentModeEnabled,
      vaultContextEnabled: this.settings.context.searchVault,
      memoryIngestOnSave: this.settings.memoryIngestOnSave,
      utilityBackend: this.settings.utilityBackend,
      ...(utilityEndpoint ? { utilityEndpoint } : {}),
      sourceEnrichOnCreate: this.settings.sourceEnrichOnCreate,
      sourceInboxFolder: this.settings.sourceInboxFolder,
      sourceCaptureEnabled: this.settings.sourceCaptureEnabled,
      clipperStatus,
      semanticEnabled: this.settings.semanticEnabled,
      embeddingEngine: this.settings.embeddingEngine,
      embeddingModel,
      ...this.semantic().indexerHealth(),
      memoryEnabled: this.settings.memoryEnabled,
      memoryFolder: this.settings.memoryFolder,
      memoryAutoConsolidate: this.settings.memoryAutoConsolidate,
      discoveryEnabled: this.settings.discoveryEnabled,
      researchModel: this.settings.researchModel,
      researchModelLabel: researchModelChip(this.router().researchStatus()).text,
    };
  }

  private async saveQuickOption(change: QuickOptionChange): Promise<void> {
    const value = change.value;
    switch (change.id) {
      case "chat-backend":
        if (typeof value === "string" && Object.hasOwn(chatBackendOptions(Platform.isMobile), value)) this.settings.chatBackend = value as PluginSettings["chatBackend"];
        else throw new Error("Choose a valid chat backend.");
        break;
      case "agent-mode": this.settings.agentModeEnabled = value === true; break;
      case "vault-context": this.settings.context.searchVault = value === true; break;
      case "memory-capture": this.settings.memoryIngestOnSave = value === true; break;
      case "utility-backend":
        if (value === "claude" || value === "ollama" || value === "custom") this.settings.utilityBackend = value;
        else throw new Error("Choose a valid utility backend.");
        break;
      case "auto-enrich":
        this.settings.sourceEnrichOnCreate = value === true;
        if (value === true) this.settings.sourceCaptureConsent = "allow";
        break;
      case "inbox-folder": this.settings.sourceInboxFolder = String(value).trim() || "Clippings"; break;
      case "source-capture": this.settings.sourceCaptureEnabled = value === true; break;
      case "semantic-search": this.settings.semanticEnabled = value === true; break;
      case "embedding-engine":
        if (value === "builtin" || value === "ollama" || value === "custom") this.settings.embeddingEngine = value;
        else throw new Error("Choose a valid embedding engine.");
        break;
      case "memory-enabled": this.settings.memoryEnabled = value === true; break;
      case "memory-folder": this.settings.memoryFolder = String(value).trim() || "Claude/Memory"; break;
      case "discovery-enabled": this.settings.discoveryEnabled = value === true; break;
      case "research-model":
        if (RESEARCH_MODELS.includes(value as ResearchModel)) this.settings.researchModel = value as ResearchModel;
        else throw new Error("Choose a valid research model.");
        break;
      default: throw new Error("That quick setting is not available.");
    }
    await this.saveSettings();
  }

  private async runQuickOption(action: QuickOptionAction): Promise<void> {
    switch (action.id) {
      case "clipper-schemas": this.clipperSetup().openSetup(); return;
      case "embedding-health":
      case "embedding-settings": this.openCompanionSettings(); return;
      case "rebuild-index":
      case "retry-index": await this.semantic().rebuildSemanticIndex(); return;
      case "consolidate-memory": await this.memory().consolidateMemory(); return;
      case "refresh-system":
        for (const leaf of this.app.workspace.getLeavesOfType(SYSTEM_VIEW_TYPE)) if (leaf.view instanceof SystemView) await leaf.view.render();
        return;
      case "clippings-inbox": await this.activateInboxView(); return;
      case "review-inbox-failures": await this.activateInboxView(); return;
      case "utility-settings": this.openCompanionSettings(); return;
      case "download-builtin": await this.semantic().downloadBuiltinModelAndIndex(); return;
      case "use-builtin-embeddings":
        this.settings.embeddingEngine = "builtin";
        await this.saveSettings();
        if (!(await this.semantic().canEmbedWithoutDownload())) await this.semantic().downloadBuiltinModelAndIndex();
        else await this.semantic().rebuildSemanticIndex();
        return;
      case "all-settings": this.openCompanionSettings(); return;
      default: throw new Error("That quick action is not available yet.");
    }
  }

  openCompanionSettings(): void {
    this.openSettingsTab("claude-companion");
  }

  /** Obsidian's General tab, which owns the CLI switch and its Register action. */
  openObsidianCliSettings(): void {
    this.openSettingsTab(OBSIDIAN_GENERAL_SETTINGS_TAB);
  }

  private openSettingsTab(tabId: string): void {
    const app = this.app as App & {
      setting?: { open?: () => void; openTabById?: (id: string) => void };
      commands?: { executeCommandById?: (id: string) => boolean };
    };
    if (app.setting?.open) {
      app.setting.open();
      app.setting.openTabById?.(tabId);
      return;
    }
    app.commands?.executeCommandById?.("app:open-settings");
  }

  async runActivityRecovery(activityId: string, actionId: string): Promise<void> {
    if (activityId.startsWith("order:")) {
      if (actionId === "retry") return this.standingOrders().retry(activityId);
      const orderId = activityId.slice("order:".length).replace(/:\d+$/, "");
      const file = this.app.vault.getAbstractFileByPath(orderId);
      if (!(file instanceof TFile)) throw new Error(`Order note missing: ${orderId}`);
      await this.app.workspace.getLeaf(false).openFile(file);
      return;
    }
    if (activityId.startsWith("chat-turn:")) {
      const conversationId = activityId.slice("chat-turn:".length);
      const conversation = this.conversations().list().find(({ id }) => id === conversationId);
      if (!conversation) throw new Error("That conversation no longer exists.");
      if (actionId === "stop-chat-turn") {
        if (!conversation.activeTurn) return;
        await this.conversations().stopTurn(conversationId, conversation.activeTurn.id);
        return;
      }
      await this.conversations().setActive(conversationId);
      const existingLeaf = this.chatLeafFor(conversationId);
      let view: ChatView | null;
      if (existingLeaf) {
        await this.app.workspace.revealLeaf(existingLeaf);
        view = existingLeaf.view instanceof ChatView ? existingLeaf.view : null;
      } else {
        view = await this.activateView();
      }
      view?.loadConversation(this.conversations().getActive() ?? conversation);
      if (actionId === "resume-chat-turn") {
        const active = this.conversations().getActive();
        if (view && active) await view.resumeInterruptedTurn(active);
      }
      return;
    }
    if (actionId === "copy-diagnostics") {
      const logPath = "Claude/enrichment-diagnostics.log";
      if (!(await this.app.vault.adapter.exists(logPath))) throw new Error("No enrichment diagnostics log exists yet — set enrichmentDiagnostics to true in the plugin data.json and run Enrich all again.");
      const text = await this.app.vault.adapter.read(logPath);
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable on this device.");
      await navigator.clipboard.writeText(text.slice(-8192));
      return;
    }
    if (actionId === "copy-details") {
      const details = this.activity.snapshot().records.find(({ id }) => id === activityId)?.technicalDetails;
      if (!details) throw new Error("No technical details are available for this activity.");
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable on this device.");
      await navigator.clipboard.writeText(details);
      return;
    }
    await this.runQuickOption({ id: actionId, page: "related", activityId });
  }

  /** Obsidian's OS-encrypted secret store, or an unavailable one below 1.11.5. */
  secrets(): SecretStore {
    this._secrets ??= createSecretStore(this.app);
    return this._secrets;
  }

  /** Credentials the secret store would not accept on the last write. */
  secretsWriteFailures(): readonly SecretField[] {
    return this.unverifiedSecrets;
  }

  async loadSettings(): Promise<void> {
    const raw = (await this.loadData()) as PersistedData | Partial<PluginSettings> | null;
    const loaded = resolveSettings(raw);
    this.convState = isNamespacedData(raw)
      ? fromPersisted({ conversations: raw.conversations, activeId: raw.activeConversationId })
      : emptyState();
    this.conversations().restoreTurnActivities();
    this.build().restoreState(
      isNamespacedData(raw) ? raw.buildRuns : undefined,
      isNamespacedData(raw) ? raw.activeBuildRunId : null,
    );
    this.orders().restore(isNamespacedData(raw) ? raw.standingOrders : undefined, isNamespacedData(raw) ? raw.orderEditQueue : undefined);
    this.publishing().restore(isNamespacedData(raw) ? raw.published : undefined);
    this.optimizeState = normalizeOptimizeState(isNamespacedData(raw) ? raw.optimize : undefined);

    // Any plaintext credential still in data.json moves to the secret store now,
    // then the file is rewritten without it. Must run after buildRuns is restored:
    // the persist below serializes them, and empty state here would wipe them.
    const store = this.secrets();
    const { moved, settings } = migrateSecrets(loaded, store);
    this.settings = hydrate(settings, store);
    if (moved.length > 0) {
      await this.persist();
      new Notice(migrationNotice(moved), 15000);
    }
  }

  /** Write settings + conversation history back to data.json, minus credentials. */
  private async persist(): Promise<void> {
    const result = (this.persistChain ?? Promise.resolve()).catch(() => {}).then(async () => {
      const store = this.secrets();
      // Credentials the store proved it holds are dropped here; any the backend
      // silently refused stay in the file so they are not lost from both places.
      const stripped = stripVerifiedSecrets(this.settings, store);
      this.unverifiedSecrets = stripped.unverified;
      const data = JSON.parse(JSON.stringify({
        settings: stripped.settings,
        conversations: this.convState.conversations,
        activeConversationId: this.convState.activeId,
        ...this.orders().serializeState(),
        ...this.publishing().serializeState(),
        optimize: this.optimizeState,
        ...this.build().serializeState(),
      })) as PersistedData;
      await this.saveData(data);
    });
    this.persistChain = result.catch(() => {});
    await result;
  }

  async saveSettings(): Promise<void> {
    // Credentials go to the secret store first; persist() then strips them.
    syncSecrets(this.settings, this.secrets());
    await this.persist();
    // Rebuild providers if any credentials/hosts changed.
    this._router = null;
    // External MCP server list changed → drop stale sessions so they reconnect fresh.
    const serversJson = JSON.stringify(this.settings.mcpClientServers);
    if (this._mcpServersSnapshot !== serversJson) {
      this._mcpServersSnapshot = serversJson;
      if (this._externalMcp) void this._externalMcp.close();
    }
    this._semantic?.onSettingsChanged();
    this.refreshViews();
    await this.syncMcpServer();
    for (const listener of this.settingsListeners ?? []) listener();
  }

  // ---------- conversation history ----------

  /** Every chat project available in this vault (chat-project notes + Research Desk projects). */
  async listChatProjects(): Promise<ChatProject[]> {
    return listChatProjects(this.app, this.research().researchRepository());
  }

  /** The chat project a conversation is scoped to, or null when it has none. */
  async chatProjectFor(conversationId: string | null): Promise<ChatProject | null> {
    if (!conversationId) return null;
    const projectId = this.conversations().list().find((c) => c.id === conversationId)?.projectId ?? null;
    if (!projectId) return null;
    const projects = await this.listChatProjects();
    return projects.find((p) => p.id === projectId) ?? null;
  }

  async browseConversations(): Promise<void> {
    const view = await this.activateView();
    view?.openHistory();
  }

  async deleteActiveConversation(): Promise<void> {
    const active = this.conversations().getActive();
    if (!active) {
      new Notice("No active conversation to delete.");
      return;
    }
    await this.conversations().delete(active.id);
    const view = await this.activateView();
    if (!view) return;
    const next = this.conversations().getActive();
    if (next) view.loadConversation(next);
    else view.resetToEmpty();
    new Notice(`Deleted “${active.title}”.`);
  }

  // ---------- MCP bridge ----------

  syncMcpServer(): Promise<void> {
    return this.mcpBridge().sync();
  }

  private resolvedMcpToken(): string {
    return this.mcpBridge().resolvedToken();
  }

  mcpRunning(): boolean {
    return this.mcpBridge().running();
  }

  mcpStats(): { running: boolean; port: number | null; activeRequests: number; handledRequests: number } {
    return this.mcpBridge().stats();
  }

  async setMcpEnabled(enabled: boolean): Promise<void> {
    return this.mcpBridge().setEnabled(enabled);
  }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)) {
      const v = leaf.view;
      if (v instanceof ChatView) {
        v.refreshModelLabel();
        void v.refreshBackendPill();
        void v.refreshContextStatus();
      }
    }
    for (const leaf of this.app.workspace.getLeavesOfType(RESEARCH_DESK_VIEW_TYPE)) if (leaf.view instanceof ResearchView) void leaf.view.render();
  }

  // ---------- providers ----------

  private chatCliProvider(): CliProvider {
    const router = this.router();
    switch (this.settings.chatBackend) {
      case "codex-cli": return router.codexCli;
      case "opencode-cli": return router.opencodeCli;
      default: return router.claudeCli;
    }
  }

  router(): ProviderRouter {
    if (this._router && !this._router.hasCurrentAnthropicEnvironment()) this._router = null;
    const runtime = this.cliRuntime();
    this._cliProvider ??= new CliProvider(claudeBackend, runtime, () => this.vaultBasePath());
    this._codexProvider ??= new CliProvider(codexBackend, runtime, () => this.vaultBasePath());
    this._opencodeProvider ??= new CliProvider(opencodeBackend, runtime, () => this.vaultBasePath());
    if (!this._router) {
      this._router = new ProviderRouter(this.settings, () => this.utilityRouting().resolveSession(), {
        cliRuntime: runtime,
        isMobile: Platform.isMobile,
        cliProvider: this._cliProvider,
        codexProvider: this._codexProvider,
        opencodeProvider: this._opencodeProvider,
        deviceProvider: new DeviceProvider(this.settings.chatBackend === "device" ? this.deviceChat() : null),
      });
    }
    return this._router;
  }

  private _deviceChat?: DeviceChatClient;
  deviceChat(): DeviceChatClient {
    if (!this._deviceChat) {
      this._deviceChat = new DeviceChatClient(createEmbedWorker, () => {
        if (Platform.isMobile) this._semantic?.pauseForDeviceChat();
      });
      this.registerDomEvent(document, "visibilitychange", () => {
        if (document.hidden) this._deviceChat?.cancel();
      });
    }
    return this._deviceChat;
  }

  /** Lazy ontology registry; null while the feature is disabled. IO is wired here; logic is pure. */
  ontology(): OntologyRegistry | null {
    if (!this.settings.ontologyEnabled) return null;
    if (!this._ontology) {
      this._ontology = new OntologyRegistry({
        listSchemaNotes: async () => {
          const folder = normalizePath(this.settings.ontologyFolder);
          const out: Array<{ path: string; frontmatter?: Record<string, unknown> | undefined; body: string }> = [];
          for (const f of this.app.vault.getMarkdownFiles()) {
            if (f.path !== folder && !f.path.startsWith(`${folder}/`)) continue;
            const fm = this.app.metadataCache.getFileCache(f)?.frontmatter as Record<string, unknown> | undefined;
            out.push({ path: f.path, frontmatter: fm, body: await this.app.vault.cachedRead(f) });
          }
          return out;
        },
        parseYaml: (src) => parseYaml(src) as unknown,
      });
    }
    return this._ontology;
  }

  composeSystemPrompt(opts?: { agent?: boolean; plan?: boolean; project?: ChatProject | null; compact?: boolean }): string {
    let base = opts?.compact ? this.settings.systemPrompt : `${this.settings.systemPrompt}\n\n${DESIGN_SYSTEM_PROMPT}`;
    const digest = this.ontology()?.digest();
    if (digest) base = `${base}\n\n${digest}`;
    if (opts?.project) base = `${base}\n\n${projectSystemPrompt(opts.project)}`;
    if (opts?.agent) base = `${base}\n\n${AGENT_INSTRUCTION}`;
    if (opts?.agent && opts?.plan) base = `${base}\n\n${PLAN_MODE_INSTRUCTION}`;
    return base;
  }

  /** Every markdown note as a link-candidate (basename + frontmatter aliases). */
  linkCandidates(): LinkCandidate[] {
    return withLinktext(
      this.app.vault.getMarkdownFiles().map((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter as Record<string, unknown> | undefined;
        const raw = fm?.aliases;
        const aliases = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" && raw.trim() ? [raw] : [];
        return { path: f.path, basename: f.basename, aliases };
      }),
    );
  }

  /** Paths the given note already links to (its outgoing resolved links). */
  linkedTargets(file: TFile): Set<string> {
    const resolved = (this.app.metadataCache as unknown as { resolvedLinks?: Record<string, Record<string, number>> }).resolvedLinks ?? {};
    return new Set(Object.keys(resolved[file.path] ?? {}));
  }

  /**
   * Bulk-link the unlinked mentions of a note through the diff review flow
   * (spec 2026-07-05 link intelligence): every proposed [[link]] is a hunk the
   * user can accept or reject before anything is written.
   */
  async reviewLinkSuggestions(target?: TFile): Promise<void> {
    const file = target ?? this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || file.extension !== "md") {
      new Notice("Open a note first.");
      return;
    }
    const content = await this.app.vault.cachedRead(file);
    const mentions = findUnlinkedMentions(content, this.linkCandidates(), file.path);
    if (mentions.length === 0) {
      new Notice("No unlinked mentions found.");
      return;
    }
    const edits = mentionEdits(content, mentions);
    if (edits.length === 0) {
      new Notice("Mentions found, but none could be linked unambiguously.");
      return;
    }
    // Planning validates the edits; a rejected plan is a notice, never an unhandled rejection.
    let plan;
    try {
      plan = planEdits(content, edits);
    } catch (e) {
      new Notice(e instanceof Error ? e.message : String(e));
      return;
    }
    const accepted = await new Promise<boolean[] | null>((resolve) => {
      new DiffModal(this.app, { path: file.path, description: `Link ${plan.hunks.length} unlinked mention${plan.hunks.length === 1 ? "" : "s"}`, plan }, resolve).open();
    });
    if (!accepted) return;
    try {
      await this.app.vault.process(file, (current) => applyPlan(current, plan, accepted));
      new Notice(`Linked ${accepted.filter(Boolean).length} mention${accepted.filter(Boolean).length === 1 ? "" : "s"} in ${file.basename}.`);
    } catch (e) {
      new Notice(e instanceof Error ? e.message : String(e));
    }
  }

  /** Review and apply link proposals for the supplied enriched Inbox notes. */
  async reviewInboxLinkSuggestions(files: TFile[]): Promise<BatchLinkApplyResult | null> {
    return reviewInboxBatchLinks(files, this.linkCandidates(), {
      read: (file) => this.app.vault.cachedRead(file),
      getFile: (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        return file instanceof TFile ? file : null;
      },
      process: async (file, transform) => { await this.app.vault.process(file, transform); },
      select: (plans) => new Promise((resolve) => {
        new BatchDiffModal(this.app, plans, resolve).open();
      }),
    });
  }

  /**
   * Enrich one note end to end (file-explorer right-click / command): pick the
   * steps (all on by default), then summarize → propose rename + tags/summary,
   * wikilink unlinked mentions, and copyedit — all presented for review as
   * per-item checkboxes + diff hunks before anything is written.
   */
  async enrichNoteFlow(file: TFile, presetOptions?: EnrichOptions): Promise<void> {
    const options =
      presetOptions ?? (await new Promise<EnrichOptions | null>((resolve) => new EnrichOptionsModal(this.app, 1, resolve).open()));
    if (!options) return;

    const progress = beginActivity(this.activity, `Tidying ${file.basename}…`);
    try {
      const proposal = await this.buildEnrichProposal(file, options);
      if (!proposal.rename && !proposal.frontmatter && !proposal.plan) {
        new Notice(`${file.basename} is already in good shape.`);
        return;
      }
      progress.finish();
      const decision = await new Promise<EnrichDecision | null>((resolve) =>
        new EnrichReviewModal(this.app, proposal, resolve).open(),
      );
      if (!decision) return;
      await this.applyEnrichDecision(file, proposal, decision);
      new Notice(`Tidied ${file.basename}.`);
    } catch (e) {
      progress.fail(e);
      new Notice(`Tidy failed — ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      progress.finish();
    }
  }

  /** Batch variant for a folder: one step picker, then per-note review modals. */
  private async enrichFolderFlow(folder: TFolder): Promise<void> {
    const files: TFile[] = [];
    const walk = (f: TFolder): void => {
      for (const child of f.children) {
        if (child instanceof TFile && child.extension === "md") files.push(child);
        else if (child instanceof TFolder) walk(child);
      }
    };
    walk(folder);
    if (files.length === 0) {
      new Notice(`No notes found in ${folder.path}/.`);
      return;
    }
    const options = await new Promise<EnrichOptions | null>((resolve) => new EnrichOptionsModal(this.app, files.length, resolve).open());
    if (!options) return;
    for (const file of files) {
      await this.enrichNoteFlow(file, options);
    }
  }

  /** Compute everything an enrich pass can propose for one note (no writes). */
  private async buildEnrichProposal(file: TFile, options: EnrichOptions): Promise<EnrichProposal> {
    const content = await this.app.vault.cachedRead(file);
    const proposal: EnrichProposal = { path: file.path };

    let tagResult: { title: string; tags: string[]; newTags: string[]; summary: string } | null = null;
    if (options.rename || options.frontmatter) {
      try {
        tagResult = await summarizeAndTag(this.router(), content, vaultVocabulary(this.app));
      } catch (e) {
        if (e instanceof UtilityUnavailableError) throw e;
        // Tagging is best-effort — links/lint still run.
      }
    }

    // Compose body transforms: links first, then lint the linked text, so the
    // final old→new diff is one consistent set of non-overlapping hunks.
    let body = content;
    if (options.links) {
      const mentions = findUnlinkedMentions(content, this.linkCandidates(), file.path);
      for (const m of [...mentions].sort((a, b) => b.start - a.start)) {
        body = linkMention(body, m);
      }
    }
    if (options.lint && body.trim().length > 0) {
      try {
        const { text } = await this.router().complete("chat", {
          system: LINT_SYSTEM,
          user: buildLintUser(body),
          maxTokens: lintMaxTokens(body),
          temperature: 0.2,
        });
        body = parseLintResponse(text, body) ?? body;
      } catch (e) {
        console.debug("Claude Companion: lint pass failed, keeping prior result", e);
      }
    }
    const edits = diffToEdits(content, body);
    if (edits.length > 0) proposal.plan = planEdits(content, edits);

    if (options.rename && tagResult?.title) {
      const stem = sanitizeFileName(tagResult.title);
      if (stem && stem !== file.basename) {
        const dir = file.parent && file.parent.path !== "/" ? file.parent.path : "";
        let candidate = stem;
        for (let n = 2; this.app.vault.getAbstractFileByPath(dir ? `${dir}/${candidate}.md` : `${candidate}.md`); n++) candidate = `${stem} ${n}`;
        proposal.rename = { from: file.path, to: dir ? `${dir}/${candidate}.md` : `${candidate}.md` };
      }
    }

    if (options.frontmatter && tagResult) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
      const existing: string[] = Array.isArray(fm?.tags) ? fm.tags.map(String) : typeof fm?.tags === "string" ? [fm.tags] : [];
      const merged = normalizeTags([...existing, ...tagResult.tags]);
      const addedTags = merged.filter((t) => !existing.includes(t));
      const newTags = addedTags.filter((t) => tagResult.newTags.includes(t));
      const summary = typeof fm?.summary === "string" && fm.summary.trim() ? "" : tagResult.summary;
      if (addedTags.length > 0 || summary) proposal.frontmatter = { tags: merged, summary, addedTags, newTags };
    }

    return proposal;
  }

  /** Apply the reviewed subset: content hunks, frontmatter, then the rename last. */
  private async applyEnrichDecision(
    file: TFile,
    proposal: EnrichProposal,
    decision: EnrichDecision,
  ): Promise<void> {
    if (proposal.plan && decision.accepted.some(Boolean)) {
      const plan = proposal.plan;
      await this.app.vault.process(file, (current) => applyPlan(current, plan, decision.accepted));
    }
    if (proposal.frontmatter && decision.frontmatter) {
      const { tags, summary } = proposal.frontmatter;
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        (fm as Record<string, unknown>).tags = tags;
        if (summary) (fm as Record<string, unknown>).summary = summary;
      });
    }
    if (proposal.rename && decision.rename) {
      await this.app.fileManager.renameFile(file, proposal.rename.to);
    }
  }

  /**
   * Folder right-click "Organize notes into subfolders": batch-infer a
   * subfolder per note from titles/summaries, review the proposed move plan,
   * then execute the accepted subset.
   */
  private async organizeFolderFlow(folder: TFolder): Promise<void> {
    return this.clippings().organizeFolder(folder);
  }

  /** Vault tools for the in-chat agent loop, options refreshed from settings on every call. */
  agentTools(): VaultTools {
    const opts = vaultToolOptions(this, this.settings.agentAllowWrites, "companion");
    if (!this.agentVaultTools) this.agentVaultTools = new VaultTools(this.app, opts);
    else this.agentVaultTools.setOptions(opts);
    return this.agentVaultTools;
  }

  /** Desktop only: the Node ports shared by every CLI chat backend. Tests override this. */
  cliRuntime(): CliRuntime | null {
    if (this._cliRuntime !== undefined) return this._cliRuntime;
    if (Platform.isMobile || !(this.app.vault.adapter instanceof FileSystemAdapter)) {
      this._cliRuntime = null;
      return null;
    }
    this._cliRuntime = createNodeCliRuntime();
    return this._cliRuntime;
  }

  private async createChatBridge(binding: { deps: InteractiveToolDeps; run: ToolRunKind; backend: CliBackend }): Promise<{ server: McpHttpServer; port: number; token: string }> {
    const { McpHttpServer } = await import("./mcp/server");
    const token = generateToken();
    const registry = bridgeTools(this.agentTools(), { run: binding.run, deps: binding.deps, permissionPrompt: binding.backend.supportsPermissionPrompt, unavailable: (name) => this.agentTools().unavailable(name) });
    const server = new McpHttpServer(
      {
        port: 0,
        token,
        serverInfo: { name: "obsidian-vault", version: this.manifest.version },
        resources: composeResourceProviders(
          substrateResourceProvider(this.app, { call: (n, a) => this.agentTools().call(n, a), memoryPath: () => this.memoryNotePath() }),
          vaultResourceProvider(this.app),
        ),
        prompts: catalogPromptProvider(() => this.promptTemplates()),
      },
      registry,
      (level, message) => { if (level === "error") console.error("[Claude Companion chat bridge]", message); },
      CLI_HIDDEN_TOOLS,
    );
    await server.start();
    const addr = server.address();
    if (!addr) {
      await server.stop();
      throw new Error("The chat bridge did not bind.");
    }
    return { server, port: addr.port, token };
  }

  /** The CLI backend the settings currently select for chat, defaulting to Claude Code for any non-CLI value. */
  private cliBackendFor(chatBackend: PluginSettings["chatBackend"]): CliBackend {
    if (chatBackend === "codex-cli") return codexBackend;
    if (chatBackend === "opencode-cli") return opencodeBackend;
    return claudeBackend;
  }

  async cliTurnRunner(opts: { conversationId: string; run: ToolRunKind; model: string; deps: InteractiveToolDeps; transcript: string; resumeSessionId?: string }): Promise<AgentTurnRunner> {
    const backend = this.cliBackendFor(this.settings.chatBackend);
    const cli = this.router().get(backend.id) as CliProvider;
    const executable = cli.executable();
    if (!executable) throw new Error(cli.probe() ? `${backend.label} is not signed in. ${backend.signInHint[0]!.toUpperCase()}${backend.signInHint.slice(1)} in a terminal.` : `${backend.label} not found.`);
    const runtime = this.cliRuntime();
    const cwd = this.vaultBasePath();
    if (!runtime || !cwd) throw new Error(`${backend.label} runs on desktop only.`);
    const vaultDefs = this.agentTools().definitions();
    const allowedTools = cliAllowedTools(vaultDefs, toolAccess(opts.run, vaultDefs));
    const signature = JSON.stringify({ run: opts.run, backend: backend.id, model: opts.model, allowedTools, writes: this.settings.agentAllowWrites });
    const open = () => this.openCliSession(opts, { backend, executable, runtime, cwd, allowedTools });
    return this.cliPool.acquire(opts.conversationId, signature, open, { fresh: !!opts.resumeSessionId });
  }

  /** A new CLI session with its own chat bridge and prompt file; on failure everything it opened is released. */
  private async openCliSession(
    opts: Parameters<ClaudeCompanionPlugin["cliTurnRunner"]>[0],
    { backend, executable, runtime, cwd, allowedTools }: { backend: CliBackend; executable: string; runtime: CliRuntime; cwd: string; allowedTools: string[] },
  ): Promise<PoolEntry<CliSession>> {
    const project = await this.chatProjectFor(opts.conversationId);
    const systemPrompt = this.composeSystemPrompt({ agent: true, plan: opts.run === "plan", project });
    const promptFile = backend.processModel === "persistent" ? await runtime.writeSystemPromptFile(systemPrompt) : "";
    let bridge: McpHttpServer | null = null;
    const release = async (): Promise<void> => {
      await bridge?.stop();
      if (promptFile) await runtime.removeFile(promptFile);
    };
    try {
      const started = await this.createChatBridge({ deps: opts.deps, run: opts.run, backend });
      bridge = started.server;
      const mcpConfig = mcpConfigJson(started.port, started.token);
      let session: CliSession;
      let sessionIdToPersist: string | undefined;
      if (backend.processModel === "persistent") {
        const sessionId = opts.resumeSessionId ?? crypto.randomUUID();
        const argv = backend.buildArgv({
          model: opts.model,
          systemPromptFile: promptFile,
          mcpConfigJson: mcpConfig,
          allowedTools,
          maxTurns: this.settings.agentMaxIterations,
          cwd,
          ...(opts.resumeSessionId ? { resumeSessionId: opts.resumeSessionId } : { sessionId }),
        });
        session = new CliSession({ backend, spawn: () => runtime.spawn(executable, argv, cwd), ...(opts.transcript ? { transcript: opts.transcript } : {}) });
        sessionIdToPersist = sessionId;
      } else {
        session = new CliSession({
          backend,
          spawnTurn: (argv, env) => runtime.spawn(executable, argv, cwd, env),
          argvTemplate: { model: opts.model, systemPromptFile: "", mcpConfigJson: mcpConfig, allowedTools, maxTurns: this.settings.agentMaxIterations, cwd },
          systemPromptText: systemPrompt,
          onSessionId: (id) => void this.setConversationCliSession(opts.conversationId, id),
          ...(opts.transcript ? { transcript: opts.transcript } : {}),
          ...(opts.resumeSessionId ? { initialSessionId: opts.resumeSessionId } : {}),
        });
      }
      if (sessionIdToPersist) await this.setConversationCliSession(opts.conversationId, sessionIdToPersist);
      return { session, release };
    } catch (error) {
      await release();
      throw error;
    }
  }

  interruptCliTurn(conversationId: string): void {
    this._cliPool?.interrupt(conversationId);
  }

  async closeCliSessions(): Promise<void> {
    await this._cliPool?.closeAll();
  }

  async setConversationCliSession(conversationId: string, sessionId: string): Promise<void> {
    return this.conversations().setCliSession(conversationId, sessionId);
  }

  /**
   * Defuddle capture for chat's "Attach page content" affordance. Undefined in
   * headless/test environments (no DOMParser) — callers hide the offer then.
   * Every call is an explicit user action; nothing fetches automatically.
   */
  captureWebPage(): WebCapture | undefined {
    if (typeof DOMParser === "undefined") return undefined;
    return (url: string) =>
      captureWebSource(url, {
        fetchHtml: async (target) => {
          const response = await requestUrl({ url: target, method: "GET", throw: false });
          if (response.status >= 400) throw new Error(`Fetch failed with status ${response.status}`);
          return response.text;
        },
        parseHtml: (html) => new DOMParser().parseFromString(html, "text/html"),
      });
  }

  // ---------- standing orders ----------
  standingOrders(): OrdersController {
    return this.orders().standingOrders();
  }

  // ---------- prompt templates (user slash commands) ----------
  /** Load every prompt-template note in the templates folder (vault is the source of truth). */
  async promptTemplates(): Promise<PromptTemplate[]> {
    const folder = normalizePath(this.settings.templatesFolder).replace(/\/+$/, "");
    if (!folder) return [];
    const prefix = `${folder}/`;
    const out: PromptTemplate[] = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(prefix)) continue;
      try {
        const fm = (this.app.metadataCache.getFileCache(f)?.frontmatter as Record<string, unknown> | undefined) ?? {};
        const body = stripFrontmatter(await this.app.vault.cachedRead(f));
        const template = parseTemplateNote(f.path, f.basename, fm, body);
        if (template) out.push(template);
      } catch (e) {
        console.debug("Claude Companion: skipping unreadable template", f.path, e);
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  /** Scaffold a template note with the frontmatter schema and open it for editing. */
  async createPromptTemplate(): Promise<void> {
    const folder = normalizePath(this.settings.templatesFolder);
    await ensureVaultFolder(this.app, folder);
    let path = normalizePath(`${folder}/My template.md`);
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) {
      path = normalizePath(`${folder}/My template ${i}.md`);
    }
    const file = await this.app.vault.create(path, TEMPLATE_SCAFFOLD);
    await this.app.workspace.getLeaf(false).openFile(file);
    new Notice("Template created — edit the prompt, then run it as /my-template in chat.");
  }

  /** Open an artifact per the user's setting: in-app fullscreen, or a browser. */
  openArtifact(html: string, title: string): void {
    this.openArtifactWith(html, title, this.settings.artifactOpenTarget);
  }

  /** Open an artifact with an explicit target (split-button dropdown). */
  openArtifactWith(html: string, title: string, target: ArtifactOpenTarget): void {
    if (target === "obsidian") {
      new ArtifactModal(this.app, html, title).open();
    } else {
      void openArtifactExternally(html, title, target);
    }
  }

  // ---------- view ----------

  async activateView(): Promise<ChatView | null> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null;
    if (Platform.isMobile) {
      // Mobile's right split is a drawer, not the full-width main workspace.
      // Reuse only a Chat leaf outside that drawer so repeated activation keeps
      // the same conversation without accumulating duplicate main tabs.
      const rightSplit = workspace.rightSplit;
      const candidates = workspace.getLeavesOfType(CHAT_VIEW_TYPE).filter((candidate) => {
        let parent: unknown = candidate.parent;
        while (parent) {
          if (parent === rightSplit) return false;
          parent = (parent as { parent?: unknown }).parent;
        }
        return true;
      });
      const preferred = this.lastFocusedChatLeaf && candidates.includes(this.lastFocusedChatLeaf) ? this.lastFocusedChatLeaf : null;
      leaf = preferred ?? candidates[0] ?? null;
      if (!leaf) {
        leaf = workspace.getLeaf("tab");
        await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
      }
    } else {
      const chatLeaves = workspace.getLeavesOfType(CHAT_VIEW_TYPE);
      const preferred = this.lastFocusedChatLeaf && chatLeaves.includes(this.lastFocusedChatLeaf) ? this.lastFocusedChatLeaf : null;
      leaf = preferred ?? chatLeaves[0] ?? null;
      if (!leaf) {
        leaf = workspace.getRightLeaf(false);
        if (leaf) await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
      }
    }
    if (leaf) {
      await workspace.revealLeaf(leaf);
      return leaf.view instanceof ChatView ? leaf.view : null;
    }
    return null;
  }

  /** Open a fresh, empty Chat tab alongside any others (desktop and mobile alike). */
  async openNewChatTab(): Promise<ChatView | null> {
    const { workspace } = this.app;
    const leaf = workspace.getLeaf("tab");
    await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true, state: { conversationId: null } });
    await workspace.revealLeaf(leaf);
    return leaf.view instanceof ChatView ? leaf.view : null;
  }

  async companionWorkspaceContext(): Promise<CompanionWorkspaceCard | null> {
    const active = this.app.workspace.getActiveFile();
    if (!(active instanceof TFile) || active.extension !== "md") return null;
    const frontmatter = this.app.metadataCache.getFileCache(active)?.frontmatter as Record<string, unknown> | undefined;
    const projectPath = inferResearchProjectPath(active.path, frontmatter);
    if (projectPath) {
      try {
        const snapshot = await this.research().researchRepository().loadProject(projectPath);
        const audit = auditProject(snapshot);
        const document = await documentSections(snapshot, (path) => this.research().researchRepository().loadDraftSections(path));
        const steps = nextSteps({ snapshot, audit, ...(document ? { sections: document.sections } : {}), webSearch: this.settings.webSearchEnabled });
        return resolveCompanionWorkspace({
          activeNote: { path: active.path, title: active.basename },
          research: {
            projectPath,
            title: snapshot.project.title,
            stage: deriveResearchStage(snapshot, document?.sections.map(({ state }) => state)),
            ...(steps[0] ? { nextAction: steps[0].label } : {}),
            steps,
          },
        });
      } catch (e) { console.debug("Claude Companion: research workspace resolution failed, using active note", e); }
    }
    return resolveCompanionWorkspace({ activeNote: { path: active.path, title: active.basename } });
  }

  async askCompanionAboutProject(projectPath: string): Promise<void> {
    const view = await this.activateView();
    view?.prepareWorkspaceQuestion({ kind: "research", title: "Continue this research project", contextPath: projectPath });
  }

  // ---------- session memory ----------

  /** Absolute path of the current vault, or null if not a desktop file vault. */
  private vaultBasePath(): string | null {
    const adapter = this.app.vault.adapter;
    return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
  }

  async listVaultSessions(): Promise<SessionMeta[]> {
    return this.memory().listVaultSessions();
  }

  /** Open the workflows picker; run the chosen workflow in the chat. */
  async openWorkflowPicker(): Promise<void> {
    new WorkflowPicker(this.app, WORKFLOWS, (wf) => void this.runWorkflow(wf)).open();
  }

  /** Run a vault workflow: ground it (active note + vault search), send its prompt. */
  async runWorkflow(wf: Workflow): Promise<void> {
    const view = await this.activateView();
    if (!view) return;
    // Workflows produce large artifacts — give them output-token headroom.
    await view.submitPrompt(wf.prompt, wf.name, ARTIFACT_MAX_TOKENS, {
      context: { activeNote: true, ...(wf.vaultSearch ? { searchVault: true } : {}) },
    });
  }

  async openSessionPicker(): Promise<void> {
    return this.memory().openSessionPicker();
  }

  async captureSession(session: SessionMeta): Promise<void> {
    return this.memory().captureSession(session);
  }

  async consolidateMemory(opts?: { quiet?: boolean }): Promise<void> {
    return this.memory().consolidateMemory(opts);
  }

  async captureLatestSession(): Promise<void> {
    return this.memory().captureLatestSession();
  }

  async captureConversation(messages: ChatMessage[]): Promise<void> {
    return this.memory().captureConversation(messages);
  }

  async reingestSession(sessionId: string): Promise<void> {
    return this.memory().reingestSession(sessionId);
  }

  async activateMemoryView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(MEMORY_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: MEMORY_VIEW_TYPE, active: true });
    }
    if (leaf) await workspace.revealLeaf(leaf);
  }

  async activateInboxView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(INBOX_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: INBOX_VIEW_TYPE, active: true });
    }
    if (leaf) await workspace.revealLeaf(leaf);
  }

  async activateSystem(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(SYSTEM_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: SYSTEM_VIEW_TYPE, active: true });
    }
    if (leaf) await workspace.revealLeaf(leaf);
  }

  /** Optimize brain: tag merges, link weave, type weave. */
  optimize(): OptimizeFeature {
    return (this._optimize ??= new OptimizeFeature({
      app: this.app,
      settings: () => this.settings,
      activity: () => this.activity,
      indexer: () => this.semantic().indexer(),
      ontology: () => this.ontology(),
      orderTagTriggers: () => this.standingOrders().tagTriggers(),
      router: () => this.router(),
      isMobile: Platform.isMobile,
      passiveUtilitySelection: () => {
        const selection = this.utilityRouting().runtimeSelection();
        if (selection.state === "configured-provider" || selection.state === "approved-Claude-fallback") return selection;
        throw new UtilityUnavailableError(this.utilityRouting().unavailableMessage(selection), selection);
      },
      assertActive: () => {
        if (this.utilityRouting().isEnded()) throw new Error("Companion unloaded while the model check was running; no further content was sent.");
      },
      getState: () => this.optimizeState,
      setState: async (next) => {
        this.optimizeState = next;
        await this.persist();
      },
    }));
  }

  async loadedOntology(): Promise<OntologyRegistry | null> {
    return loadedOntology(this.ontology());
  }

  /** Inbox-view entry point: guard + consent + enrich, then refresh open inbox views. */
  async enrichInboxItem(file: TFile, options?: { inline?: boolean; refreshInboxViews?: boolean }): Promise<EnrichRunOutcome> {
    const outcome = await this.enrichment().enrichFile(file, !options?.inline);
    if (options?.refreshInboxViews === false) return outcome;
    for (const leaf of this.app.workspace.getLeavesOfType(INBOX_VIEW_TYPE)) {
      if (leaf.view instanceof InboxView) {
        try {
          await leaf.view.render();
        } catch (error) {
          console.warn("[companion] Inbox refresh failed", error);
        }
      }
    }
    return outcome;
  }

  /** Unenriched inbox files right now (drives the ribbon badge). */
  inboxPendingCount(): number {
    const entries = this.app.vault.getFiles().map((f: TFile) => ({
      path: f.path,
      basename: f.basename,
      ext: f.extension,
      frontmatter: this.app.metadataCache.getFileCache(f)?.frontmatter ?? undefined,
    }));
    return inboxItems(entries, this.settings.sourceInboxFolder).length;
  }

  private scheduleInboxBadgeSync(): void {
    if (this.inboxBadgeTimer !== null) window.clearTimeout(this.inboxBadgeTimer);
    this.inboxBadgeTimer = window.setTimeout(() => {
      this.inboxBadgeTimer = null;
      this.syncInboxBadge();
    }, 800);
  }

  private syncInboxBadge(): void {
    const el = this.inboxRibbonEl;
    if (!el) return;
    const pending = this.settings.sourceCaptureEnabled ? this.inboxPendingCount() : 0;
    const queued = this.orders().listQueuedEdits().length;
    const n = pending + queued;
    const waiting = [...(pending > 0 ? [`${pending} to type`] : []), ...(queued > 0 ? [`${queued} to review`] : [])];
    el.setAttr("aria-label", n > 0 ? `Source inbox — ${waiting.join(", ")}` : "Source inbox");
    let badge = el.querySelector<HTMLElement>(".cc-inbox-ribbon-badge");
    if (n > 0) {
      if (!badge) badge = el.createSpan({ cls: "cc-inbox-ribbon-badge" });
      badge.setText(String(n));
    } else {
      badge?.remove();
    }
  }

  private async refreshMemoryView(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(MEMORY_VIEW_TYPE)) {
      if (leaf.view instanceof MemoryView) await leaf.view.render();
    }
  }

  async activateRelatedView(): Promise<void> {
    if (!this.settings.semanticEnabled) {
      new Notice("Turn on semantic search in Companion settings to use related notes.");
    }
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(RELATED_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: RELATED_VIEW_TYPE, active: true });
    }
    if (leaf) await workspace.revealLeaf(leaf);
  }

  // ---------- command helpers ----------

  /**
   * "/frontmatter": propose type / tags / summary for the ACTIVE note using the
   * utility model (reusing the vault's existing tags), preview it, and apply it
   * additively via processFrontMatter. Never clobbers fields the user already set
   * — tags union, scalar fields only filled when absent.
   */
  async suggestFrontmatterForActiveNote(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || file.extension !== "md") {
      new Notice("Open a note to suggest frontmatter for.");
      return;
    }
    const content = await this.app.vault.cachedRead(file);
    if (content.trim().length === 0) {
      new Notice("This note is empty — nothing to describe.");
      return;
    }

    const vocab = vaultVocabulary(this.app);
    const existingTags = selectPromptTags(vocab, content);
    const typeOptions = this.settings.ontologyEnabled ? [...(this.ontology()?.resolved().keys() ?? [])] : [];
    const notice = beginActivity(this.activity, "Suggesting frontmatter…");
    try {
      const existingLine = existingTags.length > 0 ? `Existing tags (prefer these when relevant): ${existingTags.join(", ")}\n\n` : "";
      const body = content.length > 8000 ? content.slice(0, 8000) + "\n…[truncated]" : content;
      const { text: raw, provider } = await this.router().complete("utility", {
        system: frontmatterSuggestSystem(typeOptions),
        user: `${existingLine}Document:\n\n${body}`,
        maxTokens: 200,
      });
      const suggestion = parseFrontmatterSuggestion(raw);

      // Merge additively against what's already in the note's frontmatter.
      const fm = (this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
      const currentTags = Array.isArray(fm.tags) ? fm.tags.map(String) : typeof fm.tags === "string" ? [fm.tags] : [];
      const resolved = resolveTags(suggestion.tags, vocab);
      const tags = normalizeTags([...currentTags, ...resolved.map((r) => r.tag)]);
      const proposal = {
        ...(suggestion.type && !fm.type ? { type: suggestion.type } : {}),
        tags,
        newTags: resolved.filter((r) => r.match === "new" && !currentTags.includes(r.tag)).map((r) => r.tag),
        ...(suggestion.summary && !fm.summary ? { summary: suggestion.summary } : {}),
      };
      notice.finish();

      new FrontmatterModal(this.app, file.basename, proposal, provider.label, async (apply) => {
        if (!apply) return;
        await this.app.fileManager.processFrontMatter(file, (f) => {
          const rec = f as Record<string, unknown>;
          if (proposal.type && !rec.type) rec.type = proposal.type;
          rec.tags = proposal.tags;
          if (proposal.summary && !rec.summary) rec.summary = proposal.summary;
        });
        new Notice(`Frontmatter updated: ${file.basename}`);
      }).open();
    } catch (e) {
      notice.fail(e);
      new Notice(`Couldn't suggest frontmatter: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  publish(): PublishController {
    return this.publishing().publish();
  }

  async generateArtifactFromContext(): Promise<void> {
    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const hasSelection = !!mdView?.editor.getSelection().trim();
    const view = await this.activateView();
    if (!view) return;
    const target = hasSelection ? "the selected text" : "my current note";
    await view.submitPrompt(
      `Turn ${target} into a single beautiful, self-contained interactive artifact (a \`\`\`claude-html block) using the design system. Choose the best format (plan, report, table, diagram, or dashboard) for the content.`,
      `Turn ${target} into an artifact`,
      ARTIFACT_MAX_TOKENS,
      { context: { activeNote: true, selection: true } },
    );
  }
}
