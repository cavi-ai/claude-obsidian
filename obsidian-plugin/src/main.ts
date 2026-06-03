import { App, MarkdownView, Modal, Notice, Platform, Plugin, requestUrl, WorkspaceLeaf } from "obsidian";
import { ChatView, CHAT_VIEW_TYPE } from "./view/ChatView";
import { MemoryView, MEMORY_VIEW_TYPE } from "./view/MemoryView";
import { SessionPicker } from "./view/SessionPicker";
import { listSessionsForVault, nodeSessionReader, defaultProjectsRoot, type SessionMeta } from "./memory/sessions";
import { ingestSession, ingestConversation } from "./memory/ingest";
import { ClaudeCompanionSettingTab } from "./settings";
import { ProviderRouter } from "./providers/router";
import { DEFAULT_SETTINGS, type PluginSettings } from "./types";
import { DESIGN_SYSTEM_PROMPT, PLANNING_INSTRUCTION } from "./artifacts/designSystem";
import { renderArtifactInline } from "./artifacts/renderInline";
import type { McpHttpServer } from "./mcp/server";
import { VaultTools } from "./mcp/vaultTools";
import { generateToken, resolveMcpToken } from "./mcp/clientConfig";
import { extractTasks, specBody, claudeCodeBuildCommand, type SpecInput } from "./build/spec";
import { trackerArtifact } from "./build/tracker";
import { type CloudDispatchConfig, buildFireRequest, parseFireResponse, composeDispatchText, configError } from "./cloud/routines";
import { type RepliesConfig, buildContentsRequest, parseDirListing, parseFileResponse, isMarkdown, configError as repliesConfigError } from "./cloud/replies";
import { buildFrontmatter, normalizeTags } from "./indexing/frontmatter";
import {
  type Conversation,
  type ConversationState,
  emptyState,
  fromPersisted,
  getActive,
  newConversation,
  saveConversation,
  deleteConversation as removeConversation,
  setActive,
  touch,
} from "./conversations/store";
import type { ChatMessage } from "./types";
import { normalizePath, TFile } from "obsidian";

/** Shape of this plugin's persisted data.json (settings + chat history). */
interface PersistedData {
  settings?: Partial<PluginSettings>;
  conversations?: Conversation[];
  activeConversationId?: string | null;
}

