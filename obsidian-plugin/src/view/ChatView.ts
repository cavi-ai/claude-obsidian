import { ItemView, MarkdownRenderer, MarkdownView, Notice, Platform, WorkspaceLeaf, setIcon } from "obsidian";
import type ClaudeCompanionPlugin from "../main";
import type { ChatMessage, ContextToggles, ToolTraceEntry } from "../types";
import { providerTurnRunner, type AgentTurnDeps, type AgentTurnHandlers, type AgentTurnResult, type AgentTurnRunner } from "../agent/loop";
import type { ChatTurnService, TurnEvent } from "../chat/turnService";
import { toAnthropicTools, executeTool, readOnlyAnthropicTools, PROPOSE_EDIT_TOOL, truncateResult } from "../agent/tools";
import { parseExternalToolName } from "../mcp/external";
import { WriteConfirmModal } from "./WriteConfirmModal";
import { planEdits, applyPlan, type ProposedEdit } from "../edit/diff";
import { reviewEdits } from "../editor/reviewEdits";
import type { ApiMessage, ToolResultBlock, ToolUseBlock, Provider } from "../providers/types";
import { TFile } from "obsidian";
import { compactArtifactsInHistory, compactMessages, toApiMessages, transcriptText, type Conversation } from "../conversations/store";
import { resolveModelId } from "../claude/models";
import { type ChatControls, defaultChatControls, shapeRequest } from "../claude/chatControls";
import { shouldFallbackToLocal, fallbackReason } from "../providers/fallback";
import type { CompletionRequest } from "../providers/types";
import { SlashMenu } from "./SlashMenu";
import { ModeControl, type ChatMode } from "./ModeControl";
import { skillSlashCommands, workflowSlashCommands, SLASH_COMMANDS, type SlashCommand, runNativeSlashCommand, templateSlashCommand, WORKFLOW_ACTION_PREFIX, SKILL_ACTION_PREFIX } from "./slashCommands";
import { substitutePlaceholders } from "../templates/promptTemplates";
import { type AttachedPage } from "../context/urlContext";
import { WORKFLOWS } from "../workflows/catalog";
import { SKILLS } from "../workflows/skillRegistry.generated";
import { composeSkillPrompt, parseSkillInvocation, skillDisplay } from "../skills/compose";
import { hasIncompleteHtmlArtifactFence, splitStreamingArtifact } from "./streamRender";
import { TurnRenderer, type TurnRendererHost } from "./turnRenderer";
import { gatherContext, type AttachedPath } from "../context/vaultContext";
import { type MediaAttachment } from "../context/attachments";
import { AtMenu } from "./AtMenu";
import { type AtItem, type ClaimAtSource } from "../context/atMention";
import { extractArtifact, saveArtifactNote, saveChatNote, savePlanNote } from "../artifacts/artifactStore";
import { extractTasks } from "../build/spec";
import { errorHint, type ErrorHintProvider } from "../providers/errorHints";
import { chipLabel } from "./toolChipLabel";
import { needsCredentialSetup } from "../providers/setupState";
import { claudeBackend } from "../cli/backends/claude";
import { codexBackend } from "../cli/backends/codex";
import { opencodeBackend } from "../cli/backends/opencode";
import type { CliBackend } from "../cli/backends/types";
import type { ProviderRouter } from "../providers/router";

/** Duck-typed CLI sign-in surface — real routers always have all three; a partial test stub is skipped, not crashed on. */
export interface CliSignInProvider {
  hasCredentials(): boolean;
  available(): boolean;
  refresh(): Promise<unknown>;
}
import { addUsage, EMPTY_SESSION, type SessionUsage } from "../usage/tokens";
import { mergeUsage, type TokenUsage } from "../claude/sse";
import type { CompanionWorkspaceCard } from "./companionWorkspace";
import { quickNotice } from "../notice";
import { ComposerContextManager } from "./ComposerContextManager";
import { type AutomaticContextKey } from "./contextManagerModel";
import { HeaderControls } from "./chat/HeaderControls";
import { Composer } from "./chat/Composer";

export const CHAT_VIEW_TYPE = "claude-companion-chat";

