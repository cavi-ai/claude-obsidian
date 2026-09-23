import { Platform, setIcon } from "obsidian";
import type { SlashCommand } from "../slashCommands";
import { SlashMenu } from "../SlashMenu";
import { AtMenu } from "../AtMenu";
import type { AtItem } from "../../context/atMention";
import { ComposerContextManager } from "../ComposerContextManager";
import type { AutomaticContextKey } from "../contextManagerModel";
import type { ModeControl } from "../ModeControl";
import type { AttachedPath } from "../../context/vaultContext";
import type { MediaAttachment } from "../../context/attachments";
import type { AttachedPage } from "../../context/urlContext";
import type { HeaderControls } from "./HeaderControls";

export interface ComposerCallbacks {
  onSlashCommand: (cmd: SlashCommand) => void;
  pickAtItems: () => AtItem[];
  onAtChoose: (item: AtItem) => void;
  toggleAutomatic: (key: AutomaticContextKey, enabled: boolean) => void;
  removeSource: (id: string) => void;
  retrySource: (id: string) => void;
  addContext: () => void;
  onSend: () => void;
  autosizeInput: () => void;
  updateUsageBar: () => void;
  syncSlashMenu: () => void;
  syncAtMenu: () => void;
  syncPageOffer: () => void;
  attachPastedImage: (file: File) => void;
  renderControls: () => void;
}

/** The composer: input, @/slash menus, attachments/context manager, quick options, submit. */
export class Composer {
  el!: HTMLElement;
  inputEl!: HTMLTextAreaElement;
  sendBtn!: HTMLButtonElement;
  atMenu!: AtMenu;
  slashMenu!: SlashMenu;
  contextManager!: ComposerContextManager;
  controlsEl!: HTMLElement;
  knobsEl!: HTMLElement;
  reasoningEl: HTMLButtonElement | null = null;
  modeControl: ModeControl | null = null;
  pageOfferEl!: HTMLElement;
  /** URL the user declined to attach — don't re-offer while it stays in the input. */
  dismissedPageUrl: string | null = null;
  /** Notes/folders explicitly attached via "@" (session-scoped). */
  attachedPaths: AttachedPath[] = [];
  /** PDFs/images attached via "@" or paste — cleared after the next send. */
  attachedMedia: MediaAttachment[] = [];
  /** Web pages attached via "Attach page content" (captured markdown). */
  attachedPages: AttachedPage[] = [];
  /** Which trigger ("@" or "#") the open at-menu is currently showing matches for. */
  activeMenuTrigger: "@" | "#" = "@";
  /** Last visible context-manager state; skip DOM rebuilds when nothing changed. */
  lastContextManagerSignature = "";

