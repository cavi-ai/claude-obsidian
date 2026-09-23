import { Platform, setIcon } from "obsidian";
import type ClaudeCompanionPlugin from "../../main";
import { renderCompanionChrome } from "../companionChrome";

export interface HeaderControlsCallbacks {
  onModelClick: () => void;
  onMcpClick: (evt: MouseEvent) => void;
  onWriteGrantRevoke: () => void;
  onNewChat: () => void;
  onHistory: () => void;
  onOverflow: () => void;
}

/** The chat panel's header row: eyebrow/title, model chip, backend/write-grant pills, chrome-hosted actions. */
export class HeaderControls {
  modelLabelEl!: HTMLElement;
  /** Desktop only: the text span nested inside the cc-model chip (dot + text + chevron). */
  modelTextEl: HTMLElement | null = null;
  backendPillEl!: HTMLElement;
  writeGrantPillEl!: HTMLElement;
  mcpStatusEl!: HTMLButtonElement;
  usageEl!: HTMLElement;
  gaugeFillEl!: HTMLElement;
  private disposeChrome: ((remove?: boolean) => void) | null = null;

  /** Detach any chrome mounted by a previous mount() call. */
  teardown(remove?: boolean): void {
    this.disposeChrome?.(remove);
    this.disposeChrome = null;
  }

  mount(root: HTMLElement, plugin: ClaudeCompanionPlugin, cb: HeaderControlsCallbacks): void {
    const header = root.createDiv({ cls: "cc-header" });
    const title = header.createDiv({ cls: "cc-title" });
    title.createSpan({ cls: "cc-eyebrow", text: "COMPANION FOR CLAUDE" });
    this.modelLabelEl = title.createSpan({ cls: "cc-model" });
    this.backendPillEl = title.createSpan({ cls: "cc-backend-pill", attr: { "aria-label": "Chat backend / connectivity" } });
    this.writeGrantPillEl = title.createEl("button", {
      cls: "cc-write-grant-pill",
      text: "✎ writes auto-allowed",
      attr: { "aria-label": "Agent writes are auto-allowed for this session — click to revoke" },
    });
    this.writeGrantPillEl.addEventListener("click", () => cb.onWriteGrantRevoke());
    const actions = header.createDiv({ cls: "cc-header-actions" });
    if (Platform.isMobile) {
      // Mobile: the model name is the model picker, and one ⋯ menu carries the
      // actions the desktop icon row holds, plus the session toggles from the
      // hidden controls bar (Act on vault, Plan mode, memory ingest). Truly
      // desktop-only chrome (MCP, session capture) stays omitted.
      this.modelLabelEl.addClass("cc-model-tappable");
      this.modelLabelEl.addEventListener("click", () => cb.onModelClick());
      const more = actions.createEl("button", { cls: "cc-icon-btn clickable-icon", attr: { "aria-label": "More actions" } });
      setIcon(more, "more-vertical");
      more.addEventListener("click", () => cb.onOverflow());
      // Quick options reaches mobile through that one ⋯ menu; a second control on
      // a phone-width header is the crowding this row exists to avoid.
      this.disposeChrome = renderCompanionChrome(root, "chat", "Chat", plugin.companionChrome(), {
        host: actions,
        compact: true,
        omitOptionsButton: true,
      });
    } else {
      // Desktop: same pattern as mobile — the model name opens the model picker,
      // and one "More" button carries the rest (Save, capture, MCP bridge) so the
      // header stays a calm 3-icon row plus quick options.
      this.modelLabelEl.addClass("cc-model-tappable");
      this.modelLabelEl.addEventListener("click", () => cb.onModelClick());
      this.mcpStatusEl = this.modelLabelEl.createEl("button", { cls: "cc-mcp-dot", attr: { "aria-label": "MCP bridge controls" } });
      this.mcpStatusEl.addEventListener("click", (evt) => {
        evt.stopPropagation();
        cb.onMcpClick(evt);
      });
      this.modelTextEl = this.modelLabelEl.createSpan({ cls: "cc-model-text" });
      setIcon(this.modelLabelEl.createSpan({ cls: "cc-model-chevron" }), "chevron-down");

      const primary = actions.createDiv({ cls: "cc-header-actions-primary" });
      this.iconButton(primary, "plus", "New chat", () => cb.onNewChat());
      this.iconButton(primary, "history", "Resume a past conversation", () => cb.onHistory());
      this.iconButton(primary, "more-horizontal", "More actions", () => cb.onOverflow());
      // Quick options joins this row rather than owning a header of its own, and
      // replaces the gear: its own sheet already offers "Open all settings".
      this.disposeChrome = renderCompanionChrome(root, "chat", "Chat", plugin.companionChrome(), {
        host: primary,
        compact: true,
      });
    }
  }

  private iconButton(parent: HTMLElement, icon: string, tip: string, onClick: () => void): void {
    const btn = parent.createEl("button", { cls: "cc-icon-btn clickable-icon", attr: { "aria-label": tip } });
    setIcon(btn, icon);
    btn.addEventListener("click", onClick);
  }
}