/** Truncate a tool result for the expandable chip body. */
function previewText(text: string): string {
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

/** The message list a turn should persist as: `base` plus the assistant reply, when one was produced. */
function appendAssistantMessage(base: ChatMessage[], result: AgentTurnResult): ChatMessage[] {
  const full = result.text.trim();
  if (!full) return base;
  return [...base, { role: "assistant", content: result.text, ...(result.trace.length > 0 ? { toolTrace: result.trace } : {}) }];
}

/** Tag which provider a fallback-ineligible error actually failed on, for renderError's hint. */
function tagProvider(error: Error | undefined, provider: ErrorHintProvider): void {
  if (error) (error as Error & { ccProvider?: ErrorHintProvider }).ccProvider = provider;
}

/** Defensive shape-check of a propose_note_edit `edits` argument. */
function parseProposedEdits(v: unknown): ProposedEdit[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error("propose_note_edit requires a non-empty 'edits' array.");
  return v.map((e, i) => {
    const o = e as { old_str?: unknown; new_str?: unknown };
    if (typeof o?.old_str !== "string" || typeof o?.new_str !== "string") {
      throw new Error(`edits[${i}] must have string 'old_str' and 'new_str'.`);
    }
    return { old_str: o.old_str, new_str: o.new_str };
  });
}

interface ObsidianAppWithSettings {
  setting?: {
    open?: () => void;
    openTabById?: (id: string) => void;
  };
  commands?: { executeCommandById?: (id: string) => boolean };
}

export class ChatView extends ItemView {
  private header: HeaderControls;
  private get modelLabelEl(): HTMLElement { return this.header.modelLabelEl; }
  private set modelLabelEl(v: HTMLElement) { this.header.modelLabelEl = v; }
  /** Desktop only: the text span nested inside the cc-model chip (dot + text + chevron). */
  private get modelTextEl(): HTMLElement | null { return this.header.modelTextEl; }
  private set modelTextEl(v: HTMLElement | null) { this.header.modelTextEl = v; }
  private get backendPillEl(): HTMLElement { return this.header.backendPillEl; }
  private set backendPillEl(v: HTMLElement) { this.header.backendPillEl = v; }
  private get writeGrantPillEl(): HTMLElement { return this.header.writeGrantPillEl; }
  private set writeGrantPillEl(v: HTMLElement) { this.header.writeGrantPillEl = v; }
  private get mcpStatusEl(): HTMLButtonElement { return this.header.mcpStatusEl; }
  private set mcpStatusEl(v: HTMLButtonElement) { this.header.mcpStatusEl = v; }
  private composer: Composer;
  private messages: ChatMessage[] = [];
  private messagesEl!: HTMLElement;
  private get inputEl(): HTMLTextAreaElement { return this.composer.inputEl; }
  private set inputEl(v: HTMLTextAreaElement) { this.composer.inputEl = v; }
  private get sendBtn(): HTMLButtonElement { return this.composer.sendBtn; }
  private set sendBtn(v: HTMLButtonElement) { this.composer.sendBtn = v; }
  get modeControl(): ModeControl | null { return this.composer.modeControl; }
  set modeControl(v: ModeControl | null) { this.composer.modeControl = v; }
  private get usageEl(): HTMLElement { return this.header.usageEl; }
  private set usageEl(v: HTMLElement) { this.header.usageEl = v; }
  private get gaugeFillEl(): HTMLElement { return this.header.gaugeFillEl; }
  private set gaugeFillEl(v: HTMLElement) { this.header.gaugeFillEl = v; }
  private streaming = false;
  private abort: AbortController | null = null;
  private currentTurn: { conversationId: string; turnId: string } | null = null;
  private unregisterCurrentTurn: (() => void) | null = null;
  /** Detaches this view from the live turn's event stream (does not stop the turn). */
  private turnRenderUnsubscribe: (() => void) | null = null;
  private resumeCliSessionId: string | null = null;
  private session: SessionUsage = { ...EMPTY_SESSION };
  /** Usage for the in-flight turn; folded into the session once on completion. */
  private _turnUsage: TokenUsage | null = null;
  /** Per-session chat controls (model, thinking, effort, temp, max). */
  private controls!: ChatControls;
  private get controlsEl(): HTMLElement { return this.composer.controlsEl; }
  private set controlsEl(v: HTMLElement) { this.composer.controlsEl = v; }
  private get knobsEl(): HTMLElement { return this.composer.knobsEl; }
  private set knobsEl(v: HTMLElement) { this.composer.knobsEl = v; }
  private get atMenu(): AtMenu { return this.composer.atMenu; }
  private set atMenu(v: AtMenu) { this.composer.atMenu = v; }
  private get contextManager(): ComposerContextManager { return this.composer.contextManager; }
  private set contextManager(v: ComposerContextManager) { this.composer.contextManager = v; }
  /** Notes/folders explicitly attached via "@" (session-scoped). */
  private get attachedPaths(): AttachedPath[] { return this.composer.attachedPaths; }
  private set attachedPaths(v: AttachedPath[]) { this.composer.attachedPaths = v; }
  /** PDFs/images attached via "@" or paste — cleared after the next send. */
  private get attachedMedia(): MediaAttachment[] { return this.composer.attachedMedia; }
  private set attachedMedia(v: MediaAttachment[]) { this.composer.attachedMedia = v; }
  /** Media consumed by the last send — restored on failure, re-sent on Regenerate. */
  private lastUserMedia: MediaAttachment[] = [];
  /** Rotating "thinking" status word timer + per-turn start offset. */
  private thinkingTimer: number | null = null;
  private claudianSeq = 0;
  /** Per-turn max-output override (artifact/plan/workflow flows need headroom). */
  private maxTokensOverride: number | null = null;
  private contextStatusInterval: number | null = null;
  /** Last visible context-manager state; skip DOM rebuilds when nothing changed. */
  private get lastContextManagerSignature(): string { return this.composer.lastContextManagerSignature; }
  private set lastContextManagerSignature(v: string) { this.composer.lastContextManagerSignature = v; }
  private lastMarkdownView: MarkdownView | null = null;
  private lastMarkdownFilePath: string | null = null;
  /** The last user message text, for the Regenerate action. */
  private lastUserText = "";
  /** The last user-bubble display text, when it differs from lastUserText (skill turns). */
  private lastDisplay: string | undefined = undefined;
  private get slashMenu(): SlashMenu { return this.composer.slashMenu; }
  private set slashMenu(v: SlashMenu) { this.composer.slashMenu = v; }
  /** User-defined prompt templates (notes in the templates folder). */
  private templateCommands: SlashCommand[] = [];
  private templateReloadGeneration = 0;
  /** Research claims offered by the "@"/"#" pickers, refreshed when a research note changes. */
  private cachedClaims: ClaimAtSource[] = [];
  private claimReloadGeneration = 0;
  private claimReloadTimer: number | null = null;
  /** Which trigger ("@" or "#") the open at-menu is currently showing matches for. */
  private get activeMenuTrigger(): "@" | "#" { return this.composer.activeMenuTrigger; }
  private set activeMenuTrigger(v: "@" | "#") { this.composer.activeMenuTrigger = v; }
  /** Per-turn overrides from a prompt template; reset at the start of each run. */
  private turnModelOverride: string | null = null;
  private turnContextOverride: Partial<ContextToggles> | null = null;
  /** Web pages attached via "Attach page content" (captured markdown). */
  private get attachedPages(): AttachedPage[] { return this.composer.attachedPages; }
  private set attachedPages(v: AttachedPage[]) { this.composer.attachedPages = v; }
  /** The "attach this page?" offer chip; one at a time. */
  private get pageOfferEl(): HTMLElement { return this.composer.pageOfferEl; }
  private set pageOfferEl(v: HTMLElement) { this.composer.pageOfferEl = v; }
  /** URL the user declined to attach — don't re-offer while it stays in the input. */
  private get dismissedPageUrl(): string | null { return this.composer.dismissedPageUrl; }
  private set dismissedPageUrl(v: string | null) { this.composer.dismissedPageUrl = v; }
  /** Latest streamed text of the in-flight turn (for clean abort handling). */
  private _lastBuffer = "";
  /** "Allow for this session" on agent write confirmations (cleared with the view). */
  private agentWriteAlways = false;
  /** Plan Mode: read-only agent turn that ends in a plan (per conversation). */
  private planMode = false;
  /** Whether the current chat backend can run tool-driven agent turns (refreshed per turn + backend change). */
  private agentCapable = false;
  private get reasoningEl(): HTMLButtonElement | null { return this.composer.reasoningEl; }
  private set reasoningEl(v: HTMLButtonElement | null) { this.composer.reasoningEl = v; }
  /** Guards the setup card's background sign-in probe against stacking on re-render, per CLI backend id. */
  private cliSetupProbeInFlight = new Set<string>();

  private renderVersions = new WeakMap<HTMLElement, number>();

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: ClaudeCompanionPlugin,
  ) {
    super(leaf);
    this.header = new HeaderControls(this.app, plugin, {
      anyContextEnabled: () => this.composer.anyContextEnabled(),
      applyMode: (...args) => this.applyMode(...args),
      clearChat: (...args) => this.clearChat(...args),
      cliEntries: (...args) => this.cliEntries(...args),
      loadConversation: (...args) => this.loadConversation(...args),
      openSettings: (...args) => this.openSettings(...args),
      renderContextManager: (...args) => this.renderContextManager(...args),
      renderKnobs: () => this.composer.renderKnobs(),
      renderKnobsInto: (parent) => this.composer.renderKnobsInto(parent),
      saveChat: (...args) => this.saveChat(...args),
      updateModeControl: (...args) => this.updateModeControl(...args),
      agentCapable: () => this.agentCapable,
      setAgentCapable: (v) => { this.agentCapable = v; },
      agentWriteAlways: () => this.agentWriteAlways,
      controls: () => this.controls,
      inputEl: () => this.composer.inputEl,
      messages: () => this.messages,
      planMode: () => this.planMode,
      reasoningEl: () => this.composer.reasoningEl,
      session: () => this.session,
    });
    this.composer = new Composer(this.app, plugin, {
      applyChatFontSize: (...args) => this.applyChatFontSize(...args),
      applyMode: (...args) => this.applyMode(...args),
      currentMode: (...args) => this.currentMode(...args),
      onModelSelect: (...args) => this.header.onModelSelect(...args),
      refreshCapabilityIndicators: (...args) => this.header.refreshCapabilityIndicators(...args),
      registerDomEvent: (el, type, callback) => this.registerDomEvent(el, type, callback),
      resolveMarkdownContextView: (...args) => this.resolveMarkdownContextView(...args),
      updateModeControl: (...args) => this.updateModeControl(...args),
      updateUsageBar: (...args) => this.updateUsageBar(...args),
      cachedClaims: () => this.cachedClaims,
      controls: () => this.controls,
      streaming: () => this.streaming,
    });
  }

  override getViewType(): string {
    return CHAT_VIEW_TYPE;
  }
  override getDisplayText(): string {
    return "Companion for Claude";
  }
  override getIcon(): string {
    return "sparkles";
  }

  override async onOpen(): Promise<void> {
    const root = this.contentEl;
    this.header.teardown();
    root.empty();
    root.addClass("cc-chat-root"); // scroll/layout root the mobile CSS keys on (see styles.css)
    root.addClass("cc-root");

    // Initialize per-session controls from the settings default model.
    if (!this.controls) {
      this.controls = defaultChatControls(resolveModelId(this.plugin.settings.model, this.plugin.settings.customModel));
    }

    // ---- header ----
    this.header.mount(root, this.plugin, {
      onModelClick: () => this.openModelMenu(),
      onMcpClick: (evt) => this.openMcpMenu(evt),
      onWriteGrantRevoke: () => {
        this.agentWriteAlways = false;
        this.header.updateWriteGrantPill();
        quickNotice("Session write grant revoked — writes will ask again.");
      },
      onNewChat: () => this.clearChat(),
      onHistory: () => this.openHistory(),
      onOverflow: () => this.openOverflowMenu(),
    });
    this.header.updateWriteGrantPill();

    // ---- messages ----
    // Chat controls now live at the bottom (in the composer), so the top stays
    // light and the reading area gets the space.
    this.messagesEl = root.createDiv({ cls: "cc-messages" });

    // ---- composer ----
    this.composer.mount(
      root,
      this.header,
      [...SLASH_COMMANDS, ...workflowSlashCommands(WORKFLOWS), ...skillSlashCommands(SKILLS, WORKFLOWS)],
      {
        onSlashCommand: (cmd) => void this.runSlashCommand(cmd),
        pickAtItems: () => (this.activeMenuTrigger === "#" ? this.hashItems() : this.atItems()),
        onAtChoose: (item) => void this.onAtChoose(item),
        toggleAutomatic: (key, enabled) => this.toggleAutomaticContext(key, enabled),
        removeSource: (id) => this.removeContextSource(id),
        retrySource: (id) => this.retryContextSource(id),
        addContext: () => this.openContextPicker(),
        onSend: () => void this.onSend(),
        autosizeInput: () => this.composer.autosizeInput(),
        updateUsageBar: () => this.updateUsageBar(),
        syncSlashMenu: () => this.syncSlashMenu(),
        syncAtMenu: () => this.composer.syncAtMenu(),
        syncPageOffer: () => this.composer.syncPageOffer(),
        attachPastedImage: (file) => void this.composer.attachPastedImage(file),
        renderControls: () => this.renderControls(),
      },
    );
    this.renderContextManager();

    // User templates: load now, refresh when a note in the folder changes.
    void this.reloadTemplates();
    const templateTouched = (file: { path: string }): boolean =>
      file.path.startsWith(`${this.plugin.settings.templatesFolder.replace(/\/+$/, "")}/`);
    const scheduleTemplateReload = (file: { path: string }) => {
      if (templateTouched(file)) void this.reloadTemplates();
    };
    this.registerEvent(this.app.vault.on("create", scheduleTemplateReload));
    this.registerEvent(this.app.vault.on("modify", scheduleTemplateReload));
    this.registerEvent(this.app.vault.on("delete", scheduleTemplateReload));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (templateTouched(file) || templateTouched({ path: oldPath })) void this.reloadTemplates();
    }));

    // Research claims for the "@"/"#" pickers: load now, refresh on the same
    // signal the research views use to know a research note changed.
    void this.reloadClaims();
    this.registerEvent(this.app.metadataCache.on("changed", () => this.scheduleReloadClaims()));
    this.registerEvent(this.app.vault.on("create", (file) => { if (file.path.endsWith(".md")) this.scheduleReloadClaims(); }));
    this.registerEvent(this.app.vault.on("delete", (file) => { if (file.path.endsWith(".md")) this.scheduleReloadClaims(); }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => { if (file.path.endsWith(".md") || oldPath.endsWith(".md")) this.scheduleReloadClaims(); }));

    this.applyChatFontSize();
    this.refreshModelLabel();
    void this.refreshBackendPill();
    void this.refreshContextStatus();
    if (this.contextStatusInterval !== null) window.clearInterval(this.contextStatusInterval);
    let tick = 0;
    this.contextStatusInterval = window.setInterval(() => {
      tick++;
      void this.refreshContextStatus();
      // The backend pill needs a network probe (localAvailable) — every ~10s
      // is fresh enough without hammering a dead host with 2s timeouts.
      if (tick % 5 === 0) void this.refreshBackendPill();
    }, 2000);
    // Resume the last active conversation if one was persisted; else empty state.
    const active = this.plugin.getActiveConversation();
    if (active && active.messages.length > 0) {
      this.loadConversation(active);
    } else {
      this.renderEmptyState();
    }
    this.updateUsageBar();
  }

  /** Replace the panel contents with a stored conversation and render it. */
  loadConversation(conversation: Conversation): void {
    this.detachTurnRendering();
    this.session = { ...EMPTY_SESSION };
    this.messages = compactMessages(conversation.messages);
    this.messagesEl.empty();
    if (this.messages.length === 0) {
      this.renderEmptyState();
    } else {
      for (const m of this.messages) this.renderStoredMessage(m);
      const live = this.plugin.turnService().live(conversation.id);
      if (live) this.attachLiveTurn(conversation.id, live.turnId);
      else if (conversation.activeTurn) this.renderInterruptedTurn(conversation);
    }
    this.updateUsageBar();
    this.scrollToBottom();
  }

  /** Reattach to a turn already running elsewhere: replay its buffer, then stream live. */
  private attachLiveTurn(conversationId: string, turnId: string): void {
    this.currentTurn = { conversationId, turnId };
    this.setSending(true);
    this._turnUsage = null;
    const { bubble, body } = this.createAssistantBubble();
    const wantThinking = !!(this.controls?.thinking && this.controls?.showThinking);
    this.turnRenderUnsubscribe = this.startTurnRendering(conversationId, bubble, body, wantThinking, this.plugin.turnService());
  }

  /** Unsubscribe from the live turn's events without stopping it, and reset this view's send-state. */
  private detachTurnRendering(): void {
    this.turnRenderUnsubscribe?.();
    this.turnRenderUnsubscribe = null;
    this.unregisterCurrentTurn = null;
    this.currentTurn = null;
    this.abort = null;
    this.streaming = false;
    this.setSending(false);
  }

  /** Render one persisted message, including assistant action buttons. */
  private renderStoredMessage(m: ChatMessage): void {
    // A user turn with a `display` is a slash/workflow invocation — show it as a
    // command chip on replay too, matching the live render.
    if (m.role === "user" && m.display !== undefined) {
      const chipBubble = this.messagesEl.createDiv({ cls: "cc-msg cc-user cc-command" });
      this.renderCommandChip(chipBubble, m.display);
      return;
    }
    const bubble = this.messagesEl.createDiv({ cls: `cc-msg cc-${m.role}` });
    bubble.createDiv({ cls: "cc-role", text: m.role === "user" ? "You" : "Claude" });
    if (m.role === "assistant") this.addSparkMark(bubble);
    const body = bubble.createDiv({ cls: "cc-body" });
    if (m.role === "assistant" && m.toolTrace && m.toolTrace.length > 0) this.renderTraceChips(bubble, body, m.toolTrace);
    const rendered = m.display ?? m.content;
    void this.renderMarkdownInto(body, rendered).catch(() => {
      // A broken Markdown extension must not make persisted conversation text
      // disappear or reject the fire-and-forget conversation replay.
      body.setText(rendered);
    });
    if (m.role === "assistant" && m.content.trim().length > 0) this.addAssistantActions(bubble, m.content);
  }

  /** Clear the panel to its empty state without altering stored history. */
  resetToEmpty(): void {
    this.detachTurnRendering();
    this.messages = [];
    this.session = { ...EMPTY_SESSION };
    this.messagesEl.empty();
    this.renderEmptyState();
    this.updateUsageBar();
  }

  openHistory(): void { return this.header.openHistory(); }

  private updateUsageBar(): void { return this.header.updateUsageBar(); }

  override async onClose(): Promise<void> {
    this.templateReloadGeneration++;
    this.claimReloadGeneration++;
    if (this.claimReloadTimer !== null) {
      window.clearTimeout(this.claimReloadTimer);
      this.claimReloadTimer = null;
    }
    this.header.teardown(false);
    // A live turn keeps running (and persisting) after the pane closes — only
    // detach this view from its event stream (ChatTurnService).
    this.detachTurnRendering();
    this.clearThinkingStatus();
    if (this.contextStatusInterval !== null) {
      window.clearInterval(this.contextStatusInterval);
      this.contextStatusInterval = null;
    }
    this.composer.destroy();
  }

  refreshModelLabel(): void { return this.header.refreshModelLabel(); }

  // ---------- public entry point (used by commands) ----------

  async submitPrompt(text: string, display?: string, maxTokens?: number, opts?: { model?: string; context?: Partial<ContextToggles> }): Promise<void> {
    if (!text.trim() || this.streaming) return;
    this.inputEl.value = "";
    await this.run(text.trim(), display, maxTokens, opts);
  }

  // ---------- "@" context picker ----------

  private atItems(): AtItem[] { return this.composer.atItems(); }

  private hashItems(): AtItem[] { return this.composer.hashItems(); }

  /** Coalesces rapid vault/metadata events into one reloadClaims() after the last one. */
  private scheduleReloadClaims(): void {
    if (this.claimReloadTimer !== null) window.clearTimeout(this.claimReloadTimer);
    this.claimReloadTimer = window.setTimeout(() => {
      this.claimReloadTimer = null;
      void this.reloadClaims();
    }, 500);
  }

  /** Re-read every active research project's claims for the "@"/"#" pickers. */
  private async reloadClaims(): Promise<void> {
    const generation = ++this.claimReloadGeneration;
    const claims: ClaimAtSource[] = [];
    try {
      const repo = this.plugin.researchRepository();
      const projects = (await repo.listProjects()).filter((p) => p.status === "active");
      for (const project of projects) {
        const snapshot = await repo.loadProject(project.path);
        for (const claim of snapshot.claims) claims.push({ path: claim.path, label: claim.proposition, project: claim.project });
      }
    } catch {
      // Research repository unavailable — claims stay empty.
    }
    if (generation !== this.claimReloadGeneration) return;
    this.cachedClaims = claims;
  }

  private onAtChoose(item: AtItem): Promise<void> { return this.composer.onAtChoose(item); }

  private renderContextManager(): void { return this.composer.renderContextManager(); }

  private toggleAutomaticContext(key: AutomaticContextKey, enabled: boolean): void { return this.composer.toggleAutomaticContext(key, enabled); }

  private removeContextSource(id: string): void { return this.composer.removeContextSource(id); }

  private retryContextSource(id: string): void { return this.composer.retryContextSource(id); }

  private openContextPicker(): void { return this.composer.openContextPicker(); }

  private renderControls(): void { return this.composer.renderControls(); }

  private renderEmptyState(): void {
    if (this.messages.length > 0) return;
    this.messagesEl.empty();
    const empty = this.messagesEl.createDiv({ cls: "cc-empty" });
    setIcon(empty.createDiv({ cls: "cc-empty-icon" }), "sparkles");
    empty.createDiv({ cls: "cc-empty-title", text: "Claude, in your vault." });
    empty.createDiv({
      cls: "cc-empty-sub",
      text: "Stay in the thread across notes, research, thinking, and finished work.",
    });
    if (this.setupRequired()) {
      // Without a credential every example below would just error — show the
      // connect card instead and stop.
      this.renderSetupCard(empty);
      return;
    }
    const workspaceMount = empty.createDiv({ cls: "cc-context-workspace-mount", attr: { "aria-live": "polite" } });
    void this.renderContextualWorkspace(workspaceMount);
    empty.createDiv({ cls: "cc-empty-section-label", text: "START SOMETHING ELSE" });
    const examples: { label: string; prompt: string; needsActiveNote?: boolean }[] = [
      { label: "📋 Summarize my active note", prompt: "Summarize my active note as concise bullet points with the key takeaways first.", needsActiveNote: true },
      { label: "📊 Turn this into a dashboard", prompt: "Turn my current note into a single beautiful, self-contained interactive dashboard artifact using the design system.", needsActiveNote: true },
      { label: "🗺️ Plan a feature", prompt: "Help me plan a feature. Ask me clarifying questions first, then produce an implementation plan." },
      { label: "🔍 Ask across my vault", prompt: "Search my vault and answer: what have I written about " },
    ];
    const grid = empty.createDiv({ cls: "cc-empty-examples" });
    for (const ex of examples) {
      const card = grid.createEl("button", { cls: "cc-example", text: ex.label });
      card.addEventListener("click", () => {
        if (ex.needsActiveNote && !this.app.workspace.getActiveFile()) {
          new Notice("Open a note first, then try this one.");
          return;
        }
        this.inputEl.value = ex.prompt;
        this.inputEl.focus();
        this.composer.autosizeInput();
        this.updateUsageBar();
        // A trailing-space prompt (the vault-search one) waits for the user to type.
        if (!ex.prompt.endsWith(" ")) void this.onSend();
      });
    }
  }

  /** Every CLI backend the router actually exposes, paired with its module (label, sign-in hint) — skips a partial test stub instead of crashing on it. */
  private cliEntries(router: ProviderRouter): { backend: CliBackend; provider: CliSignInProvider }[] {
    const candidates: [CliBackend, CliSignInProvider | undefined][] = [
      [claudeBackend, router.claudeCli],
      [codexBackend, (router as { codexCli?: CliSignInProvider }).codexCli],
      [opencodeBackend, (router as { opencodeCli?: CliSignInProvider }).opencodeCli],
    ];
    return candidates.filter((e): e is [CliBackend, CliSignInProvider] => e[1] != null).map(([backend, provider]) => ({ backend, provider }));
  }

  /** True when chatting requires configuration the user hasn't done yet. */
  private setupRequired(): boolean {
    const router = this.plugin.router();
    const entries = this.cliEntries(router);
    const signedIn = (id: string) => entries.find((e) => e.backend.id === id)?.provider.hasCredentials() ?? false;
    return needsCredentialSetup({
      backend: router.chatBackend,
      hasAnthropicCredential: router.anthropic.hasCredentials(),
      hasClaudeCli: signedIn("claude-cli"),
      hasCodexCli: signedIn("codex-cli"),
      hasOpencodeCli: signedIn("opencode-cli"),
    });
  }

  /** First-run card: connect to Claude without leaving the chat panel. */
  private renderSetupCard(parent: HTMLElement): void {
    const card = parent.createDiv({ cls: "cc-setup-card" });
    const router = this.plugin.router();
    const entries = this.cliEntries(router);
    for (const { backend, provider } of entries) {
      if (!provider.hasCredentials() && provider.available() && !this.cliSetupProbeInFlight.has(backend.id)) {
        this.cliSetupProbeInFlight.add(backend.id);
        void provider.refresh().finally(() => {
          this.cliSetupProbeInFlight.delete(backend.id);
          if (provider.hasCredentials() && this.messagesEl.querySelector(".cc-setup-card")) this.renderEmptyState();
        });
      }
    }
    const signedIn = entries.filter((e) => e.provider.hasCredentials());
    const lead = signedIn[0]?.backend;
    const storage = this.plugin.secrets().available()
      ? "It’s kept in your device’s secret storage, not in this vault — nothing else leaves your machine."
      : "It’s stored in this vault’s plugin data — nothing else leaves your machine.";
    card.createDiv({ cls: "cc-setup-title", text: "Connect to Claude" });
    card.createDiv({
      cls: "cc-setup-sub",
      text: lead
        ? `${lead.label} is signed in on this computer. Use it for chat on your subscription, or add an Anthropic API key. ${storage}`
        : `Add your Anthropic API key to start chatting. ${storage}`,
    });
    if (signedIn.length > 0) {
      const cli = card.createDiv({ cls: "cc-setup-cli" });
      for (const { backend } of signedIn) {
        const useCli = cli.createEl("button", { cls: "mod-cta cc-setup-cli-use", text: `Use ${backend.label} sign-in` });
        useCli.addEventListener("click", () => void (async () => {
          this.plugin.settings.chatBackend = backend.id;
          await this.plugin.saveSettings();
          await this.plugin.continueOnboarding();
          this.renderEmptyState();
          this.refreshModelLabel();
        })());
      }
      card.createDiv({ cls: "cc-setup-or", text: "or" });
    }
    const link = card.createEl("a", {
      cls: "cc-setup-link",
      text: "Get a key at console.anthropic.com",
      href: "https://console.anthropic.com/settings/keys",
    });
    link.setAttr("target", "_blank");
    link.setAttr("rel", "noopener noreferrer");
    const row = card.createDiv({ cls: "cc-setup-row" });
    const input = row.createEl("input", {
      cls: "cc-setup-input",
      attr: { type: "password", placeholder: "sk-ant-api…", "aria-label": "Anthropic API key" },
    });
    const save = row.createEl("button", { cls: "mod-cta cc-setup-save", text: "Save key" });
    const status = card.createDiv({ cls: "cc-setup-status" });
    save.addEventListener("click", () => void (async () => {
      const key = input.value.trim();
      if (!key) {
        input.focus();
        return;
      }
      this.plugin.settings.authMode = "apiKey";
      this.plugin.settings.apiKey = key;
      await this.plugin.saveSettings(); // rebuilds the provider router
      // Verify here rather than letting the first send be the test — a typo'd
      // key otherwise reads as a broken plugin.
      save.disabled = true;
      status.removeClass("is-err");
      status.setText("Checking your key…");
      const result = await this.plugin.router().anthropic.test();
      save.disabled = false;
      if (!result.ok) {
        // The key stays saved so it can be corrected rather than retyped.
        status.addClass("is-err");
        status.setText(`Couldn’t connect: ${result.detail}`);
        input.focus();
        return;
      }
      status.setText("");
      quickNotice("API key saved — you’re connected.");
      if (this.messages.length === 0) {
        this.messagesEl.empty();
        this.renderEmptyState();
      } else {
        card.remove();
      }
      // Setup held back while there was no credential can run now.
      await this.plugin.continueOnboarding();
    })());
    const settingsBtn = card.createEl("button", { cls: "cc-setup-settings", text: "Other options (OAuth, environment)…" });
    settingsBtn.addEventListener("click", () => this.openSettings());
  }

  /** Surface the setup card on a blocked send without losing the typed text. */
  private showSetupCard(): void {
    const existing = this.messagesEl.querySelector<HTMLElement>(".cc-setup-card");
    if (existing) {
      existing.addClass("cc-setup-attn");
      window.setTimeout(() => existing.removeClass("cc-setup-attn"), 900);
      return;
    }
    this.renderSetupCard(this.messagesEl);
    this.scrollToBottom();
  }

  private async renderContextualWorkspace(mount: HTMLElement): Promise<void> {
    const workspace = await this.plugin.companionWorkspaceContext();
    if (!mount.isConnected || this.messages.length > 0 || !workspace) return;
    mount.empty();
    const card = mount.createEl("section", { cls: `cc-context-workspace is-${workspace.kind}`, attr: { "aria-label": "Current Companion workspace" } });
    card.createDiv({ cls: "cc-context-workspace-eyebrow", text: workspace.eyebrow });
    card.createEl("h3", { text: workspace.title });
    card.createEl("p", { text: workspace.description });
    card.createDiv({ cls: "cc-context-workspace-meta", text: workspace.meta });
    const actions = card.createDiv({ cls: "cc-context-workspace-actions" });
    const primary = actions.createEl("button", { cls: "mod-cta", text: workspace.primaryAction });
    const secondary = actions.createEl("button", { text: workspace.secondaryAction });
    if (workspace.kind === "research") {
      primary.addEventListener("click", () => void this.plugin.activateResearchDesk(workspace.contextPath));
      secondary.addEventListener("click", () => void this.prepareWorkspaceQuestion(workspace));
    } else {
      primary.addEventListener("click", () => void this.prepareWorkspaceQuestion(workspace));
      secondary.addEventListener("click", () => void this.plugin.activateRelatedView());
    }
  }

  /** Attach canonical workspace context and hand control back to the user. */
  prepareWorkspaceQuestion(workspace: Pick<CompanionWorkspaceCard, "kind" | "title" | "contextPath">): void {
    const active = this.resolveMarkdownContextView()?.file ?? this.app.workspace.getActiveFile();
    const alreadyIncludedAsActiveNote = this.plugin.settings.context.activeNote && active?.path === workspace.contextPath;
    if (!alreadyIncludedAsActiveNote && !this.attachedPaths.some(({ path, kind }) => path === workspace.contextPath && kind === "note")) {
      this.attachedPaths.push({ path: workspace.contextPath, kind: "note" });
    }
    this.inputEl.value = workspace.kind === "research"
      ? `Help me continue ${workspace.title.replace(/^Continue /, "")}. `
      : `Help me continue working with ${workspace.title.replace(/^Continue with /, "")}. `;
    this.renderContextManager();
    this.composer.autosizeInput();
    this.updateUsageBar();
    this.inputEl.focus();
  }

  clearChat(): void {
    this.detachTurnRendering();
    this.messages = [];
    this.session = { ...EMPTY_SESSION };
    // Plan Mode is per-conversation — a fresh chat starts with it off.
    this.planMode = false;
    this.updateModeControl();
    // The previous conversation is already auto-saved; detach so the next turn
    // begins a fresh session.
    void this.plugin.startNewConversation();
    this.attachedPaths = [];
    this.attachedPages = [];
    this.dismissedPageUrl = null;
    this.pageOfferEl?.setCssStyles({ display: "none" });
    this.renderContextManager();
    this.messagesEl.empty();
    this.renderEmptyState();
    this.setSending(false);
    this.updateUsageBar();
  }

  private openSettings(): void {
    const app = this.app as ObsidianAppWithSettings;
    if (app.setting?.open) {
      app.setting.open();
      app.setting.openTabById?.("claude-companion");
      return;
    }
    // Some mobile shells do not expose the desktop `app.setting` controller.
    // The built-in command still opens Settings instead of making the tap a no-op.
    app.commands?.executeCommandById?.("app:open-settings");
  }

  // ---------- send / stream ----------

  private async onSend(): Promise<void> {
    if (this.streaming) {
      await this.stopCurrentTurn();
      return;
    }
    const text = this.inputEl.value.trim();
    if (!text) return;
    // Check credentials BEFORE clearing the composer — a new user's first
    // message must never be silently discarded.
    if (this.setupRequired()) {
      this.showSetupCard();
      return;
    }
    // A typed obsidian-agent skill invocation ("/wikilink-weaver <note path>") composes into a full turn with vault search on.
    const skill = parseSkillInvocation(text, SKILLS);
    if (skill) {
      const prompt = composeSkillPrompt(skill.entry, skill.args);
      const display = skillDisplay(skill.entry, skill.args);
      this.lastUserText = prompt;
      this.lastDisplay = display;
      this.inputEl.value = "";
      this.composer.autosizeInput();
      await this.run(prompt, display, undefined, { context: { searchVault: true } });
      return;
    }
    this.lastUserText = text;
    this.lastDisplay = undefined;
    this.inputEl.value = "";
    this.composer.autosizeInput();
    await this.run(text);
  }

  private syncSlashMenu(): void { return this.composer.syncSlashMenu(); }

  /** Re-read the templates folder and rebuild the slash catalog (templates last). */
  private async reloadTemplates(): Promise<void> {
    const generation = ++this.templateReloadGeneration;
    const templates = await this.plugin.promptTemplates();
    if (generation !== this.templateReloadGeneration) return;
    this.templateCommands = templates.map(templateSlashCommand);
    this.slashMenu.setCommands([...SLASH_COMMANDS, ...workflowSlashCommands(WORKFLOWS), ...skillSlashCommands(SKILLS, WORKFLOWS), ...this.templateCommands]);
    this.syncSlashMenu();
  }

  /** Execute a chosen slash command — either send a prompt or run an action. */
  private async runSlashCommand(cmd: SlashCommand): Promise<void> {
    if (await runNativeSlashCommand({
      command: cmd,
      backend: this.plugin.settings.chatBackend,
      clearComposer: () => {
        this.inputEl.value = "";
        this.composer.autosizeInput();
      },
      activateResearchDesk: () => this.plugin.activateResearchDesk(),
      requestCompletion: (prompt, display) => this.submitPrompt(prompt, display),
    })) return;

    this.inputEl.value = "";
    this.composer.autosizeInput();

    // User template: substitute placeholders against the live editor state,
    // then send with the note's optional model/context overrides for this turn.
    if (cmd.template) {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      const selection = view?.editor.getSelection() ?? "";
      const activeNote = view?.file ? await this.app.vault.cachedRead(view.file) : "";
      const prompt = substitutePlaceholders(cmd.template.prompt, { selection, activeNote });
      await this.submitPrompt(prompt, `/${cmd.name}`, undefined, {
        ...(cmd.template.model ? { model: cmd.template.model } : {}),
        ...(cmd.template.context ? { context: cmd.template.context } : {}),
      });
      return;
    }

    if (cmd.kind === "prompt" && cmd.prompt) {
      if (cmd.awaitsInput) {
        // Insert the template and let the user finish typing (e.g. "/explain ").
        this.inputEl.value = cmd.prompt;
        this.inputEl.focus();
        this.composer.autosizeInput();
        this.updateUsageBar();
        return;
      }
      // Hide the verbose template behind the command name; the model still gets cmd.prompt.
      await this.submitPrompt(cmd.prompt, `/${cmd.name}`);
      return;
    }

    // A skill takes arguments: insert its token and let the user finish typing; Enter sends through onSend.
    if (cmd.action?.startsWith(SKILL_ACTION_PREFIX)) {
      this.inputEl.value = `/${cmd.action.slice(SKILL_ACTION_PREFIX.length)} `;
      this.inputEl.focus();
      this.composer.autosizeInput();
      this.updateUsageBar();
      return;
    }

    // A workflow slash command ("/manifest-pm", "/frontmatter-audit", …) runs the
    // matching catalog workflow directly.
    if (cmd.action?.startsWith(WORKFLOW_ACTION_PREFIX)) {
      const id = cmd.action.slice(WORKFLOW_ACTION_PREFIX.length);
      const wf = WORKFLOWS.find((w) => w.id === id);
      if (wf) await this.plugin.runWorkflow(wf);
      else new Notice(`Unknown workflow: ${id}`);
      return;
    }

    // kind: "action" — dispatch to the matching behavior.
    switch (cmd.action) {
      case "new-chat":
        this.clearChat();
        break;
      case "workflows":
        await this.plugin.openWorkflowPicker();
        break;
      case "frontmatter":
        await this.plugin.suggestFrontmatterForActiveNote();
        break;
      case "capture-memory":
        await this.plugin.openSessionPicker();
        break;
      case "history":
        this.openHistory();
        break;
      case "save":
        await this.saveChat();
        break;
      case "delete-active":
        await this.plugin.deleteActiveConversation();
        break;
      case "ask-vault":
        this.plugin.settings.context.searchVault = true;
        await this.plugin.saveSettings();
        this.inputEl.value = "";
        this.inputEl.setAttr("placeholder", "Vault search on — ask your question…");
        this.inputEl.focus();
        quickNotice("Vault search enabled for your next message.");
        break;
      case "artifact":
        await this.plugin.generateArtifactFromContext();
        break;
      case "plan":
        await this.plugin.generatePlanFromNote();
        break;
      case "build":
        await this.plugin.handoffToBuild();
        break;
      default:
        new Notice(`Unknown command: /${cmd.name}`);
    }
  }

  private setSending(sending: boolean): void {
    this.streaming = sending;
    this.sendBtn.toggleClass("is-stop", sending);
    this.sendBtn.setAttr("aria-label", sending ? "Stop generating" : "Send message");
    if (Platform.isMobile) {
      this.sendBtn.empty();
      setIcon(this.sendBtn, sending ? "square" : "arrow-up");
    } else {
      this.sendBtn.setText(sending ? "Stop" : "Send");
    }
  }

  private async run(userText: string, display?: string, maxTokens?: number, opts?: { model?: string; context?: Partial<ContextToggles> }): Promise<void> {
    this.maxTokensOverride = maxTokens ?? null; // reset each turn
    this.turnModelOverride = opts?.model ?? null;
    this.turnContextOverride = opts?.context ?? null;
    this._lastBuffer = ""; // never let a previous turn's partial leak into this one
    void this.refreshBackendPill();
    const router = this.plugin.router();
    let { provider, model } = router.chatProvider();
    const backend = router.chatBackend;
    let caps = router.chatCapabilities();
    if ((backend === "claude-cli" || backend === "codex-cli" || backend === "opencode-cli") && !caps.cli && !router.anthropic.hasCredentials()) {
      const entry = this.cliEntries(router).find((e) => e.backend.id === backend);
      const label = entry?.backend.label ?? "This backend";
      // The cached sign-in probe can be stale (user just ran the sign-in command); re-probe once before blocking.
      if (entry?.provider.available()) {
        await entry.provider.refresh();
        caps = router.chatCapabilities();
        if (caps.cli) {
          ({ provider, model } = router.chatProvider());
          void this.refreshBackendPill();
        }
      }
      if (!caps.cli) {
        new Notice(entry?.provider.available() ? `${label} is not signed in — ${entry.backend.signInHint}, or add an API key in Companion settings.` : `${label} runs on desktop only. Add an API key to chat here.`);
        return;
      }
    }
    if (!provider.hasCredentials() && backend !== "auto") {
      const where =
        provider.id === "ollama"
          ? "Start Ollama (`ollama serve`) or set the host in settings."
          : provider.id === "openai-compat"
            ? "Set the endpoint host and model in Companion settings → Local models."
            : "Add your Anthropic credential in Claude Companion settings first.";
      new Notice(where);
      return;
    }

    this.messages.push({ role: "user", content: userText, ...(display !== undefined ? { display } : {}) });
    // Snapshot now (not read from `this.messages` at completion) — the view may
    // switch conversations while this turn is still in flight.
    const turnMessages = [...this.messages];
    let turn: { conversationId: string; turnId: string };
    try {
      turn = await this.plugin.beginActiveConversationTurn(this.messages, {
        backend,
        model: this.turnModelOverride ?? model,
        mode: this.currentMode(),
      });
    } catch (error) {
      this.messages.pop();
      if (this.inputEl) {
        this.inputEl.value = userText;
        this.composer.autosizeInput();
      }
      new Notice(`Couldn't save this request, so it was not started: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    this.currentTurn = turn;
    this.abort = new AbortController();
    const controller = this.abort;
    this.unregisterCurrentTurn = this.plugin.registerActiveChatTurn(turn.conversationId, turn.turnId, () => {
      controller.abort();
      if (this.currentTurn?.turnId === turn.turnId) {
        this.currentTurn = null;
        this.unregisterCurrentTurn = null;
        this.setSending(false);
      }
    });
    this.setSending(true);
    this._turnUsage = null;
    this.renderMessage("user", display ?? userText, { command: display !== undefined });

    // Agent mode: the model pulls vault context itself via tools. Gated on the
    // provider actually round-tripping tool_use (Claude, and local models whose
    // metadata reports "tools") — local-only setups get the same agent.
    const toolCapable = await router.chatToolCapable();
    if (controller.signal.aborted) return;
    this.agentCapable = this.plugin.settings.agentModeEnabled && toolCapable;
    this.updateModeControl();
    const agentActive = this.agentCapable;
    if (this.plugin.settings.agentModeEnabled && !toolCapable && caps.local) {
      new Notice(`The selected local model doesn't support tools, so the agent is off. Pick a tool-capable model (e.g. llama3.1, qwen3) in settings → Local models.`, 8000);
    }

    // Build context-augmented copy of the message list for the API. In agent
    // mode the pre-emptive vault-search stuffing is skipped — the vault_search
    // tool replaces it with better, model-chosen queries.
    const toggles = agentActive
      ? { ...this.plugin.settings.context, ...this.turnContextOverride, searchVault: false }
      : { ...this.plugin.settings.context, ...this.turnContextOverride };
    const ctx = await gatherContext(
      this.app,
      this.plugin.settings,
      toggles,
      userText,
      (q, k) => this.plugin.semanticSearch(q, k),
      this.attachedPaths,
      this.attachedPages,
    );
    if (controller.signal.aborted) return;
    // A resumed Claude Code session already owns its history. Sending the whole
    // conversation again can repeat the interrupted request and duplicate writes.
    const wireMessages = this.resumeCliSessionId ? this.messages.slice(-1) : compactArtifactsInHistory(this.messages);
    const apiMessages: ApiMessage[] = toApiMessages(wireMessages);
    if (ctx.text) {
      const last = apiMessages[apiMessages.length - 1];
      if (last && typeof last.content === "string") last.content = `${ctx.text}\n\n---\n\n${last.content}`;
      this.annotateContext(ctx.sources);
    }

    // Attached PDFs/images become content blocks ahead of the text (media is
    // per-turn: consumed by this send, pills cleared). Local backends can't
    // see them — textContent() drops non-text blocks on the Ollama path.
    if (this.attachedMedia.length > 0) {
      const blocks = await this.composer.mediaBlocks();
      if (controller.signal.aborted) return;
      const last = apiMessages[apiMessages.length - 1];
      if (blocks.length > 0 && last && typeof last.content === "string") {
        last.content = [...blocks, { type: "text", text: last.content }];
      }
      // Media is per-turn, but keep a handle for failure-restore and Regenerate.
      this.lastUserMedia = this.attachedMedia;
      this.attachedMedia = [];
      this.renderContextManager();
    } else {
      this.lastUserMedia = [];
    }

    const { bubble, body } = this.createAssistantBubble();
    const startedOnLocal = caps.local;
    const wantThinking = agentActive || caps.cli
      ? !!(this.controls.thinking && this.controls.showThinking)
      : !startedOnLocal && !!(this.controls.thinking && this.controls.showThinking);
    // The primary-backend/local-fallback decision runs inside
    // ChatTurnService.start() so it keeps going — and still persists — even if
    // this view closes mid-turn. Mirrors the fallback policy run() used to
    // apply itself: an agent turn that already produced text/trace despite an
    // error is a completed answer with a notice, never a fallback trigger.
    const fallbackProviderId: ErrorHintProvider = caps.cli ? (caps.cliBackend ?? "claude-cli") : startedOnLocal ? "ollama" : "anthropic";
    const coreRun = async (handlers: AgentTurnHandlers, signal: AbortSignal): Promise<AgentTurnResult> => {
      const primary = agentActive || caps.cli
        ? await this.agentTurn(apiMessages, handlers, signal)
        : startedOnLocal
          ? await this.streamTurn("local", apiMessages, handlers, signal)
          : await this.streamTurn("claude", apiMessages, handlers, signal);
      if (!primary.error) return primary;

      const isAgent = agentActive || caps.cli;
      if (isAgent && (primary.text.trim().length > 0 || primary.trace.length > 0)) {
        handlers.onNotice?.(`Turn ended early: ${primary.error.message}`);
        return { text: primary.text, trace: primary.trace, ...(primary.aborted !== undefined ? { aborted: primary.aborted } : {}), ...(primary.capped !== undefined ? { capped: primary.capped } : {}) };
      }

      const fb = await router.localFallback();
      const doFallback = shouldFallbackToLocal({ backend, localAvailable: fb !== null, error: primary.error });
      if (!doFallback || !fb) {
        tagProvider(primary.error, fallbackProviderId);
        return primary;
      }
      handlers.onNotice?.(`${fallbackReason(primary.error)} — answered locally with ${fb.model}.`);
      const fallback = await this.streamTurn("local", apiMessages, handlers, signal, fb);
      if (fallback.error) tagProvider(fallback.error, fb.provider.id);
      return fallback;
    };

    // Cache one instance for this turn's whole lifecycle — start() and the
    // subscribe() below must land on the same ChatTurnService (plugin.turnService()
    // is a memoized singleton in production, but nothing here should rely on that).
    const turnService = this.plugin.turnService();
    const handle = turnService.start(turn.conversationId, {
      turnId: turn.turnId,
      title: display ?? userText,
      run: coreRun,
      completeTurn: (result) => this.plugin.completeActiveConversationTurn(turn.conversationId, turn.turnId, appendAssistantMessage(turnMessages, result)),
      interruptTurn: (result, error) => this.plugin.interruptActiveConversationTurn(turn.conversationId, turn.turnId, appendAssistantMessage(turnMessages, result), error?.message ?? "Interrupted"),
      registerTurn: (stop) => this.plugin.registerActiveChatTurn(turn.conversationId, turn.turnId, stop),
    });
    this.turnRenderUnsubscribe = this.startTurnRendering(turn.conversationId, bubble, body, wantThinking, turnService);
    await handle.result.catch(() => undefined);
  }

  /** Adapt this view to the TurnRenderer host contract (one per turn). */
  private turnHost(): TurnRendererHost {
    return {
      renderMarkdownInto: (el, md) => this.renderMarkdownInto(el, md),
      renderStreamingArtifactInto: (el, buffer) => this.renderStreamingArtifactInto(el, buffer),
      scrollToBottom: () => this.scrollToBottom(),
      clearThinkingStatus: () => this.clearThinkingStatus(),
      createThinkingPanel: (bubble) => this.createThinkingPanel(bubble),
      annotateTruncated: (bubble) => this.annotateTruncated(bubble),
      mergeTurnUsage: (usage) => {
        this._turnUsage = mergeUsage(this._turnUsage ?? undefined, usage);
      },
      syncBuffer: (buffer) => {
        this._lastBuffer = buffer;
      },
    };
  }

  /**
   * Run one streaming attempt on a backend, emitting through `handlers` instead
   * of touching the DOM directly — the view (attached or not) renders from the
   * ChatTurnService event stream. Always resolves; never rejects.
   */
  private streamTurn(
    target: "claude" | "local",
    apiMessages: ApiMessage[],
    handlers: AgentTurnHandlers,
    signal: AbortSignal,
    localOverride?: { provider: Provider; model: string },
  ): Promise<AgentTurnResult> {
    const router = this.plugin.router();
    const onClaude = target === "claude";
    // "local" = the configured non-Claude chat backend (Ollama, or the custom
    // OpenAI-compatible endpoint when that's the chat backend) — or, for a
    // fallback attempt, whichever local backend the router found reachable.
    const useCustom = !onClaude && !localOverride && this.plugin.settings.chatBackend === "custom";
    const provider = onClaude ? router.anthropic : localOverride?.provider ?? (useCustom ? router.openaiCompat : router.ollama);
    const model = onClaude
      ? (this.turnModelOverride ?? this.controls.model)
      : localOverride?.model ?? (useCustom ? this.plugin.settings.openaiCompatModel : this.plugin.settings.ollamaModel);
    const shape = shapeRequest({ ...this.controls, model: onClaude ? model : this.controls.model }, this.maxTokensOverride ?? this.plugin.settings.maxTokens);

    return new Promise((resolve) => {
      let settled = false;
      let buffer = "";
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        const status = (error as { status?: number } | null)?.status;
        const err = error instanceof Error ? error : new Error(String(error));
        if (status !== undefined) (err as Error & { status?: number }).status = status;
        resolve({ text: buffer, trace: [], error: err });
      };
      const request: CompletionRequest = {
        system: this.plugin.composeSystemPrompt(),
        messages: apiMessages,
        model,
        maxTokens: shape.maxTokens,
        signal,
      };
      if (onClaude && shape.temperature !== undefined) request.temperature = shape.temperature;
      if (onClaude && shape.thinking !== undefined) request.thinking = shape.thinking;
      if (onClaude && shape.thinkingDisplay !== undefined) request.thinkingDisplay = shape.thinkingDisplay;
      if (onClaude && shape.outputConfig !== undefined) request.outputConfig = shape.outputConfig;
      void provider.stream(
        request,
        {
          onThinking: (delta) => handlers.onThinking?.(delta),
          onText: (delta) => {
            buffer += delta;
            handlers.onText(delta);
          },
          onError: (err) => fail(err),
          onUsage: (usage) => handlers.onUsage?.(usage),
          onTruncated: () => handlers.onTruncated?.(),
          onDone: (full) => {
            if (settled) return;
            settled = true;
            resolve({ text: full, trace: [] });
          },
        },
      ).then(() => {
        // stream() resolved without onError/onDone (e.g. aborted) — keep the
        // partial buffer, no error.
        if (!settled) {
          settled = true;
          resolve({ text: buffer, trace: [], aborted: true });
        }
      }).catch((error: unknown) => fail(error));
    });
  }

  /**
   * Run one agent-mode turn: Claude may call vault tools between streaming
   * passes (spec 2026-07-05). Always resolves; the caller (coreRun in run())
   * decides whether an error means fallback, a completed-with-notice answer,
   * or a hard failure.
   */
  private async agentTurn(
    apiMessages: ApiMessage[],
    handlers: AgentTurnHandlers,
    signal: AbortSignal,
  ): Promise<AgentTurnResult> {
    const { provider, model: providerModel } = this.plugin.router().chatProvider();
    const shape = shapeRequest(this.controls, this.maxTokensOverride ?? this.plugin.settings.maxTokens);
    const externalTools = this.planMode ? [] : await this.plugin.externalMcpTools().catch(() => []);

    const request: CompletionRequest = {
      system: this.plugin.composeSystemPrompt({ agent: true, plan: this.planMode }),
      messages: apiMessages,
      model: this.turnModelOverride ?? providerModel,
      maxTokens: shape.maxTokens,
      signal,
      // Plan Mode forces the read-only set regardless of agentAllowWrites, and
      // drops propose_note_edit — the turn should end in a plan, not an edit.
      // Otherwise propose_note_edit rides along regardless of agentAllowWrites —
      // the diff modal is its own gate (spec 2026-07-05 apply-to-note, §7 Q1).
      tools: this.planMode
        ? readOnlyAnthropicTools(this.plugin.agentTools().definitions())
        : [...toAnthropicTools(this.plugin.agentTools().definitions()), PROPOSE_EDIT_TOOL, ...externalTools],
    };
    if (shape.temperature !== undefined) request.temperature = shape.temperature;
    if (shape.thinking !== undefined) request.thinking = shape.thinking;
    if (shape.thinkingDisplay !== undefined) request.thinkingDisplay = shape.thinkingDisplay;
    if (shape.outputConfig !== undefined) request.outputConfig = shape.outputConfig;

    const deps: AgentTurnDeps = {
      stream: (req, h) => provider.stream(req, h),
      execute: (block, sig) =>
        parseExternalToolName(block.name)
          ? this.executeExternalMcp(block, sig)
          : executeTool(
              {
                call: (name, args) => this.plugin.agentTools().call(name, args),
                confirmWrite: (b) => this.confirmAgentWrite(b),
                proposeEdit: (b) => this.proposeAgentEdit(b),
              },
              block,
            ),
      maxIterations: this.plugin.settings.agentMaxIterations,
      signal,
    };

    let runner: AgentTurnRunner;
    try {
      runner = await this.turnRunnerFor(deps, request, signal);
    } catch (error) {
      return { text: "", trace: [], error: error instanceof Error ? error : new Error(String(error)) };
    }
    return runner.run(request, handlers);
  }

  /** The CLI runs the turn when the backend is Claude Code; otherwise today's provider loop does. */
  private async turnRunnerFor(deps: AgentTurnDeps, request: CompletionRequest, signal?: AbortSignal): Promise<AgentTurnRunner> {
    const caps = this.plugin.router().chatCapabilities();
    if (!caps.cli) return providerTurnRunner(deps);
    if (!this.agentCapable) request.tools = [];
    const conversationId = this.currentTurn?.conversationId ?? this.plugin.activeConversationId();
    signal?.addEventListener("abort", () => this.plugin.interruptCliTurn(conversationId), { once: true });
    return this.plugin.cliTurnRunner({
      conversationId,
      planMode: this.planMode,
      agentMode: this.agentCapable,
      model: request.model,
      deps: { confirmWrite: (b) => this.confirmAgentWrite(b), proposeEdit: (b) => this.proposeAgentEdit(b) },
      transcript: this.resumeCliSessionId ? "" : transcriptText(this.messages.slice(0, -1)),
      ...(this.resumeCliSessionId ? { resumeSessionId: this.resumeCliSessionId } : {}),
    });
  }

  /**
   * Subscribe this view's bubble/body to a conversation's live turn: the
   * replay buffer renders first, then live events, through the same
   * TurnRenderer/tool-chips pipeline a same-view run() used to drive directly.
   * Returns the unsubscribe — self-invoked once the turn settles.
   */
  private startTurnRendering(conversationId: string, bubble: HTMLElement, body: HTMLElement, wantThinking: boolean, turnService: ChatTurnService): () => void {
    const renderer = new TurnRenderer(this.turnHost(), bubble, body, wantThinking);
    const chips = this.createToolChips(bubble, body);
    let unsubscribe: () => void = () => undefined;
    const settle = (result: AgentTurnResult): void => {
      void this.settleTurnRendering(conversationId, bubble, body, renderer, result).finally(() => {
        unsubscribe();
        if (this.turnRenderUnsubscribe === unsubscribe) this.turnRenderUnsubscribe = null;
      });
    };
    const apply = (event: TurnEvent): void => {
      switch (event.kind) {
        case "text": renderer.onText(event.delta); break;
        case "thinking": renderer.onThinking(event.delta); break;
        case "toolStart": chips.start(event.block); break;
        case "toolResult": chips.finish(event.block, event.result); renderer.markToolBoundary(); break;
        case "notice": this.annotateAgentNotice(bubble, event.text); break;
        case "usage": renderer.onUsage(event.usage); break;
        case "truncated": renderer.onTruncated(); break;
        case "done": settle(event.result); break;
        case "error": settle({ text: renderer.buffer, trace: [], error: event.error }); break;
      }
    };
    unsubscribe = turnService.subscribe(conversationId, (message) => {
      if (message.kind === "replay") { for (const e of message.events) apply(e); return; }
      apply(message);
    });
    return unsubscribe;
  }

  /** The DOM-only half of finishing a turn: final render, persisted-message push (view-local), error box. Persistence itself runs through ChatTurnService's completeTurn/interruptTurn regardless of whether this fires. */
  private async settleTurnRendering(
    conversationId: string,
    bubble: HTMLElement,
    body: HTMLElement,
    renderer: TurnRenderer,
    result: AgentTurnResult,
  ): Promise<void> {
    // Idempotent per bubble: "done"/"error" and a stale replay can both reach
    // here for the same turn — only the first call commits the message + actions.
    if (bubble.dataset.ccFinished === "1") return;
    bubble.dataset.ccFinished = "1";
    this.clearThinkingStatus();

    // Never persist a half-generated HTML artifact fence left by an abort.
    const incompleteArtifact = !!result.aborted && hasIncompleteHtmlArtifactFence(result.text);
    if (incompleteArtifact) {
      this.renderInterruptedArtifact(body);
    } else {
      try {
        await renderer.finalize(result.text);
      } catch {
        body.setText(result.text);
      }
    }
    const full = !incompleteArtifact && result.text.trim().length > 0 ? result.text : null;
    if (full) {
      this.messages.push({ role: "assistant", content: full, ...(result.trace.length > 0 ? { toolTrace: result.trace } : {}) });
      this.addAssistantActions(bubble, full);
    }
    if (result.error && !full) {
      const providerId = (result.error as Error & { ccProvider?: ErrorHintProvider }).ccProvider ?? "anthropic";
      this.renderError(body, result.error.message || "Request failed", providerId);
      this.restoreMediaAfterFailure();
    }
    if (this.currentTurn?.conversationId === conversationId) {
      this.unregisterCurrentTurn = null;
      this.currentTurn = null;
      this.setSending(false);
      this.abort = null;
    }
    // Fold this turn's usage into the session exactly once. The API emits usage
    // on both message_start and message_delta; counting each event would double
    // the request count and inflate output tokens.
    if (this._turnUsage) {
      this.session = addUsage(this.session, this._turnUsage);
      this._turnUsage = null;
    }
    this.updateUsageBar();
    this.scrollToBottom();
  }

  /**
   * Handle a propose_note_edit call: plan against the current note, let the
   * user review per hunk inline or in the DiffModal, apply the accepted subset
   * atomically, and report the true outcome back to the model. Throws are
   * mapped to is_error tool_results by the executor (model self-corrects).
   */
  private async proposeAgentEdit(block: ToolUseBlock): Promise<string> {
    const input = block.input;
    const path = typeof input.path === "string" ? input.path : "";
    if (!path) throw new Error("propose_note_edit requires a 'path'.");
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`Note not found: ${path}`);
    const edits = parseProposedEdits(input.edits);
    const description = typeof input.description === "string" ? input.description : undefined;

    const content = await this.app.vault.cachedRead(file);
    const plan = planEdits(content, edits);

    const outcome = await reviewEdits(
      this.app,
      { file, plan, ...(description !== undefined ? { description } : {}) },
      { inlineEnabled: this.plugin.settings.inlineDiffEnabled },
    );
    const accepted = outcome.accepted;
    if (!accepted) return "User rejected the proposed edit.";

    // Inline review already edited the live buffer; the modal path applies under the write lock.
    if (outcome.mode === "modal") {
      await this.app.vault.process(file, (current) => applyPlan(current, plan, accepted));
    }
    const applied = accepted.filter(Boolean).length;
    return applied === plan.hunks.length
      ? `Applied all ${applied} edit${applied === 1 ? "" : "s"} to ${path}.`
      : `Applied ${applied} of ${plan.hunks.length} edits to ${path} (the user rejected the rest).`;
  }

  /**
   * Route an external MCP tool call: every call confirms first (external
   * servers can do anything), then dispatch; errors become is_error results
   * so the model adapts instead of the turn dying.
   */
  private async executeExternalMcp(block: ToolUseBlock, signal?: AbortSignal): Promise<ToolResultBlock> {
    const result = (content: string, isError?: boolean): ToolResultBlock => ({
      type: "tool_result",
      tool_use_id: block.id,
      content,
      ...(isError ? { is_error: true } : {}),
    });
    if (block.parseError) return result(block.parseError, true);
    // Stop was pressed while a prior tool was running — don't fire another call.
    if (signal?.aborted) return result("Turn stopped before this tool ran.", true);
    if (!(await this.confirmAgentWrite(block))) return result("User declined.", true);
    try {
      return result(truncateResult(await this.plugin.callExternalMcp(block.name, block.input)));
    } catch (err) {
      return result(err instanceof Error ? err.message : String(err), true);
    }
  }

  /** Ask the user before an agent write tool runs; honors "allow for this session". */  private confirmAgentWrite(block: ToolUseBlock): Promise<boolean> {
    if (this.agentWriteAlways) return Promise.resolve(true);
    return new Promise((resolve) => {
      new WriteConfirmModal(this.app, block, (choice) => {
        if (choice === "always") {
          this.agentWriteAlways = true;
          this.header.updateWriteGrantPill();
        }
        resolve(choice !== "deny");
      }).open();
    });
  }

  /** Push the chatFontSize setting onto the view as --cc-chat-font (drives .cc-body). */
  private applyChatFontSize(): void {
    this.containerEl.style.setProperty("--cc-chat-font", `${this.plugin.settings.chatFontSize}px`);
  }

  /** Displayed mode: Plan wins over Act, otherwise Act iff writes are allowed. */
  private currentMode(): ChatMode {
    return this.planMode ? "plan" : this.plugin.settings.agentAllowWrites ? "act" : "ask";
  }

  /** Reflect the mode control: hidden when the session can't act, state from currentMode(). */
  private updateModeControl(): void {
    this.modeControl?.setVisible(this.agentCapable);
    this.modeControl?.set(this.currentMode());
  }

  /** Apply an Ask / Plan / Act switch: writes setting + Plan Mode, the matching notice, then persist if writes changed. */
  private async applyMode(mode: ChatMode): Promise<void> {
    // Plan leaves the writes setting untouched — only Ask/Act set it.
    const previousWrites = this.plugin.settings.agentAllowWrites;
    const previousPlanMode = this.planMode;
    let writesChanged = false;
    if (mode !== "plan") {
      const writesOn = mode === "act";
      writesChanged = this.plugin.settings.agentAllowWrites !== writesOn;
      this.plugin.settings.agentAllowWrites = writesOn;
    }
    this.planMode = mode === "plan";
    this.updateModeControl();
    quickNotice(
      mode === "act"
        ? "Act on vault: on — I'll create and edit notes (each change asks first)."
        : mode === "plan"
          ? "Plan Mode: on — I'll explore read-only and propose a plan, no writes."
          : "Act on vault: off — chat only, I won't change your vault.",
    );
    if (writesChanged) {
      try {
        await this.plugin.saveSettings();
      } catch (e) {
        this.plugin.settings.agentAllowWrites = previousWrites;
        this.planMode = previousPlanMode;
        this.updateModeControl();
        quickNotice(`Couldn't save the mode: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /** Live tool chips for the in-flight agent turn, inserted above the answer body. */
  private createToolChips(bubble: HTMLElement, body: HTMLElement) {
    let container: HTMLElement | null = null;
    const open = new Map<string, HTMLElement>();
    const ensure = (): HTMLElement => {
      if (!container) {
        container = bubble.createDiv({ cls: "cc-tool-chips" });
        bubble.insertBefore(container, body);
      }
      return container;
    };
    return {
      start: (block: ToolUseBlock): void => {
        const chip = ensure().createEl("details", { cls: "cc-tool-chip is-running" });
        chip.createEl("summary", { cls: "cc-tool-chip-summary", text: chipLabel(block.name, block.input) });
        open.set(block.id, chip);
        this.scrollToBottom();
      },
      finish: (block: ToolUseBlock, result: ToolResultBlock): void => {
        const chip = open.get(block.id);
        if (!chip) return;
        chip.removeClass("is-running");
        if (result.is_error) chip.addClass("is-error");
        chip.createEl("pre", { cls: "cc-tool-chip-result", text: previewText(result.content) });
      },
    };
  }

  /** Re-render persisted tool chips (from a message's toolTrace) on replay. */
  private renderTraceChips(bubble: HTMLElement, body: HTMLElement, trace: ToolTraceEntry[]): void {
    const container = bubble.createDiv({ cls: "cc-tool-chips" });
    bubble.insertBefore(container, body);
    for (const t of trace) {
      const chip = container.createEl("details", { cls: `cc-tool-chip${t.ok ? "" : " is-error"}` });
      chip.createEl("summary", { cls: "cc-tool-chip-summary", text: chipLabel(t.name, t.argsSummary) });
      chip.createEl("pre", { cls: "cc-tool-chip-result", text: t.resultPreview });
    }
  }

  /** Muted status line under an agent turn (iteration cap, early end). */
  private annotateAgentNotice(bubble: HTMLElement, text: string): void {
    bubble.createDiv({ cls: "cc-agent-notice", text });
  }

  private async stopCurrentTurn(): Promise<void> {
    const turn = this.currentTurn;
    if (!turn) {
      this.abort?.abort();
      return;
    }
    await this.plugin.stopActiveChatTurn(turn.conversationId, turn.turnId);
  }

  async resumeInterruptedTurn(conversation: Conversation): Promise<void> {
    const receipt = conversation.activeTurn;
    if (!receipt || (receipt.state !== "interrupted" && receipt.state !== "failed")) return;
    this.resumeCliSessionId = receipt.cliSessionId ?? conversation.cliSessionId ?? null;
    try {
      await this.run(
        "Inspect the current vault state, report what the interrupted task already completed, and continue only unfinished work. Do not repeat completed writes.",
        "Resume interrupted task",
      );
    } finally {
      this.resumeCliSessionId = null;
    }
  }

  private renderInterruptedTurn(conversation: Conversation): void {
    const row = this.messagesEl.createDiv({ cls: "cc-agent-notice cc-interrupted-turn" });
    row.createSpan({ text: "This task was interrupted. Review any partial changes before resuming." });
    const resume = row.createEl("button", { text: "Resume", cls: "mod-cta" });
    resume.addEventListener("click", () => void this.resumeInterruptedTurn(conversation));
  }

  // ---------- rendering ----------

  /** The round spark mark before an assistant bubble's content (screen-reader label "Claude" is carried by .cc-role, not this icon). */
  private addSparkMark(bubble: HTMLElement): void {
    setIcon(bubble.createSpan({ cls: "cc-spark" }), "sparkles");
  }

  private createAssistantBubble(): { bubble: HTMLElement; body: HTMLElement } {
    const bubble = this.messagesEl.createDiv({ cls: "cc-msg cc-assistant" });
    bubble.createDiv({ cls: "cc-role", text: "Claude" });
    this.addSparkMark(bubble);
    const body = bubble.createDiv({ cls: "cc-body" });
    // One indicator only: the breathing smiley in the thinking status. (The old
    // "▍" cursor was a second clay marker fighting it.)
    this.startThinkingStatus(body);
    this.scrollToBottom();
    return { bubble, body };
  }

  /** Playful "Claudian" gerunds shown while Claude works, before text arrives. */
  private static readonly CLAUDIAN = [
    "Manifesting", "Synthesizing", "Philosophising", "Pondering",
    "Actualizing", "Synergizing", "Ruminating", "Clauding",
  ];

  /**
   * Show a single breathing smiley on the left with a whimsical word cycling
   * beside it until the first token lands. The smiley is fixed-position so the
   * word's changing length never shifts it. The smiley pulses 4× per word-fade
   * cycle (80 bpm vs 20 bpm) — driven by CSS; the word swaps on the fade trough.
   */
  private startThinkingStatus(body: HTMLElement): void {
    const status = body.createSpan({ cls: "cc-thinking-status" });
    setIcon(status.createSpan({ cls: "cc-thinking-dot" }), "smile");
    const word = status.createSpan({ cls: "cc-thinking-word" });
    let i = this.claudianSeq++;
    const tick = () => {
      word.setText(`${ChatView.CLAUDIAN[i % ChatView.CLAUDIAN.length]}…`);
      i++;
    };
    tick();
    this.clearThinkingStatus();
    // 3000ms = the 20-bpm word-fade period, so the swap lands at the fade trough.
    this.thinkingTimer = window.setInterval(tick, 3000);
  }

  private clearThinkingStatus(): void {
    if (this.thinkingTimer != null) {
      window.clearInterval(this.thinkingTimer);
      this.thinkingTimer = null;
    }
  }

  /**
   * Insert a collapsible reasoning panel before the answer body. Returns the
   * element that thinking text is streamed into. Inserted once per turn.
   */
  private createThinkingPanel(bubble: HTMLElement): HTMLElement {
    const details = bubble.createEl("details", { cls: "cc-thinking" });
    details.setAttr("open", "");
    details.createEl("summary", { cls: "cc-thinking-summary", text: "Reasoning" });
    const pre = details.createEl("pre", { cls: "cc-thinking-body" });
    // Place the panel right after the role label, above the answer body.
    const body = bubble.querySelector(".cc-body");
    if (body) bubble.insertBefore(details, body);
    return pre;
  }

  private renderMessage(role: "user" | "assistant", text: string, opts?: { command?: boolean }): void {
    if (this.messages.length === 1) this.messagesEl.empty();
    const bubble = this.messagesEl.createDiv({ cls: `cc-msg cc-${role}${opts?.command ? " cc-command" : ""}` });
    if (opts?.command) {
      this.renderCommandChip(bubble, text);
      this.scrollToBottom();
      return;
    }
    bubble.createDiv({ cls: "cc-role", text: role === "user" ? "You" : "Claude" });
    if (role === "assistant") this.addSparkMark(bubble);
    const body = bubble.createDiv({ cls: "cc-body" });
    void this.renderMarkdownInto(body, text);
    this.scrollToBottom();
  }

  /** A slash command / workflow invocation renders as a compact accent chip
   *  (e.g. "/summarize") instead of a plain user bubble of raw prompt text. */
  private renderCommandChip(bubble: HTMLElement, label: string): void {
    const chip = bubble.createDiv({ cls: "cc-command-chip" });
    setIcon(chip.createSpan({ cls: "cc-command-chip-icon" }), "terminal");
    chip.createSpan({ cls: "cc-command-chip-label", text: label });
  }

  private renderError(body: HTMLElement, message: string, provider: ErrorHintProvider): void {
    // Append below any partial streamed content — never destroy what arrived.
    // But a failure before the first token leaves the "thinking" indicator in
    // place; drop it so the bubble doesn't show both a spinner and the error.
    body.querySelector(".cc-thinking-status")?.remove();
    const box = body.createDiv({ cls: "cc-error" });
    box.createSpan({ cls: "cc-error-title", text: "Couldn’t reach the model" });
    box.createSpan({ text: message });
    const hint = errorHint(message, provider);
    if (hint) box.createDiv({ cls: "cc-error-hint", text: hint });
    if (this.lastUserText) {
      const retry = box.createEl("button", { cls: "cc-error-retry", text: "Retry" });
      retry.addEventListener("click", () => void this.regenerate());
    }
  }

  /** Re-attach the failed turn's media so a retry (or edit) still has it. */
  private restoreMediaAfterFailure(): void {
    if (this.lastUserMedia.length > 0 && this.attachedMedia.length === 0) {
      this.attachedMedia = this.lastUserMedia;
      this.renderContextManager();
    }
  }

  /** Flag a reply that the model truncated at the output-token limit. */
  private annotateTruncated(bubble: HTMLElement): void {
    if (bubble.querySelector(".cc-truncated-note")) return;
    const cap = this.controls?.maxTokens ?? this.plugin.settings.maxTokens;
    const note = bubble.createDiv({ cls: "cc-truncated-note" });
    note.createSpan({ cls: "cc-truncated-title", text: "Response hit the output-token limit" });
    note.createSpan({ text: ` — it was cut off at ${cap} tokens.` });
    const retry = note.createEl("button", { cls: "cc-error-retry", text: "Retry with a higher limit" });
    retry.addEventListener("click", () => void this.regenerate({ maxTokens: Math.min(cap * 2, 64000) }));
  }

  private renderInterruptedArtifact(body: HTMLElement): void {
    body.empty();
    const box = body.createDiv({ cls: "cc-error" });
    box.createSpan({ cls: "cc-error-title", text: "Artifact generation stopped" });
    box.createSpan({ text: "The HTML block did not finish, so it was not saved to the chat history." });
  }

  private annotateContext(sources: string[]): void {
    if (sources.length === 0) return;
    const last = this.messagesEl.lastElementChild;
    if (!last) return;
    last.createDiv({ cls: "cc-context-note", text: `+ context: ${sources.join(", ")}` });
  }

  refreshBackendPill(): Promise<void> { return this.header.refreshBackendPill(); }

  refreshContextStatus(): Promise<void> { return this.header.refreshContextStatus(); }

  private resolveMarkdownContextView(): MarkdownView | null {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active?.file) {
      this.lastMarkdownView = active;
      this.lastMarkdownFilePath = active.file.path;
      return active;
    }

    const activeFile = this.app.workspace.getActiveFile();
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    const views = leaves.map((leaf) => leaf.view).filter((view): view is MarkdownView => view instanceof MarkdownView && !!view.file);
    const byActiveFile = activeFile ? views.find((view) => view.file?.path === activeFile.path) : null;
    const byLastFile = this.lastMarkdownFilePath ? views.find((view) => view.file?.path === this.lastMarkdownFilePath) : null;
    const fallback = byActiveFile ?? byLastFile ?? this.lastMarkdownView;
    if (fallback?.file) {
      this.lastMarkdownView = fallback;
      this.lastMarkdownFilePath = fallback.file.path;
      return fallback;
    }
    return null;
  }

  private openMcpMenu(anchor: MouseEvent | HTMLElement): void { return this.header.openMcpMenu(anchor); }

  private openOverflowMenu(): void { return this.header.openOverflowMenu(); }

  private openModelMenu(): void { return this.header.openModelMenu(); }

  private async renderMarkdownInto(el: HTMLElement, markdown: string): Promise<void> {
    const version = this.bumpRenderVersion(el);
    const rendered = createDiv();
    await MarkdownRenderer.render(this.app, markdown, rendered, this.app.workspace.getActiveFile()?.path ?? "", this);
    if (this.renderVersions.get(el) !== version) return;
    el.replaceChildren(...Array.from(rendered.childNodes));
  }

  /**
   * While a `claude-html` artifact is streaming, don't dump its raw HTML source
   * into the bubble. Render whatever prose preceded the fence as markdown and put
   * a compact "building" chip in the artifact's place; the final `renderMarkdownInto`
   * on `onDone` swaps in the sandboxed iframe. Painted once per artifact (flush
   * guards re-entry) so the chip and lead-in prose stay stable, not re-rendered
   * every frame.
   */
  private renderStreamingArtifactInto(el: HTMLElement, buffer: string): void {
    const { before } = splitStreamingArtifact(buffer);
    const version = this.bumpRenderVersion(el);
    const rendered = createDiv();
    const paint = (): void => {
      if (this.renderVersions.get(el) !== version) return;
      const chip = rendered.createDiv({ cls: "cc-artifact-building" });
      chip.createSpan({ cls: "cc-artifact-building-label", text: "Building artifact…" });
      el.replaceChildren(...Array.from(rendered.childNodes));
    };
    if (before.trim().length > 0) {
      void MarkdownRenderer.render(this.app, before, rendered, this.app.workspace.getActiveFile()?.path ?? "", this).then(paint);
    } else {
      paint();
    }
  }

  private bumpRenderVersion(el: HTMLElement): number {
    const version = (this.renderVersions.get(el) ?? 0) + 1;
    this.renderVersions.set(el, version);
    return version;
  }

  private addAssistantActions(bubble: HTMLElement, full: string): void {
    bubble.querySelectorAll(":scope > .cc-actions").forEach((el) => el.remove());
    // Per-code-block copy buttons inside the rendered markdown.
    this.decorateCodeBlocks(bubble);

    const bar = bubble.createDiv({ cls: "cc-actions" });
    this.actionBtn(bar, "Copy", "copy", () => {
      void navigator.clipboard.writeText(full);
      quickNotice("Copied to clipboard");
    });
    this.actionBtn(bar, "Insert", "text-cursor-input", () => this.insertIntoNote(full));
    // One Save button that adapts to the content: an artifact saves as an inline
    // `claude-html` note (accented to stand out), anything else saves as a plain
    // chat note. (These used to be two separate buttons running the same handler.)
    const isArtifact = !!extractArtifact(full);
    const saveBtn = this.actionBtn(
      bar,
      isArtifact ? "Save artifact" : "Save as note",
      isArtifact ? "layout-dashboard" : "save",
      () => void this.saveReplyAsNote(full),
    );
    if (isArtifact) saveBtn.addClass("cc-accent");
    // A plan reply (has a `## Build tasks` checklist) gets execution buttons:
    // "Implement" runs the tasks in-app via agent mode (vault work); "Build"
    // hands the plan off to Claude Code (code work outside the vault).
    if (extractTasks(full).length > 0) {
      const impl = this.actionBtn(bar, "Implement", "play", () => void this.implementFromReply(full));
      impl.addClass("cc-accent");
      this.actionBtn(bar, "Build", "hammer", () => void this.buildFromReply(full));
    }
    // Regenerate the last reply (only on the most recent assistant message).
    const tail = this.messages[this.messages.length - 1];
    const isLast = tail?.role === "assistant";
    if (isLast && this.lastUserText) {
      this.actionBtn(bar, "Regenerate", "refresh-cw", () => void this.regenerate());
    }
  }

  /**
   * Execute the plan in-app: feed its build tasks back through agent mode so
   * Claude actually does the vault work (create/edit notes, canvases, bases) —
   * each write still confirms. Needs agent mode + Claude; otherwise points the
   * user at the Build (Claude Code) handoff instead.
   */
  private async implementFromReply(full: string): Promise<void> {
    if (this.streaming) return;
    if (!this.plugin.settings.agentModeEnabled || !this.plugin.router().chatCapabilities().agentActions) {
      new Notice("Turn on agent mode (and use Claude or Claude Code) to implement in-app, or use Build to hand off to Claude Code.");
      return;
    }
    if (!this.plugin.settings.agentAllowWrites) {
      new Notice("Turn on “Act on vault” to let me make the changes, then hit Implement again.");
      return;
    }
    const tasks = extractTasks(full);
    const list = tasks.map((t, i) => `${i + 1}. ${t.title}`).join("\n");
    const prompt =
      "Implement the plan above by actually doing the work in my vault. Go through these build tasks in order, " +
      "using your vault tools to create and edit the notes/canvases/bases each one calls for — don't just re-describe the plan. " +
      "Note briefly what you changed after each. If a task requires code changes outside the vault, say so and skip it.\n\n" +
      `Tasks:\n${list}`;
    await this.submitPrompt(prompt, "Implement plan");
  }

  /** Save a plan reply as a `type: plan` note, then hand it to the build flow. */
  private async buildFromReply(full: string): Promise<void> {
    const artifact = extractArtifact(full);
    const { tags, summary, title } = await this.maybeIndex(full);
    const planTitle = title ?? artifact?.title ?? this.fallbackTitle();
    const file = await savePlanNote(this.app, this.plugin.settings.planFolder, planTitle, full, {
      extraTags: tags,
      ...(summary !== undefined ? { summary } : {}),
    });
    await this.plugin.handoffToBuild(file);
  }

  /** Add a hover "copy" button to each <pre><code> block in a rendered reply. */
  private decorateCodeBlocks(bubble: HTMLElement): void {
    bubble.querySelectorAll("pre").forEach((pre) => {
      if (pre.querySelector(".cc-code-copy")) return; // already decorated
      const el = pre as HTMLElement;
      el.addClass("cc-has-copy");
      const btn = el.createEl("button", { cls: "cc-code-copy", text: "Copy", attr: { "aria-label": "Copy code" } });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const code = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
        void navigator.clipboard.writeText(code);
        btn.setText("Copied!");
        window.setTimeout(() => btn.setText("Copy"), 1200);
      });
    });
  }

  /** Drop the last assistant reply and re-run the previous user turn. */
  private async regenerate(opts?: { maxTokens?: number }): Promise<void> {
    if (this.streaming || !this.lastUserText) return;
    // Remove the trailing assistant message from state + DOM, plus the user msg
    // (run() re-pushes it). Then re-run with the same text.
    if (this.messages[this.messages.length - 1]?.role === "assistant") this.messages.pop();
    if (this.messages[this.messages.length - 1]?.role === "user") this.messages.pop();
    // Rebuild the transcript cleanly so we don't leave a stale bubble.
    this.messagesEl.empty();
    if (this.messages.length === 0) this.renderEmptyState();
    else for (const m of this.messages) this.renderStoredMessage(m);
    // Re-attach the original turn's media so the regenerated turn sees it too.
    if (this.attachedMedia.length === 0 && this.lastUserMedia.length > 0) {
      this.attachedMedia = [...this.lastUserMedia];
    }
    await this.run(this.lastUserText, this.lastDisplay, opts?.maxTokens);
  }

  /**
   * Index a document for durable storage: tags + a one-line summary, generated
   * by the utility provider (local Ollama when available, else Claude — heavy
   * lifting offloads automatically). Best-effort: never blocks a save.
   */
  private async maybeIndex(content: string): Promise<{ tags: string[]; summary?: string; title?: string }> {
    if (!this.plugin.settings.autoTagOnSave) return { tags: [] };
    try {
      const { summarizeAndTag, existingVaultTags } = await import("../indexing/autoTagger");
      const res = await summarizeAndTag(this.plugin.router(), content, existingVaultTags(this.app));
      return {
        tags: res.tags,
        ...(res.summary ? { summary: res.summary } : {}),
        ...(res.title ? { title: res.title } : {}),
      };
    } catch (e) {
      console.debug("Claude Companion: auto-tag failed", e);
      return { tags: [] };
    }
  }

  /**
   * A title derived from the *answer*, never the prompt. Used as a fallback when
   * the indexer (which produces a better title) is disabled or fails.
   */
  private fallbackTitle(): string {
    const firstAssistant = this.messages.find((m) => m.role === "assistant")?.content ?? "";
    const line = firstAssistant
      .split("\n")
      .map((l) => l.replace(/^#+\s*/, "").replace(/[*_`]/g, "").trim())
      .find((l) => l.length > 0) ?? "";
    // Match the first sentence with a lookahead (lookbehind is unsupported on iOS < 16.4).
    const sentence = line.match(/^.*?[.?!](?=\s)/)?.[0] || line;
    return (sentence || "Claude chat").slice(0, 60);
  }

  /**
   * Save a reply as a durable, indexed note. If the reply contains a
   * `claude-html` artifact, it's saved as an artifact note (renders inline) —
   * not a raw fenced dump. Either way it gets auto-tags + a summary in
   * frontmatter so semantic/query search and Dataview index it correctly.
   */
  private async saveReplyAsNote(full: string): Promise<void> {
    const artifact = extractArtifact(full);
    new Notice("Indexing & saving…");

    // A plan reply carries a `## Build tasks` checklist. Save it as a canonical
    // `type: plan` note (artifact renders inline + checklist drives Build).
    if (extractTasks(full).length > 0) {
      const { tags, summary, title } = await this.maybeIndex(full);
      const planTitle = title ?? artifact?.title ?? this.fallbackTitle();
      const file = await savePlanNote(this.app, this.plugin.settings.planFolder, planTitle, full, {
        extraTags: tags,
        ...(summary !== undefined ? { summary } : {}),
      });
      await this.app.workspace.getLeaf(true).openFile(file);
      return;
    }

    if (artifact) {
      const { tags, summary } = await this.maybeIndex(`${artifact.title}\n\n${full}`);
      const file = await saveArtifactNote(this.app, this.plugin.settings.artifactFolder, artifact, {
        height: this.plugin.settings.artifactHeight,
        baseTags: this.plugin.settings.artifactBaseTags,
        extraTags: tags,
        ...(summary !== undefined ? { summary } : {}),
      });
      await this.app.workspace.getLeaf(true).openFile(file);
      return;
    }
    const { tags, summary, title } = await this.maybeIndex(full);
    const heuristic = full.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").slice(0, 60) ?? "Claude reply";
    await saveChatNote(this.app, this.plugin.settings.chatFolder, title ?? heuristic, full, {
      baseTags: this.plugin.settings.chatBaseTags,
      extraTags: tags,
      ...(summary !== undefined ? { summary } : {}),
    });
  }

  private actionBtn(bar: HTMLElement, label: string, icon: string, onClick: () => void): HTMLButtonElement {
    const btn = bar.createEl("button", { cls: "cc-action clickable-icon", attr: { "aria-label": label, title: label } });
    setIcon(btn, icon);
    btn.addEventListener("click", onClick);
    return btn;
  }

  private insertIntoNote(text: string): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("Open a note to insert into.");
      return;
    }
    view.editor.replaceSelection(text);
    quickNotice("Inserted into note");
  }

  private async saveChat(): Promise<void> {
    if (this.messages.length === 0) {
      new Notice("Nothing to save yet.");
      return;
    }
    const md = this.messages.map((m) => `**${m.role === "user" ? "You" : "Claude"}:**\n\n${m.content}`).join("\n\n---\n\n");
    new Notice("Indexing & saving…");
    const { tags, summary, title } = await this.maybeIndex(md);
    const finalTitle = title ?? this.fallbackTitle();
    await saveChatNote(this.app, this.plugin.settings.chatFolder, finalTitle, md, {
      baseTags: this.plugin.settings.chatBaseTags,
      extraTags: tags,
      ...(summary !== undefined ? { summary } : {}),
    });
    if (this.plugin.settings.memoryEnabled && this.plugin.settings.memoryIngestOnSave) {
      await this.plugin.captureConversation(this.messages); // also file this chat into memory
    }
  }

  private scrollToBottom(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
}