export default class ClaudeCompanionPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  private convState: ConversationState = emptyState();
  private convSeq = 0;
  private _router: ProviderRouter | null = null;
  private mcpServer: McpHttpServer | null = null;
  private vaultTools: VaultTools | null = null;
  /** Serializes overlapping syncMcpServer() calls (settings fire it per keystroke). */
  private mcpSyncChain: Promise<void> = Promise.resolve();
  /** Signature of the currently-running MCP server, to skip needless restarts. */
  private mcpSignature: string | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(CHAT_VIEW_TYPE, (leaf: WorkspaceLeaf) => new ChatView(leaf, this));
    this.registerView(MEMORY_VIEW_TYPE, (leaf: WorkspaceLeaf) => new MemoryView(leaf, this));

    // Inline interactive artifacts: ```claude-html ... ```
    this.registerMarkdownCodeBlockProcessor("claude-html", (source, el, ctx) => {
      let height = this.settings.artifactHeight;
      let title = "Claude artifact";
      const info = ctx.getSectionInfo(el);
      if (info) {
        const fence = info.text.split("\n")[info.lineStart] ?? "";
        const m = /height=(\d+)/.exec(fence);
        if (m) height = parseInt(m[1], 10);
      }
      const t = /<title>([^<]+)<\/title>/i.exec(source);
      if (t) title = t[1].trim();
      renderArtifactInline(el, source, height, title);
    });

    this.addRibbonIcon("sparkles", "Open Companion for Claude", () => void this.activateView());
    if (this.settings.memoryEnabled) {
      this.addRibbonIcon("brain", "Capture Claude session memory", () => void this.openSessionPicker());
    }

    this.addCommand({
      id: "open-chat",
      name: "Open chat panel",
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: "new-chat",
      name: "New chat",
      callback: async () => {
        const view = await this.activateView();
        view?.clearChat();
      },
    });

    this.addCommand({
      id: "plan-from-note",
      name: "Generate implementation plan from current note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
        if (checking) return !!file;
        void this.generatePlanFromNote();
        return true;
      },
    });

    this.addCommand({
      id: "artifact-from-selection",
      name: "Turn selection / note into a beautiful artifact",
      callback: () => void this.generateArtifactFromContext(),
    });

    this.addCommand({
      id: "ask-vault",
      name: "Ask Claude about my vault (search-augmented)",
      callback: async () => {
        this.settings.context.searchVault = true;
        await this.saveSettings();
        const view = await this.activateView();
        view?.refreshModelLabel();
        new Notice("Vault search is on — ask your question in the chat panel.");
      },
    });

    this.addCommand({
      id: "browse-conversations",
      name: "Resume a past conversation",
      callback: () => void this.browseConversations(),
    });

    this.addCommand({
      id: "delete-active-conversation",
      name: "Delete the current conversation",
      checkCallback: (checking) => {
        const active = this.getActiveConversation();
        if (checking) return !!active;
        void this.deleteActiveConversation();
        return true;
      },
    });

    this.addCommand({
      id: "build-from-plan",
      name: "Hand off current note to Claude Code (build)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
        if (checking) return !!file;
        void this.handoffToBuild();
        return true;
      },
    });

    this.addCommand({
      id: "dispatch-cloud-session",
      name: "Send to cloud Claude session (mobile-friendly)",
      callback: () => void this.dispatchCloudSession(),
    });

    this.addCommand({
      id: "pull-cloud-replies",
      name: "Pull cloud session replies into the vault",
      callback: () => void this.pullCloudReplies(),
    });

    this.addCommand({
      id: "capture-session-memory",
      name: "Capture session memory…",
      callback: () => void this.openSessionPicker(),
    });

    this.addCommand({
      id: "open-memory-view",
      name: "Open session memory",
      callback: () => void this.activateMemoryView(),
    });

    this.addSettingTab(new ClaudeCompanionSettingTab(this.app, this));

    // Start the MCP bridge if enabled (deferred so it doesn't block load).
    this.app.workspace.onLayoutReady(() => void this.syncMcpServer());
  }

  onunload(): void {
    void this.mcpServer?.stop();
    this.mcpServer = null;
  }

  // ---------- settings ----------

  async loadSettings(): Promise<void> {
    const raw = (await this.loadData()) as PersistedData | Partial<PluginSettings> | null;
    // Migrate the legacy shape (data.json *was* the settings object) to the
    // namespaced { settings, conversations } shape.
    const isNamespaced = !!raw && typeof raw === "object" && ("settings" in raw || "conversations" in raw);
    const settingsData = (isNamespaced ? (raw as PersistedData).settings : raw) as Partial<PluginSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...settingsData,
      context: { ...DEFAULT_SETTINGS.context, ...(settingsData?.context ?? {}) },
    };
    this.convState = isNamespaced
      ? fromPersisted({ conversations: (raw as PersistedData).conversations, activeId: (raw as PersistedData).activeConversationId })
      : emptyState();
  }

  /** Write settings + conversation history back to data.json. */
  private async persist(): Promise<void> {
    const data: PersistedData = {
      settings: this.settings,
      conversations: this.convState.conversations,
      activeConversationId: this.convState.activeId,
    };
    await this.saveData(data);
  }

  async saveSettings(): Promise<void> {
    await this.persist();
    // Rebuild providers if any credentials/hosts changed.
    this._router = null;
    this.refreshViews();
    await this.syncMcpServer();
  }

  // ---------- conversation history ----------

  private nextConversationId(): string {
    return `c${Date.now().toString(36)}-${(this.convSeq++).toString(36)}`;
  }

  listConversations(): Conversation[] {
    return this.convState.conversations;
  }

  getActiveConversation(): Conversation | null {
    return getActive(this.convState);
  }

  /**
   * Persist the current message list into the active conversation, creating one
   * on first save. Returns the active conversation id (or null when there is
   * nothing to save). Best-effort: a save failure never blocks the chat.
   */
  async saveActiveConversation(messages: ChatMessage[]): Promise<string | null> {
    if (messages.length === 0) return this.convState.activeId;
    const base = getActive(this.convState) ?? newConversation(this.nextConversationId(), Date.now());
    const updated = touch(base, messages, Date.now());
    this.convState = saveConversation(this.convState, updated, this.settings.maxConversations);
    try {
      await this.persist();
    } catch (e) {
      console.error("[Claude Companion] failed to save conversation", e);
    }
    return updated.id;
  }

  /** Switch the active conversation (e.g. from the history picker). */
  async setActiveConversation(id: string): Promise<Conversation | null> {
    this.convState = setActive(this.convState, id);
    await this.persist();
    return getActive(this.convState);
  }

  /** Start a fresh conversation (the current one is already auto-saved). */
  async startNewConversation(): Promise<void> {
    this.convState = setActive(this.convState, null);
    await this.persist();
  }

  async deleteConversation(id: string): Promise<void> {
    this.convState = removeConversation(this.convState, id);
    await this.persist();
  }

  private async browseConversations(): Promise<void> {
    const view = await this.activateView();
    view?.openHistory();
  }

  async deleteActiveConversation(): Promise<void> {
    const active = this.getActiveConversation();
    if (!active) {
      new Notice("No active conversation to delete.");
      return;
    }
    await this.deleteConversation(active.id);
    const view = await this.activateView();
    if (!view) return;
    const next = this.getActiveConversation();
    if (next) view.loadConversation(next);
    else view.resetToEmpty();
    new Notice(`Deleted “${active.title}”.`);
  }

  // ---------- MCP bridge ----------

  /**
   * Start, stop, or restart the MCP server to match current settings. Serialized
   * (the settings UI calls saveSettings → this on every keystroke, un-awaited)
   * and idempotent (skips a restart when the running server already matches), so
   * overlapping syncs can't EADDRINUSE the fixed port and silently drop the bridge.
   */
  syncMcpServer(): Promise<void> {
    this.mcpSyncChain = this.mcpSyncChain.catch(() => {}).then(() => this.applyMcpServer());
    return this.mcpSyncChain;
  }

  /** The bearer token the server validates against: env var wins over stored. */
  private resolvedMcpToken(): string {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    return resolveMcpToken(env, this.settings.mcpToken).token;
  }

  /** Desired server signature for the current settings, or null when it shouldn't run. */
  private mcpDesiredSignature(): string | null {
    const s = this.settings;
    if (Platform.isMobile || !s.mcpEnabled) return null;
    return JSON.stringify({ port: s.mcpPort, token: this.resolvedMcpToken(), writes: s.mcpAllowWrites, folder: s.mcpWriteFolder });
  }

  private async applyMcpServer(): Promise<void> {
    const desired = this.mcpDesiredSignature();
    // Already running with the same config → nothing to do (avoids churning the
    // port on unrelated settings changes).
    if (desired !== null && this.mcpServer?.isRunning() && desired === this.mcpSignature) return;

    if (this.mcpServer) {
      await this.mcpServer.stop();
      this.mcpServer = null;
      this.mcpSignature = null;
    }
    // The MCP bridge runs only on desktop — it needs a Node http server, which
    // Obsidian's mobile runtime lacks. The dynamic import below keeps that code
    // (and its `http` dependency) from ever loading on mobile.
    if (desired === null) return;

    const s = this.settings;
    if (!this.vaultTools) {
      this.vaultTools = new VaultTools(this.app, { allowWrites: s.mcpAllowWrites, defaultFolder: s.mcpWriteFolder });
    } else {
      this.vaultTools.setOptions({ allowWrites: s.mcpAllowWrites, defaultFolder: s.mcpWriteFolder });
    }

    const { McpHttpServer } = await import("./mcp/server");
    const server = new McpHttpServer(
      { port: s.mcpPort, token: this.resolvedMcpToken(), serverInfo: { name: "obsidian-vault", version: "0.2.0" } },
      this.vaultTools,
      (level, message) => (level === "error" ? console.error("[Claude Companion MCP]", message) : console.log("[Claude Companion MCP]", message)),
    );
    try {
      await server.start();
      this.mcpServer = server;
      this.mcpSignature = desired;
    } catch (e) {
      new Notice(`MCP bridge failed to start on port ${s.mcpPort}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  mcpRunning(): boolean {
    return this.mcpServer?.isRunning() ?? false;
  }

  mcpStats(): { running: boolean; port: number | null; activeRequests: number; handledRequests: number } {
    const stats = this.mcpServer?.stats() ?? { activeRequests: 0, handledRequests: 0 };
    return {
      running: this.mcpRunning(),
      port: this.mcpServer?.address()?.port ?? null,
      activeRequests: stats.activeRequests,
      handledRequests: stats.handledRequests,
    };
  }

  async setMcpEnabled(enabled: boolean): Promise<void> {
    this.settings.mcpEnabled = enabled;
    // Only mint a stored token when neither the env var nor a stored token exists.
    if (enabled && !this.resolvedMcpToken()) {
      this.settings.mcpToken = generateToken();
    }
    await this.saveSettings();
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
  }

  // ---------- providers ----------

  router(): ProviderRouter {
    if (!this._router) this._router = new ProviderRouter(this.settings);
    return this._router;
  }

  composeSystemPrompt(): string {
    return `${this.settings.systemPrompt}\n\n${DESIGN_SYSTEM_PROMPT}`;
  }

  // ---------- view ----------

  async activateView(): Promise<ChatView | null> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
      return leaf.view instanceof ChatView ? leaf.view : null;
    }
    return null;
  }

  // ---------- session memory ----------

  /** Absolute path of the current vault, or null if not a desktop file vault. */
  private vaultBasePath(): string | null {
    const adapter = this.app.vault.adapter as unknown as { basePath?: string };
    return typeof adapter.basePath === "string" ? adapter.basePath : null;
  }

  /** List this vault's Claude Code sessions (newest first). */
  async listVaultSessions(): Promise<SessionMeta[]> {
    const base = this.vaultBasePath();
    if (!base) return [];
    return listSessionsForVault(nodeSessionReader, base, defaultProjectsRoot());
  }

  private ingestDeps() {
    return {
      app: this.app,
      read: (path: string) => nodeSessionReader.read(path),
      folder: this.settings.memoryFolder,
      baseTags: this.settings.memoryBaseTags,
    };
  }

  /** Open the picker; ingest the chosen session. */
  async openSessionPicker(): Promise<void> {
    if (!this.settings.memoryEnabled) {
      new Notice("Session memory is disabled in settings.");
      return;
    }
    const sessions = await this.listVaultSessions();
    if (sessions.length === 0) {
      new Notice(
        "No Claude Code sessions found for this vault. Run the `claude` CLI from this vault's folder, then capture.",
        8000,
      );
      return;
    }
    new SessionPicker(this.app, sessions, (session) => {
      void this.captureSession(session);
    }).open();
  }

  /** Ingest one session and report. */
  async captureSession(session: SessionMeta): Promise<void> {
    try {
      const res = await ingestSession(this.ingestDeps(), { id: session.id, path: session.path });
      new Notice(`Captured session · ${res.redactions} secret${res.redactions === 1 ? "" : "s"} redacted`);
      await this.refreshMemoryView();
      await this.app.workspace.getLeaf(false).openFile(res.file);
    } catch (e) {
      console.error("[Claude Companion] session capture failed", e);
      new Notice("Session capture failed — see console.");
    }
  }

  /** Capture the most-recent CLI session for this vault. */
  async captureLatestSession(): Promise<void> {
    const sessions = await this.listVaultSessions();
    if (sessions.length === 0) {
      new Notice("No Claude Code session found for this vault to ingest.");
      return;
    }
    await this.captureSession(sessions[0]);
  }

  /**
   * Capture the current in-app conversation into memory (adapter B). Idempotent
   * by conversation id, so re-saving updates the same digest note. Best-effort.
   */
  async captureConversation(messages: ChatMessage[]): Promise<void> {
    if (!this.settings.memoryEnabled || messages.length === 0) return;
    const conv = this.getActiveConversation();
    try {
      const res = await ingestConversation(
        { app: this.app, folder: this.settings.memoryFolder, baseTags: this.settings.memoryBaseTags },
        messages,
        {
          sessionId: conv?.id,
          model: this.settings.model,
          startedAt: conv ? new Date(conv.createdAt).toISOString() : undefined,
          endedAt: conv ? new Date(conv.updatedAt).toISOString() : undefined,
        },
      );
      new Notice(`Conversation captured to memory · ${res.redactions} secret${res.redactions === 1 ? "" : "s"} redacted`);
      await this.refreshMemoryView();
    } catch (e) {
      console.error("[Claude Companion] conversation capture failed", e);
      new Notice("Couldn't capture this conversation to memory — see console.");
    }
  }

  /** Re-ingest by session id (called from the sidebar). */
  async reingestSession(sessionId: string): Promise<void> {
    const sessions = await this.listVaultSessions();
    const match = sessions.find((s) => (s.sessionId ?? s.id) === sessionId);
    if (!match) {
      new Notice("Original session transcript not found on disk.");
      return;
    }
    await this.captureSession(match);
  }

  async activateMemoryView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(MEMORY_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: MEMORY_VIEW_TYPE, active: true });
    }
    if (leaf) workspace.revealLeaf(leaf);
  }

  private async refreshMemoryView(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(MEMORY_VIEW_TYPE)) {
      if (leaf.view instanceof MemoryView) await leaf.view.render();
    }
  }

  // ---------- command helpers ----------

  async generatePlanFromNote(): Promise<void> {
    this.settings.context.activeNote = true;
    await this.saveSettings();
    const view = await this.activateView();
    if (!view) return;
    await view.submitPrompt(`${PLANNING_INSTRUCTION}\n\nBase the plan entirely on the content of my current note.`);
  }

  /**
   * Turn the active note (an implementation plan) into a build spec + a live
   * tracker note, then hand it to Claude Code. Claude Code reaches the vault
   * through the MCP bridge and updates the tracker as it builds.
   */
  async handoffToBuild(): Promise<void> {
    const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
    if (!(file instanceof TFile)) {
      new Notice("Open a plan note first.");
      return;
    }
    const plan = await this.app.vault.cachedRead(file);
    const tasks = extractTasks(plan);
    if (tasks.length === 0) {
      new Notice("No tasks/milestones found in this note to build from.");
      return;
    }

    const title = file.basename;
    const folder = this.settings.mcpWriteFolder || "Claude/Builds";
    await this.ensureFolder(folder);
    const specPath = normalizePath(`${folder}/${title} — spec.md`);
    const trackerPath = normalizePath(`${folder}/${title} — tracker.md`);

    const input: SpecInput = { title, plan, specPath, trackerPath, tasks, vault: this.app.vault.getName() };

    // Spec note.
    const specFm = buildFrontmatter({ title: `${title} — spec`, created: new Date().toISOString().slice(0, 10), source: "claude-companion", type: "build-spec", tags: normalizeTags(["claude", "build", "spec"]) });
    await this.writeOrReplace(specPath, `${specFm}\n\n${specBody(input)}`);

    // Tracker note (an updating claude-html artifact + a checklist Claude Code appends to).
    const trackerFm = buildFrontmatter({ title: `${title} — tracker`, created: new Date().toISOString().slice(0, 10), source: "claude-companion", type: "build-tracker", tags: normalizeTags(["claude", "build", "tracker"]) });
    const trackerBody = [trackerFm, "", `# ${title} — build tracker`, "", "```claude-html height=520", trackerArtifact(title, tasks), "```", "", "## Progress log", "", "<!-- Claude Code appends progress here -->", ""].join("\n");
    const trackerFile = await this.writeOrReplace(trackerPath, trackerBody);

    // Hand off: copy the ready-to-run command, open the tracker.
    const command = claudeCodeBuildCommand(input);
    await navigator.clipboard.writeText(command).catch(() => {});
    await this.app.workspace.getLeaf(true).openFile(trackerFile);

    new Notice("Build spec + tracker created. Claude Code command copied — run it in a terminal (requires the official Obsidian CLI).", 8000);
  }

  private async ensureFolder(folder: string): Promise<void> {
    const p = normalizePath(folder);
    if (p === "" || p === "/" || this.app.vault.getAbstractFileByPath(p)) return;
    let cur = "";
    for (const part of p.split("/")) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        try {
          await this.app.vault.createFolder(cur);
        } catch {
          /* race */
        }
      }
    }
  }

  private async writeOrReplace(path: string, content: string): Promise<TFile> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return existing;
    }
    return this.app.vault.create(path, content);
  }

  // ---------- cloud session dispatch ----------

  private cloudConfig(): CloudDispatchConfig {
    return {
      fireUrl: this.settings.cloudRoutineFireUrl,
      token: this.settings.cloudRoutineToken,
      betaHeader: this.settings.cloudRoutineBetaHeader,
    };
  }

  /**
   * Prompt for what a cloud session should do, attach light vault context
   * (active note path + selection), and fire the configured routine. Desktop
   * first (Phase 1) — de-risks the Routines API ahead of the mobile build.
   */
  async dispatchCloudSession(): Promise<void> {
    if (!this.settings.cloudDispatchEnabled) {
      new Notice("Cloud session dispatch is off. Enable it in Companion settings → Cloud session.", 7000);
      return;
    }
    const cfgErr = configError(this.cloudConfig());
    if (cfgErr) {
      new Notice(`Cloud session not configured: ${cfgErr}`, 9000);
      return;
    }
    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const selection = mdView?.editor.getSelection().trim() ?? "";
    const parts: string[] = [];
    if (mdView?.file) parts.push(`Active note: ${mdView.file.path}`);
    if (selection) parts.push(`Selected text:\n${selection}`);
    const context = parts.length ? parts.join("\n\n") : undefined;

    new CloudDispatchModal(this.app, context, (instruction) => void this.fireCloudSession(instruction, context)).open();
  }

  private async fireCloudSession(instruction: string, context?: string): Promise<void> {
    const pending = new Notice("Dispatching cloud session…", 0);
    try {
      const req = buildFireRequest(this.cloudConfig(), composeDispatchText(instruction, context));
      const res = await requestUrl({ url: req.url, method: req.method, headers: req.headers, body: req.body, throw: false });
      const result = parseFireResponse(res.status, res.text);
      pending.hide();
      if (result.sessionUrl) {
        await navigator.clipboard.writeText(result.sessionUrl).catch(() => {});
        new Notice(`Cloud session started — link copied to clipboard:\n${result.sessionUrl}`, 12000);
      } else {
        new Notice("Cloud session fired. (No session link was returned.)", 8000);
      }
    } catch (e) {
      pending.hide();
      new Notice(`Cloud dispatch failed: ${e instanceof Error ? e.message : String(e)}`, 10000);
    }
  }

  private replyConfig(): RepliesConfig {
    return {
      repo: this.settings.cloudReplyRepo,
      branch: this.settings.cloudReplyBranch,
      folder: this.settings.cloudReplyFolder,
      token: this.settings.cloudReplyToken,
    };
  }

  /**
   * Fetch reply notes a cloud session wrote into the vault's GitHub repo and
   * land any new ones in the vault — over HTTPS, so it works on mobile. Existing
   * notes are left untouched (never clobbers local edits).
   */
  async pullCloudReplies(): Promise<void> {
    const cfg = this.replyConfig();
    const cfgErr = repliesConfigError(cfg);
    if (cfgErr) {
      new Notice(`Cloud replies not configured: ${cfgErr}`, 9000);
      return;
    }
    const pending = new Notice("Checking for cloud replies…", 0);
    try {
      const list = buildContentsRequest(cfg, cfg.folder);
      const listRes = await requestUrl({ url: list.url, method: list.method, headers: list.headers, throw: false });
      const files = parseDirListing(listRes.status, listRes.text).filter((f) => isMarkdown(f.name));
      let pulled = 0;
      for (const f of files) {
        if (this.app.vault.getAbstractFileByPath(normalizePath(f.path))) continue; // don't clobber local notes
        const fileReq = buildContentsRequest(cfg, f.path);
        const fileRes = await requestUrl({ url: fileReq.url, method: fileReq.method, headers: fileReq.headers, throw: false });
        const got = parseFileResponse(fileRes.status, fileRes.text);
        const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
        if (dir) await this.ensureFolder(dir);
        await this.app.vault.create(normalizePath(f.path), got.text);
        pulled++;
      }
      pending.hide();
      new Notice(pulled > 0 ? `Pulled ${pulled} cloud repl${pulled === 1 ? "y" : "ies"} into the vault.` : "No new cloud replies.", 7000);
    } catch (e) {
      pending.hide();
      new Notice(`Couldn't pull cloud replies: ${e instanceof Error ? e.message : String(e)}`, 10000);
    }
  }

  async generateArtifactFromContext(): Promise<void> {
    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const hasSelection = !!mdView?.editor.getSelection().trim();
    this.settings.context.activeNote = true;
    this.settings.context.selection = true;
    await this.saveSettings();
    const view = await this.activateView();
    if (!view) return;
    const target = hasSelection ? "the selected text" : "my current note";
    await view.submitPrompt(`Turn ${target} into a single beautiful, self-contained interactive artifact (a \`\`\`claude-html block) using the design system. Choose the best format (plan, report, table, diagram, or dashboard) for the content.`);
  }
}

/** Minimal prompt for what a dispatched cloud session should do. */
class CloudDispatchModal extends Modal {
  private value = "";

  constructor(
    app: App,
    private context: string | undefined,
    private onSubmit: (instruction: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Send to cloud Claude session" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Fires your Claude Code routine in the cloud against your vault's repo. What should it do?",
    });
    if (this.context) {
      contentEl.createEl("p", { cls: "setting-item-description", text: `Attaching — ${this.context.split("\n")[0]}` });
    }

    const ta = contentEl.createEl("textarea");
    ta.rows = 5;
    ta.style.width = "100%";
    ta.placeholder = "e.g. Summarize this week's meeting notes into a decisions log and open a PR.";
    ta.addEventListener("input", () => (this.value = ta.value));
    window.setTimeout(() => ta.focus(), 0);

    const controls = contentEl.createDiv({ cls: "modal-button-container" });
    const send = controls.createEl("button", { text: "Dispatch", cls: "mod-cta" });
    send.addEventListener("click", () => {
      const v = this.value.trim();
      if (!v) {
        new Notice("Type what the cloud session should do.");
        return;
      }
      this.close();
      this.onSubmit(v);
    });
    controls.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
