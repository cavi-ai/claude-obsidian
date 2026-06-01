import { MarkdownView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { ChatView, CHAT_VIEW_TYPE } from "./view/ChatView";
import { ClaudeCompanionSettingTab } from "./settings";
import { ProviderRouter } from "./providers/router";
import { DEFAULT_SETTINGS, type PluginSettings } from "./types";
import { DESIGN_SYSTEM_PROMPT, PLANNING_INSTRUCTION } from "./artifacts/designSystem";
import { renderArtifactInline } from "./artifacts/renderInline";
import { McpHttpServer } from "./mcp/server";
import { VaultTools } from "./mcp/vaultTools";
import { extractTasks, specBody, claudeCodeBuildCommand, type SpecInput } from "./build/spec";
import { trackerArtifact } from "./build/tracker";
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

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(CHAT_VIEW_TYPE, (leaf: WorkspaceLeaf) => new ChatView(leaf, this));

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

  private async deleteActiveConversation(): Promise<void> {
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

  /** Start, stop, or restart the MCP server to match current settings. */
  async syncMcpServer(): Promise<void> {
    const s = this.settings;
    // Always tear down so a port/token/writes change takes effect cleanly.
    if (this.mcpServer) {
      await this.mcpServer.stop();
      this.mcpServer = null;
    }
    if (!s.mcpEnabled) return;

    if (!this.vaultTools) {
      this.vaultTools = new VaultTools(this.app, { allowWrites: s.mcpAllowWrites, defaultFolder: s.mcpWriteFolder });
    } else {
      this.vaultTools.setOptions({ allowWrites: s.mcpAllowWrites, defaultFolder: s.mcpWriteFolder });
    }

    const server = new McpHttpServer(
      { port: s.mcpPort, token: s.mcpToken, serverInfo: { name: "obsidian-vault", version: "0.2.0" } },
      this.vaultTools,
      (level, message) => (level === "error" ? console.error("[Claude Companion MCP]", message) : console.log("[Claude Companion MCP]", message)),
    );
    try {
      await server.start();
      this.mcpServer = server;
    } catch (e) {
      new Notice(`MCP bridge failed to start on port ${s.mcpPort}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  mcpRunning(): boolean {
    return this.mcpServer?.isRunning() ?? false;
  }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)) {
      const v = leaf.view;
      if (v instanceof ChatView) {
        v.refreshModelLabel();
        void v.refreshBackendPill();
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
