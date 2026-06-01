import { ItemView, MarkdownRenderer, MarkdownView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type ClaudeCompanionPlugin from "../main";
import type { ChatMessage } from "../types";
import type { Conversation } from "../conversations/store";
import { ConversationPicker } from "./ConversationPicker";
import { modelLabel, CLAUDE_MODELS, resolveModelId } from "../claude/models";
import { capabilitiesFor, effortLevels } from "../claude/capabilities";
import { type ChatControls, defaultChatControls, shapeRequest } from "../claude/chatControls";
import { shouldFallbackToLocal, fallbackReason } from "../providers/fallback";
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
  private backendPillEl!: HTMLElement;
  private usageEl!: HTMLElement;
  private gaugeFillEl!: HTMLElement;
  private streaming = false;
  private abort: AbortController | null = null;
  private session: SessionUsage = { ...EMPTY_SESSION };
  /** Per-session chat controls (model, thinking, effort, temp, max). */
  private controls!: ChatControls;
  private controlsEl!: HTMLElement;
  /** Latest streamed text of the in-flight turn (for clean abort handling). */
  private _lastBuffer = "";

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
    return "Companion for Claude";
  }
  getIcon(): string {
    return "sparkles";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("cc-root");

    // Initialize per-session controls from the settings default model.
    if (!this.controls) {
      this.controls = defaultChatControls(resolveModelId(this.plugin.settings.model, this.plugin.settings.customModel));
    }

    // ---- header ----
    const header = root.createDiv({ cls: "cc-header" });
    const title = header.createDiv({ cls: "cc-title" });
    title.createSpan({ cls: "cc-eyebrow", text: "COMPANION FOR CLAUDE" });
    this.modelLabelEl = title.createSpan({ cls: "cc-model" });
    this.backendPillEl = title.createSpan({ cls: "cc-backend-pill", attr: { "aria-label": "Chat backend / connectivity" } });
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

    // ---- chat controls (model switcher, thinking, effort, temp, max) ----
    this.controlsEl = root.createDiv({ cls: "cc-controls" });
    this.renderControls();

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
    void this.refreshBackendPill();
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
    const { provider } = this.plugin.router().chatProvider();
    const model = provider.id === "ollama" ? this.plugin.settings.ollamaModel : this.controls?.model ?? this.plugin.settings.model;
    const reserved = this.controls?.maxTokens ?? this.plugin.settings.maxTokens;

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
      // OAuth subscription tokens don't bill per-token, so show token totals
      // without a dollar estimate; API-key usage shows the estimated cost.
      const oauth = "isOAuth" in provider && (provider as { isOAuth(): boolean }).isOAuth();
      if (this.session.requests > 0) {
        const totals = `session ${formatTokens(this.session.inputTokens)}↑ ${formatTokens(this.session.outputTokens)}↓`;
        parts.push(oauth ? `${totals} · subscription` : `${totals} ≈ ${formatCost(sessionCost(this.session, model))}`);
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
    const { provider } = this.plugin.router().chatProvider();
    const model = provider.id === "ollama" ? this.plugin.settings.ollamaModel : this.controls?.model ?? this.plugin.settings.model;
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

  /**
   * Render the per-message control row. The visible knobs adapt to the selected
   * model's capabilities, so a control that the model would 400 on is hidden
   * rather than shown-and-broken. Ollama (local) sessions show no Claude knobs.
   */
  private renderControls(): void {
    this.controlsEl.empty();
    const onOllama = this.plugin.router().chatProvider().provider.id === "ollama";

    // --- model switcher ---
    const modelWrap = this.controlsEl.createDiv({ cls: "cc-ctl cc-ctl-model" });
    const select = modelWrap.createEl("select", { cls: "cc-ctl-select", attr: { "aria-label": "Model" } });
    const ids = new Set(CLAUDE_MODELS.map((m) => m.id));
    for (const m of CLAUDE_MODELS) select.createEl("option", { value: m.id, text: m.label });
    // Keep a custom / settings model selectable even if not in the curated list.
    if (!ids.has(this.controls.model)) select.createEl("option", { value: this.controls.model, text: this.controls.model });
    select.value = this.controls.model;
    select.addEventListener("change", () => {
      this.controls.model = select.value;
      this.renderControls(); // capabilities changed → re-render the knobs
      this.refreshModelLabel();
      this.updateUsageBar();
    });

    if (onOllama) {
      this.controlsEl.createSpan({ cls: "cc-ctl-note", text: "local model · Claude controls apply when routed to Claude" });
      return;
    }

    const caps = capabilitiesFor(this.controls.model);

    // --- thinking toggle ---
    if (caps.thinking !== "none") {
      const think = this.controlsEl.createEl("button", { cls: "cc-ctl cc-ctl-toggle", text: "Think" });
      think.toggleClass("is-active", this.controls.thinking);
      think.setAttribute("aria-label", "Extended thinking");
      think.addEventListener("click", () => {
        this.controls.thinking = !this.controls.thinking;
        this.renderControls(); // effort/show-thinking visibility depends on this
        this.updateUsageBar();
      });

      // --- effort dial (only when supported AND thinking is on) ---
      if (caps.effort && this.controls.thinking) {
        const eff = this.controlsEl.createEl("select", { cls: "cc-ctl cc-ctl-select", attr: { "aria-label": "Effort" } });
        for (const level of effortLevels(caps)) eff.createEl("option", { value: level, text: `effort: ${level}` });
        if (!effortLevels(caps).includes(this.controls.effort)) this.controls.effort = "high";
        eff.value = this.controls.effort;
        eff.addEventListener("change", () => {
          this.controls.effort = eff.value;
        });
      }

      // --- show-thinking toggle (adaptive models, when thinking is on) ---
      if (caps.thinking === "adaptive" && this.controls.thinking) {
        const show = this.controlsEl.createEl("button", { cls: "cc-ctl cc-ctl-toggle", text: "Show reasoning" });
        show.toggleClass("is-active", this.controls.showThinking);
        show.addEventListener("click", () => {
          this.controls.showThinking = !this.controls.showThinking;
          show.toggleClass("is-active", this.controls.showThinking);
        });
      }
    }

    // --- temperature (only when the model accepts it and thinking is off) ---
    if (caps.temperature && !this.controls.thinking) {
      const tempWrap = this.controlsEl.createDiv({ cls: "cc-ctl cc-ctl-temp" });
      tempWrap.createSpan({ cls: "cc-ctl-label", text: "temp" });
      const temp = tempWrap.createEl("input", {
        cls: "cc-ctl-range",
        attr: { type: "range", min: "0", max: "1", step: "0.1", "aria-label": "Temperature" },
      });
      const out = tempWrap.createSpan({ cls: "cc-ctl-val" });
      const sync = () => out.setText(this.controls.temperature === null ? "auto" : this.controls.temperature.toFixed(1));
      temp.value = String(this.controls.temperature ?? 0.7);
      sync();
      temp.addEventListener("input", () => {
        this.controls.temperature = parseFloat(temp.value);
        sync();
      });
      // Double-click resets to model default ("auto").
      tempWrap.addEventListener("dblclick", () => {
        this.controls.temperature = null;
        sync();
      });
    }

    // --- per-message max tokens ---
    const maxWrap = this.controlsEl.createDiv({ cls: "cc-ctl cc-ctl-max" });
    maxWrap.createSpan({ cls: "cc-ctl-label", text: "max" });
    const maxIn = maxWrap.createEl("input", {
      cls: "cc-ctl-num",
      attr: { type: "number", min: "1", placeholder: String(this.plugin.settings.maxTokens), "aria-label": "Max output tokens" },
    });
    if (this.controls.maxTokens) maxIn.value = String(this.controls.maxTokens);
    maxIn.addEventListener("change", () => {
      const n = parseInt(maxIn.value, 10);
      this.controls.maxTokens = Number.isFinite(n) && n > 0 ? n : null;
      this.updateUsageBar();
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
    const router = this.plugin.router();
    const { provider } = router.chatProvider();
    const backend = router.chatBackend;
    if (!provider.hasCredentials() && backend !== "auto") {
      const where = provider.id === "ollama" ? "Start Ollama (`ollama serve`) or set the host in settings." : "Add your Anthropic credential in Claude Companion settings first.";
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

    const { bubble, body } = this.createAssistantBubble();
    this.setSending(true);
    this.abort = new AbortController();

    // Attempt #1 on the primary backend (Claude unless backend is "local").
    const startedOnLocal = provider.id === "ollama";
    const err1 = await this.streamTurn(startedOnLocal ? "local" : "claude", apiMessages, bubble, body);

    // Fallback: if Claude failed with an offline/usage error and a local model is
    // available, retry transparently so you keep working with no internet/tokens.
    if (err1) {
      const localOk = await router.localAvailable();
      const doFallback = shouldFallbackToLocal({ backend, localAvailable: localOk, error: err1 });
      if (doFallback) {
        this.annotateFallback(bubble, fallbackReason(err1));
        const err2 = await this.streamTurn("local", apiMessages, bubble, body);
        if (err2) {
          this.renderError(body, err2.message ?? String(err2));
          this.finishAssistant(null, bubble);
        }
      } else {
        this.renderError(body, err1.message ?? String(err1));
        this.finishAssistant(null, bubble);
      }
    }

    // If a stream ended without onDone (aborted), still close out.
    if (this.streaming) this.finishAssistant(this._lastBuffer || null, bubble);
  }

  /**
   * Run one streaming attempt on a backend. Resolves to the error if it failed
   * (for the fallback decision), or null on success (onDone fired). The answer
   * and reasoning render into the passed bubble/body.
   */
  private streamTurn(
    target: "claude" | "local",
    apiMessages: ChatMessage[],
    bubble: HTMLElement,
    body: HTMLElement,
  ): Promise<{ message?: string; status?: number } | null> {
    const router = this.plugin.router();
    const onClaude = target === "claude";
    const provider = onClaude ? router.anthropic : router.ollama;
    const model = onClaude ? this.controls.model : this.plugin.settings.ollamaModel;
    const shape = shapeRequest({ ...this.controls, model: onClaude ? model : this.controls.model }, this.plugin.settings.maxTokens);
    const wantThinking = onClaude && this.controls.thinking && this.controls.showThinking;
    let thinkingBody: HTMLElement | null = wantThinking ? this.createThinkingPanel(bubble) : null;

    let buffer = "";
    let thinkBuf = "";
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      void this.renderMarkdownInto(body, buffer);
      this.scrollToBottom();
    };

    return new Promise((resolve) => {
      let settled = false;
      void provider.stream(
        {
          system: this.plugin.composeSystemPrompt(),
          messages: apiMessages,
          model,
          maxTokens: shape.maxTokens,
          temperature: onClaude ? shape.temperature : undefined,
          thinking: onClaude ? shape.thinking : undefined,
          thinkingDisplay: onClaude ? shape.thinkingDisplay : undefined,
          outputConfig: onClaude ? shape.outputConfig : undefined,
          signal: this.abort?.signal,
        },
        {
          onThinking: (delta) => {
            if (!thinkingBody) thinkingBody = this.createThinkingPanel(bubble);
            thinkBuf += delta;
            thinkingBody.setText(thinkBuf);
            this.scrollToBottom();
          },
          onText: (delta) => {
            buffer += delta;
            this._lastBuffer = buffer;
            if (!scheduled) {
              scheduled = true;
              window.requestAnimationFrame(flush);
            }
          },
          onError: (err) => {
            if (settled) return;
            settled = true;
            resolve({ message: err.message, status: (err as { status?: number }).status });
          },
          onUsage: (usage) => {
            this.session = addUsage(this.session, usage);
          },
          onDone: (full) => {
            if (settled) return;
            settled = true;
            buffer = full;
            this._lastBuffer = full;
            void this.renderMarkdownInto(body, full).then(() => this.finishAssistant(full, bubble));
            resolve(null);
          },
        },
      ).then(() => {
        // stream() resolved without onError/onDone (e.g. aborted) — not an error.
        if (!settled) {
          settled = true;
          resolve(null);
        }
      });
    });
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

  /**
   * Update the header backend pill: shows the active mode and, for auto/local,
   * whether a local model is reachable (so you can see your offline safety net
   * at a glance). Best-effort and never throws.
   */
  async refreshBackendPill(): Promise<void> {
    if (!this.backendPillEl) return;
    const router = this.plugin.router();
    const backend = router.chatBackend;
    const el = this.backendPillEl;
    el.removeClass("is-ok", "is-warn");
    if (backend === "claude") {
      el.setText("");
      el.toggleClass("is-ok", false);
      return;
    }
    const localOk = await router.localAvailable();
    if (backend === "local") {
      el.setText(localOk ? "● local" : "● local offline");
      el.toggleClass("is-ok", localOk);
      el.toggleClass("is-warn", !localOk);
    } else {
      // auto
      el.setText(localOk ? "● auto · local ready" : "● auto · no local");
      el.toggleClass("is-ok", localOk);
      el.toggleClass("is-warn", !localOk);
    }
  }

  /** Note in the assistant bubble that we fell back to the local model. */
  private annotateFallback(bubble: HTMLElement, reason: string): void {
    bubble.createDiv({
      cls: "cc-fallback-note",
      text: `${reason} — answered locally with ${this.plugin.settings.ollamaModel}.`,
    });
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