  mount(
    root: HTMLElement,
    header: HeaderControls,
    slashCommands: SlashCommand[],
    cb: ComposerCallbacks,
  ): void {
    const composer = root.createDiv({ cls: "cc-composer" });
    this.el = composer;

    this.contextManager = new ComposerContextManager(composer, {
      toggleAutomatic: (key, enabled) => cb.toggleAutomatic(key, enabled),
      removeSource: (id) => cb.removeSource(id),
      retrySource: (id) => cb.retrySource(id),
      addContext: () => cb.addContext(),
    });
    // The "attach this page?" offer for URLs in the composer.
    this.pageOfferEl = composer.createDiv({ cls: "cc-page-offer" });
    this.pageOfferEl.setCssStyles({ display: "none" });

    // Palettes anchored above the input (built before the textarea so they sit
    // above it in flow; CSS positions them absolutely).
    // Slash is the single command surface: the built-in commands plus every vault
    // workflow (the browsable picker stays reachable via /workflows).
    this.slashMenu = new SlashMenu(composer, slashCommands, (cmd) => cb.onSlashCommand(cmd));
    this.atMenu = new AtMenu(composer, () => cb.pickAtItems(), (item) => cb.onAtChoose(item));

    // Mobile keeps the compact input row; the context manager above is the one
    // button-driven source entry point on every platform.
    const inputRow = Platform.isMobile ? composer.createDiv({ cls: "cc-composer-input-row" }) : composer;
    this.inputEl = inputRow.createEl("textarea", {
      cls: "cc-input",
      // Start compact on mobile (1 row, grows via autosizeInput) so the composer
      // doesn't eat a big band of the phone screen; roomier default on desktop.
      // The desktop placeholder spells out the /@ affordances, but that string
      // wraps to two cramped lines inside a one-row phone pill — mobile gets a
      // short placeholder (the "+" button already surfaces context on mobile).
      attr: {
        placeholder: Platform.isMobile
          ? "Message Claude…"
          : "Ask Claude…  ( / for commands · @ to add context · Enter to send )",
        rows: Platform.isMobile ? "1" : "3",
      },
    });
    this.inputEl.addEventListener("keydown", (e) => {
      // The "@" picker intercepts navigation keys while open.
      if (this.atMenu.isOpen()) {
        if (e.key === "ArrowDown") { e.preventDefault(); this.atMenu.move(1); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); this.atMenu.move(-1); return; }
        if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); this.atMenu.choose(); return; }
        if (e.key === "Escape") { e.preventDefault(); this.atMenu.hide(); return; }
      }
      // Slash menu intercepts navigation keys while open.
      if (this.slashMenu.isOpen()) {
        if (e.key === "ArrowDown") { e.preventDefault(); this.slashMenu.move(1); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); this.slashMenu.move(-1); return; }
        if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); this.slashMenu.choose(); return; }
        if (e.key === "Escape") { e.preventDefault(); this.slashMenu.hide(); return; }
      }
      // Desktop: Enter sends, Shift+Enter breaks a line. Mobile soft keyboards
      // have no Shift — Enter inserts a newline and only the send button sends.
      if (e.key === "Enter" && !e.shiftKey && !Platform.isMobile) {
        e.preventDefault();
        cb.onSend();
      }
    });
    this.inputEl.addEventListener("input", () => {
      cb.autosizeInput();
      cb.updateUsageBar();
      cb.syncSlashMenu();
      cb.syncAtMenu();
      cb.syncPageOffer();
    });
    // Close the menus when focus leaves the composer.
    this.inputEl.addEventListener("blur", () => window.setTimeout(() => { this.slashMenu.hide(); this.atMenu.hide(); }, 120));
    // Paste a screenshot/image straight into the composer to attach it.
    this.inputEl.addEventListener("paste", (evt: ClipboardEvent) => {
      const items = evt.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            evt.preventDefault();
            cb.attachPastedImage(file);
          }
          return;
        }
      }
    });

    // ---- composer bar: model + tune (left group) · usage + Send (right) ----
    // Desktop: one row under the input. Mobile: Send joins the thumb input row
    // ([+] · input · ↑); the bar keeps only the thin usage gauge (see styles).
    const bar = composer.createDiv({ cls: "cc-composer-bar" });
    this.controlsEl = bar.createDiv({ cls: "cc-controls" });
    cb.renderControls();

    const sendGroup = bar.createDiv({ cls: "cc-send-group" });
    const usageRow = sendGroup.createDiv({ cls: "cc-usage" });
    const gauge = usageRow.createDiv({ cls: "cc-gauge", attr: { "aria-label": "Estimated context window used" } });
    header.gaugeFillEl = gauge.createDiv({ cls: "cc-gauge-fill" });
    header.usageEl = usageRow.createDiv({ cls: "cc-usage-text" });
    const sendParent = Platform.isMobile ? inputRow : sendGroup;
    this.sendBtn = sendParent.createEl("button", {
      cls: Platform.isMobile ? "cc-send cc-send-icon" : "cc-send",
      ...(Platform.isMobile
        ? { attr: { "aria-label": "Send message" } }
        : { text: "Send" }),
    });
    if (Platform.isMobile) setIcon(this.sendBtn, "arrow-up");
    this.sendBtn.addEventListener("click", () => cb.onSend());
  }

  destroy(): void {
    this.contextManager?.destroy();
  }
}
