import { ItemView, WorkspaceLeaf, TFile, setIcon } from "obsidian";
import type ClaudeCompanionPlugin from "../main";
import { inboxItems, type InboxFileEntry, type InboxItem } from "../sources/inbox";
import { wireUpItems, type WireUpEntry } from "../links/wireUp";
import type { BatchLinkApplyResult } from "../links/batch";
import { createInboxRefreshController, type InboxRefreshController } from "./inboxRefresh";

export const INBOX_VIEW_TYPE = "claude-inbox-view";
const INBOX_REFRESH_DEBOUNCE_MS = 100;

/**
 * Source-inbox triage: everything the clipper dropped that isn't typed yet,
 * with one-tap enrich — plus a "wire up" section for enriched notes that
 * still mention other notes unlinked, so ingestion ends wired into the graph.
 * Built touch-first — on a phone this is the home base.
 */
export class InboxView extends ItemView {
  private enriching = new Set<string>();
  private readonly refresh: InboxRefreshController;
  /** A bulk enrichment or link review is active; do not start another batch. */
  private batchOperation: "enrich" | "link" | null = null;
  /** Last completed batch result, kept visible after its links leave the list. */
  private linkSummary: string | null = null;
  private linkResult: BatchLinkApplyResult | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: ClaudeCompanionPlugin) {
    super(leaf);
    this.refresh = createInboxRefreshController(
      () => void this.render(),
      {
        setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
        clearTimeout: (timer) => window.clearTimeout(timer),
      },
      INBOX_REFRESH_DEBOUNCE_MS,
    );
  }

  override getViewType(): string {
    return INBOX_VIEW_TYPE;
  }
  override getDisplayText(): string {
    return "Source inbox";
  }
  override getIcon(): string {
    return "inbox";
  }

  override async onOpen(): Promise<void> {
    this.registerEvent(this.app.vault.on("create", () => this.refresh.request()));
    this.registerEvent(this.app.vault.on("delete", () => this.refresh.request()));
    this.registerEvent(this.app.vault.on("rename", () => this.refresh.request()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.refresh.request()));
    await this.render();
  }

  override async onClose(): Promise<void> {
    this.refresh.dispose();
  }

  private pending(): InboxItem[] {
    const entries: InboxFileEntry[] = this.app.vault.getFiles().map((f: TFile) => ({
      path: f.path,
      basename: f.basename,
      ext: f.extension,
      frontmatter: this.app.metadataCache.getFileCache(f)?.frontmatter ?? undefined,
    }));
    return inboxItems(entries, this.plugin.settings.sourceInboxFolder);
  }

  async render(): Promise<void> {
    const generation = this.refresh.nextGeneration();
    if (!this.refresh.isCurrent(generation)) return;
    const root = this.contentEl;
    root.empty();
    root.addClass("cc-inbox-view");
    root.createEl("div", { cls: "cc-eyebrow", text: "SOURCE INBOX" });

    if (!this.plugin.settings.sourceCaptureEnabled) {
      root.createEl("p", {
        cls: "setting-item-description",
        text: "Source capture is off. Turn it on in Companion settings → Source capture.",
      });
      return;
    }

    const items = this.pending();
    if (items.length === 0) {
      root.createEl("p", {
        cls: "setting-item-description",
        text: `Inbox zero — nothing in “${this.plugin.settings.sourceInboxFolder}” needs typing. Clip something and it'll show up here.`,
      });
    } else {
      const bar = root.createDiv({ cls: "cc-inbox-bar" });
      bar.createSpan({ cls: "cc-inbox-count", text: `${items.length} to type` });
      bar.createSpan({ cls: "cc-inbox-backend", text: `Utility: ${this.plugin.sourceEnrichmentBackendLabel()}` });
      const all = bar.createEl("button", { cls: "cc-inbox-enrich-all", text: "Enrich all" });
      all.disabled = this.batchOperation !== null;
      all.addEventListener("click", () => void this.enrichAll(items));

      const list = root.createDiv({ cls: "cc-inbox-list" });
      for (const item of items) {
        const row = list.createDiv({ cls: "cc-inbox-row" });
        const open = row.createEl("button", { cls: "cc-inbox-open" });
        open.createSpan({ cls: "cc-inbox-name", text: item.basename });
        open.createSpan({ cls: `cc-inbox-type cc-inbox-type-${item.type}`, text: item.type });
        open.addEventListener("click", () => {
          const f = this.app.vault.getAbstractFileByPath(item.path);
          if (f instanceof TFile) void this.app.workspace.getLeaf(false).openFile(f);
        });

        const btn = row.createEl("button", {
          cls: "cc-inbox-enrich",
          attr: { "aria-label": `Enrich ${item.basename}` },
        });
        setIcon(btn, this.enriching.has(item.path) ? "loader" : "wand-sparkles");
        if (this.enriching.has(item.path)) btn.disabled = true;
        btn.addEventListener("click", () => void this.enrichOne(item));
      }
    }

    // Wire-up section: enriched notes that mention other notes without linking
    // them. Async (mention scan reads bodies) — guarded against stale renders.
    void this.renderWireUp(root, generation);
  }

  private enrichedInboxFiles(): TFile[] {
    const inbox = this.plugin.settings.sourceInboxFolder.replace(/\/+$/, "");
    if (!inbox) return [];
    const files: TFile[] = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (f.path === inbox || !f.path.startsWith(`${inbox}/`)) continue;
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.source_enriched !== true) continue;
      files.push(f);
    }
    return files;
  }

  private async renderWireUp(root: HTMLElement, generation: number): Promise<void> {
    const inbox = this.plugin.settings.sourceInboxFolder.replace(/\/+$/, "");
    if (!inbox) return;
    const files = this.enrichedInboxFiles();
    const entries: WireUpEntry[] = [];
    for (const f of files) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      try {
        entries.push({
          path: f.path,
          basename: f.basename,
          ext: f.extension,
          frontmatter: fm,
          content: await this.app.vault.cachedRead(f),
        });
      } catch {
        // A file can vanish or become unreadable while scanning; any stored
        // batch result keeps its actionable error details visible below.
      }
    }
    const items = wireUpItems(entries, this.plugin.linkCandidates(), inbox);
    if ((items.length === 0 && !this.linkSummary) || !this.refresh.isCurrent(generation)) return;

    const section = root.createDiv({ cls: "cc-inbox-wireup" });
    const header = section.createDiv({ cls: "cc-inbox-wireup-header" });
    header.createEl("div", { cls: "cc-eyebrow", text: "WIRE INTO THE GRAPH" });
    if (items.length > 0 || this.linkSummary) {
      const mentions = items.reduce((total, item) => total + item.mentionCount, 0);
      header.createSpan({
        cls: "cc-inbox-wireup-count",
        text: `${items.length} note${items.length === 1 ? "" : "s"} · ${mentions} mention${mentions === 1 ? "" : "s"}`,
      });
      const reviewAll = header.createEl("button", { cls: "cc-inbox-review-all", text: "Review all links" });
      reviewAll.disabled = this.batchOperation !== null;
      reviewAll.addEventListener("click", () => void this.reviewAllLinks());
    }
    if (this.linkSummary) section.createEl("p", { cls: "cc-inbox-link-summary", text: this.linkSummary });
    this.renderLinkResultDetails(section);
    if (items.length === 0) return;

    const list = section.createDiv({ cls: "cc-inbox-list" });
    for (const item of items) {
      const row = list.createDiv({ cls: "cc-inbox-row" });
      const open = row.createEl("button", { cls: "cc-inbox-open" });
      open.createSpan({ cls: "cc-inbox-name", text: item.basename });
      open.createSpan({ cls: "cc-inbox-mentions", text: `${item.mentionCount} mention${item.mentionCount === 1 ? "" : "s"}` });
      open.addEventListener("click", () => {
        const f = this.app.vault.getAbstractFileByPath(item.path);
        if (f instanceof TFile) void this.app.workspace.getLeaf(false).openFile(f);
      });

      const btn = row.createEl("button", {
        cls: "cc-inbox-enrich",
        attr: { "aria-label": `Review link suggestions for ${item.basename}` },
      });
      setIcon(btn, "link");
      btn.disabled = this.batchOperation !== null;
      btn.addEventListener("click", () => {
        const f = this.app.vault.getAbstractFileByPath(item.path);
        if (f instanceof TFile) void this.plugin.reviewLinkSuggestions(f).then(() => this.render());
      });
    }
  }

  private async enrichOne(item: InboxItem, fromBatch = false): Promise<void> {
    if ((!fromBatch && this.batchOperation !== null) || this.enriching.has(item.path)) return;
    const f = this.app.vault.getAbstractFileByPath(item.path);
    if (!(f instanceof TFile)) return;
    this.enriching.add(item.path);
    await this.render();
    try {
      await this.plugin.enrichInboxItem(f);
    } finally {
      this.enriching.delete(item.path);
      await this.render();
    }
  }

  private async enrichAll(items: InboxItem[]): Promise<void> {
    if (this.batchOperation !== null) return;
    this.batchOperation = "enrich";
    await this.render();
    try {
      for (const item of items) await this.enrichOne(item, true);
    } finally {
      this.batchOperation = null;
      await this.render();
    }
  }

  private async reviewAllLinks(): Promise<void> {
    if (this.batchOperation !== null) return;
    this.batchOperation = "link";
    this.linkSummary = null;
    this.linkResult = null;
    await this.render();
    try {
      const result = await this.plugin.reviewInboxLinkSuggestions(this.enrichedInboxFiles());
      if (result) {
        this.linkSummary = this.describeLinkResult(result);
        this.linkResult = result;
      }
    } catch (error) {
      this.linkSummary = `Couldn't review links — ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.batchOperation = null;
      await this.render();
    }
  }

  private describeLinkResult(result: BatchLinkApplyResult): string {
    const summary = result.appliedHunks > 0
      ? `Linked ${result.appliedHunks} mention${result.appliedHunks === 1 ? "" : "s"} in ${result.appliedFiles} note${result.appliedFiles === 1 ? "" : "s"}.`
      : "No link changes were applied.";
    const conflicts = result.conflicts.length > 0
      ? ` ${result.conflicts.length} note${result.conflicts.length === 1 ? " changed" : "s changed"} during review.`
      : "";
    const failures = result.failures.length > 0
      ? ` ${result.failures.length} note${result.failures.length === 1 ? " failed" : "s failed"}.`
      : "";
    return summary + conflicts + failures;
  }

  private renderLinkResultDetails(section: HTMLElement): void {
    if (!this.linkResult || (this.linkResult.conflicts.length === 0 && this.linkResult.failures.length === 0)) return;
    const details = section.createDiv({ cls: "cc-inbox-link-result-details" });
    if (this.linkResult.conflicts.length > 0) {
      details.createEl("div", { cls: "cc-inbox-link-result-label", text: "Changed during review" });
      const list = details.createEl("ul", { cls: "cc-inbox-link-result-list" });
      for (const path of this.linkResult.conflicts) list.createEl("li", { text: path });
    }
    if (this.linkResult.failures.length > 0) {
      details.createEl("div", { cls: "cc-inbox-link-result-label", text: "Could not complete" });
      const list = details.createEl("ul", { cls: "cc-inbox-link-result-list" });
      for (const failure of this.linkResult.failures) list.createEl("li", { text: `${failure.path}: ${failure.message}` });
    }
  }
}
