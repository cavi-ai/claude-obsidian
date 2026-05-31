import { ItemView, MarkdownRenderer, MarkdownView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type ClaudeCompanionPlugin from "../main";
import type { ChatMessage } from "../types";
import type { Conversation } from "../conversations/store";
import { ConversationPicker } from "./ConversationPicker";
import { modelLabel } from "../claude/models";
import { gatherContext } from "../context/vaultContext";
import { extractArtifact, saveArtifactNote, saveChatNote } from "../artifacts/artifactStore";
import { errorHint } from "../providers/errorHints";
import { addUsage, contextGauge, EMPTY_SESSION, estimateTokens, formatCost, formatTokens, sessionCost, type SessionUsage } from "../usage/tokens";

export const CHAT_VIEW_TYPE = "claude-companion-chat";

export class ChatView extends ItemView {
  private messages: ChatMessage[] = [];
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private modelLabelEl!: HTMLElement;
  private usageEl!: HTMLElement;
  private gaugeFillEl!: HTMLElement;
  private streaming = false;
  private abort: AbortController | null = null;
  private session: SessionUsage = { ...EMPTY_SESSION };

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: ClaudeCompanionPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return CHAT_VIEW_TYPE;
  }
  getDisplayText(): string {
    return "Claude Companion";
  }
  getIcon(): string {
    return "sparkles";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("cc-root");

    // ---- header ----
    const header = root.createDiv({ cls: "cc-header" });
    const title = header.createDiv({ cls: "cc-title" });
    title.createSpan({ cls: "cc-eyebrow", text: "CLAUDE COMPANION" });
    this.modelLabelEl = title.createSpan({ cls: "cc-model" });
    const actions = header.createDiv({ cls: "cc-header-actions" });
    this.iconButton(actions, "plus", "New chat", () => this.clearChat());
    this.iconButton(actions, "history", "Resume a past conversation", () => this.openHistory());
    this.iconButton(actions, "save", "Save chat to vault", () => this.saveChat());
    this.iconButton(actions, "settings", "Open settings", () => this.openSettings());

    // ---- context chips ----
    const chips = root.createDiv({ cls: "cc-chips" });
    this.contextChip(chips, "Note", "activeNote");
    this.contextChip(chips, "Selection", "selection");
    this.contextChip(chips, "Links", "linkedNotes");
    this.contextChip(chips, "Search vault", "searchVault");

    // ---- messages ----
    this.messagesEl = root.createDiv({ cls: "cc-messages" });

    // ---- composer ----
    const composer = root.createDiv({ cls: "cc-composer" });
    this.inputEl = composer.createEl("textarea", {
      cls: "cc-input",
      attr: { placeholder: "Ask Claude…  (Enter to send, Shift+Enter for newline)", rows: "3" },
    });
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.onSend();
      }
    });
    this.inputEl.addEventListener("input", () => this.updateUsageBar());

    // ---- usage bar: context gauge + session totals ----
    const usageRow = composer.createDiv({ cls: "cc-usage" });
    const gauge = usageRow.createDiv({ cls: "cc-gauge", attr: { "aria-label": "Estimated context window used" } });
    this.gaugeFillEl = gauge.createDiv({ cls: "cc-gauge-fill" });
    this.usageEl = usageRow.createDiv({ cls: "cc-usage-text" });

    const sendRow = composer.createDiv({ cls: "cc-send-row" });
    this.sendBtn = sendRow.createEl("button", { cls: "cc-send", text: "Send" });
    this.sendBtn.addEventListener("click", () => this.onSend());

    this.refreshModelLabel();
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
    this.abort?.abort();
    this.streaming = false;
    this.setSending(false);
    this.session = { ...EMPTY_SESSION };
    this.messages = conversation.messages.map((m) => ({ ...m }));
    this.messagesEl.empty();
    if (this.messages.length === 0) {
      this.renderEmptyState();
    } else {
      for (const m of this.messages) this.renderStoredMessage(m);
    }
    this.updateUsageBar();
    this.scrollToBottom();
  }

  /** Render one persisted message, including assistant action buttons. */
  private renderStoredMessage(m: ChatMessage): void {
    const bubble = this.messagesEl.createDiv({ cls: `cc-msg cc-${m.role}` });
    bubble.createDiv({ cls: "cc-role", text: m.role === "user" ? "You" : "Claude" });
    const body = bubble.createDiv({ cls: "cc-body" });
    void this.renderMarkdownInto(body, m.content);
    if (m.role === "assistant" && m.content.trim().length > 0) this.addAssistantActions(bubble, m.content);
  }

  /** Clear the panel to its empty state without altering stored history. */
  resetToEmpty(): void {
    this.abort?.abort();
    this.streaming = false;
    this.setSending(false);
    this.messages = [];
    this.session = { ...EMPTY_SESSION };
    this.messagesEl.empty();
    this.renderEmptyState();
    this.updateUsageBar();
  }

  openHistory(): void {
    const conversations = this.plugin.listConversations();
    if (conversations.length === 0) {
      new Notice("No saved conversations yet.");
      return;
    }
    new ConversationPicker(this.app, conversations, (chosen) => {
      void this.plugin.setActiveConversation(chosen.id).then((c) => {
        if (c) this.loadConversation(c);
      });
    }).open();
  }

  /**
   * Recompute the context gauge (estimated input + reserved output vs the
   * model's window) and render the running session totals. Called on input,
   * after each response, and when the model changes.
   */
  private updateUsageBar(): void {
    const { provider, model } = this.plugin.router().chatProvider();
    const reserved = this.plugin.settings.maxTokens;

    // Estimate input tokens: system + conversation so far + the draft + a
    // rough allowance for the vault context that will be attached.
    const convo = this.messages.map((m) => m.content).join("\n");
    const draft = this.inputEl?.value ?? "";
    const ctxAllowance = this.anyContextEnabled() ? this.plugin.settings.contextCharBudget : 0;
    const estIn = estimateTokens(this.plugin.composeSystemPrompt()) + estimateTokens(convo) + estimateTokens(draft) + estimateTokens("x".repeat(ctxAllowance));

    const g = contextGauge(estIn, model, reserved);
    this.gaugeFillEl.style.width = `${Math.round(g.fraction * 100)}%`;
    this.gaugeFillEl.toggleClass("is-warn", g.fraction >= 0.75 && g.fraction < 0.92);
    this.gaugeFillEl.toggleClass("is-danger", g.fraction >= 0.92);

    const parts: string[] = [];
    if (provider.id === "ollama") {
      parts.push(`~${formatTokens(estIn)} ctx · local (no metered cost)`);
    } else {
      parts.push(`~${formatTokens(estIn)} / ${formatTokens(g.window)} ctx`);
      if (this.session.requests > 0) {
        parts.push(`session ${formatTokens(this.session.inputTokens)}↑ ${formatTokens(this.session.outputTokens)}↓ ≈ ${formatCost(sessionCost(this.session, model))}`);
      }
    }
    this.usageEl.setText(parts.join("  ·  "));
  }

  private anyContextEnabled(): boolean {
    const c = this.plugin.settings.context;
    return c.activeNote || c.selection || c.linkedNotes || c.searchVault;
  }

  async onClose(): Promise<void> {
    this.abort?.abort();
  }

  refreshModelLabel(): void {
    const { provider, model } = this.plugin.router().chatProvider();
    const label = provider.id === "ollama" ? `${model} · local` : modelLabel(model);
    this.modelLabelEl.setText(label);
    if (this.usageEl) this.updateUsageBar();
  }

  // ---------- public entry point (used by commands) ----------

  async submitPrompt(text: string): Promise<void> {
    if (!text.trim() || this.streaming) return;
    this.inputEl.value = "";
    await this.run(text.trim());
  }

  // ---------- UI helpers ----------

  private iconButton(parent: HTMLElement, icon: string, tip: string, onClick: () => void): void {
    const btn = parent.createEl("button", { cls: "cc-icon-btn", attr: { "aria-label": tip } });
    setIcon(btn, icon);
    btn.addEventListener("click", onClick);
  }

  private contextChip(parent: HTMLElement, label: string, key: keyof typeof this.plugin.settings.context): void {
    const chip = parent.createEl("button", { cls: "cc-chip", text: label });
    const sync = () => chip.toggleClass("is-active", this.plugin.settings.context[key]);
    sync();
    chip.addEventListener("click", async () => {
      this.plugin.settings.context[key] = !this.plugin.settings.context[key];
      await this.plugin.saveSettings();
      sync();
    });
  }

  private renderEmptyState(): void {
    if (this.messages.length > 0) return;
    this.messagesEl.empty();
    const empty = this.messagesEl.createDiv({ cls: "cc-empty" });
    empty.createDiv({ cls: "cc-empty-title", text: "Claude, in your vault." });
    empty.createDiv({
      cls: "cc-empty-sub",
      text: "Ask a question, plan a feature, or turn a note into a beautiful artifact. Toggle the chips above to give Claude context from your notes.",
    });
  }

  clearChat(): void {
    this.abort?.abort();
    this.streaming = false;
    this.messages = [];
    this.session = { ...EMPTY_SESSION };
    // The previous conversation is already auto-saved; detach so the next turn
    // begins a fresh session.
    void this.plugin.startNewConversation();
    this.messagesEl.empty();
    this.renderEmptyState();
    this.setSending(false);
    this.updateUsageBar();
  }

  private openSettings(): void {
    // @ts-expect-error – setting is available on the app at runtime
    this.app.setting?.open?.();
    // @ts-expect-error – open the plugin's tab if possible
    this.app.setting?.openTabById?.("claude-companion");
  }

  // ---------- send / stream ----------

  private async onSend(): Promise<void> {
    if (this.streaming) {
      this.abort?.abort();
      return;
    }
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.inputEl.value = "";
    await this.run(text);
  }

  private setSending(sending: boolean): void {
    this.streaming = sending;
    this.sendBtn.setText(sending ? "Stop" : "Send");
    this.sendBtn.toggleClass("is-stop", sending);
  }

  private async run(userText: string): Promise<void> {
    const { provider, model } = this.plugin.router().chatProvider();
    if (!provider.hasCredentials()) {
      const where = provider.id === "ollama" ? "Start Ollama (`ollama serve`) or set the host in settings." : "Add your Anthropic API key in Claude Companion settings first.";
      new Notice(where);
      return;
    }

    this.messages.push({ role: "user", content: userText });
    this.renderMessage("user", userText);

    // Build context-augmented copy of the message list for the API.
    const ctx = await gatherContext(this.app, this.plugin.settings, this.plugin.settings.context, userText);
    const apiMessages: ChatMessage[] = this.messages.map((m) => ({ ...m }));
    if (ctx.text) {
      const last = apiMessages[apiMessages.length - 1];
      last.content = `${ctx.text}\n\n---\n\n${last.content}`;
      this.annotateContext(ctx.sources);
    }

    // Prepare the assistant bubble.
    const { bubble, body } = this.createAssistantBubble();
    this.setSending(true);
    this.abort = new AbortController();

    let buffer = "";
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      void this.renderMarkdownInto(body, buffer);
      this.scrollToBottom();
    };

    await provider.stream(
      {
        system: this.plugin.composeSystemPrompt(),
        messages: apiMessages,
        model,
        maxTokens: this.plugin.settings.maxTokens,
        signal: this.abort.signal,
      },
      {
        onText: (delta) => {
          buffer += delta;
          if (!scheduled) {
            scheduled = true;
            window.requestAnimationFrame(flush);
          }
        },
        onError: (err) => {
          this.renderError(body, err.message);
          this.finishAssistant(null, bubble);
        },
        onUsage: (usage) => {
          this.session = addUsage(this.session, usage);
        },
        onDone: (full) => {
          buffer = full;
          void this.renderMarkdownInto(body, full).then(() => this.finishAssistant(full, bubble));
        },
      },
    );

    // If the stream ended without onDone (aborted), still close out.
    if (this.streaming) this.finishAssistant(buffer || null, bubble);
  }

  private finishAssistant(full: string | null, bubble: HTMLElement): void {
    this.setSending(false);
    this.abort = null;
    if (full && full.trim().length > 0) {
      this.messages.push({ role: "assistant", content: full });
      this.addAssistantActions(bubble, full);
    }
    // Persist the turn so the conversation survives a restart (best-effort).
    void this.plugin.saveActiveConversation(this.messages);
    this.updateUsageBar();
    this.scrollToBottom();
  }

  // ---------- rendering ----------

  private createAssistantBubble(): { bubble: HTMLElement; body: HTMLElement } {
    const bubble = this.messagesEl.createDiv({ cls: "cc-msg cc-assistant" });
    bubble.createDiv({ cls: "cc-role", text: "Claude" });
    const body = bubble.createDiv({ cls: "cc-body" });
    body.createSpan({ cls: "cc-cursor", text: "▍" });
    this.scrollToBottom();
    return { bubble, body };
  }

  private renderMessage(role: "user" | "assistant", text: string): void {
    if (this.messages.length === 1) this.messagesEl.empty();
    const bubble = this.messagesEl.createDiv({ cls: `cc-msg cc-${role}` });
    bubble.createDiv({ cls: "cc-role", text: role === "user" ? "You" : "Claude" });
    const body = bubble.createDiv({ cls: "cc-body" });
    void this.renderMarkdownInto(body, text);
    this.scrollToBottom();
  }

  private renderError(body: HTMLElement, message: string): void {
    body.empty();
    const box = body.createDiv({ cls: "cc-error" });
    box.createSpan({ cls: "cc-error-title", text: "Couldn’t reach the model" });
    box.createSpan({ text: message });
    const hint = errorHint(message);
    if (hint) box.createDiv({ cls: "cc-error-hint", text: hint });
  }

  private annotateContext(sources: string[]): void {
    if (sources.length === 0) return;
    const last = this.messagesEl.lastElementChild;
    if (!last) return;
    last.createDiv({ cls: "cc-context-note", text: `+ context: ${sources.join(", ")}` });
  }

  private async renderMarkdownInto(el: HTMLElement, markdown: string): Promise<void> {
    el.empty();
    await MarkdownRenderer.render(this.app, markdown, el, this.app.workspace.getActiveFile()?.path ?? "", this);
  }

  private addAssistantActions(bubble: HTMLElement, full: string): void {
    const bar = bubble.createDiv({ cls: "cc-actions" });
    this.actionBtn(bar, "Copy", () => {
      void navigator.clipboard.writeText(full);
      new Notice("Copied to clipboard");
    });
    this.actionBtn(bar, "Insert", () => this.insertIntoNote(full));
    this.actionBtn(bar, "Save as note", async () => {
      const title = full.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").slice(0, 60) ?? "Claude reply";
      const extraTags = await this.maybeAutoTags(full);
      await saveChatNote(this.app, this.plugin.settings.chatFolder, title, full, { baseTags: this.plugin.settings.chatBaseTags, extraTags });
    });
    const artifact = extractArtifact(full);
    if (artifact) {
      const btn = this.actionBtn(bar, "Save artifact", async () => {
        const extraTags = await this.maybeAutoTags(`${artifact.title}\n\n${full}`);
        const file = await saveArtifactNote(this.app, this.plugin.settings.artifactFolder, artifact, {
          height: this.plugin.settings.artifactHeight,
          baseTags: this.plugin.settings.artifactBaseTags,
          extraTags,
        });
        await this.app.workspace.getLeaf(true).openFile(file);
      });
      btn.addClass("cc-accent");
    }
  }

  /** Generate tags via the utility provider when auto-tagging is on. */
  private async maybeAutoTags(content: string): Promise<string[]> {
    if (!this.plugin.settings.autoTagOnSave) return [];
    try {
      const { summarizeAndTag, existingVaultTags } = await import("../indexing/autoTagger");
      const res = await summarizeAndTag(this.app, this.plugin.router(), content, existingVaultTags(this.app));
      return res.tags;
    } catch {
      return []; // tagging is best-effort; never block a save
    }
  }

  private actionBtn(bar: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
    const btn = bar.createEl("button", { cls: "cc-action", text: label });
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
    new Notice("Inserted into note");
  }

  private async saveChat(): Promise<void> {
    if (this.messages.length === 0) {
      new Notice("Nothing to save yet.");
      return;
    }
    const md = this.messages.map((m) => `**${m.role === "user" ? "You" : "Claude"}:**\n\n${m.content}`).join("\n\n---\n\n");
    const title = this.messages[0].content.split("\n")[0].slice(0, 60) || "Claude chat";
    const extraTags = await this.maybeAutoTags(md);
    await saveChatNote(this.app, this.plugin.settings.chatFolder, title, md, { baseTags: this.plugin.settings.chatBaseTags, extraTags });
  }

  private scrollToBottom(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
}
