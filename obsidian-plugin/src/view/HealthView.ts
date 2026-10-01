import { ItemView, WorkspaceLeaf } from "obsidian";
import type ClaudeCompanionPlugin from "../main";
import type { SafeFix } from "../health/controller";
import type { HealthReport, HealthSection } from "../health/scan";
import { renderCompanionChrome } from "./companionChrome";

export const HEALTH_VIEW_TYPE = "claude-vault-health";

export interface HealthViewDeps {
  scan(): Promise<HealthReport>;
  safeFixes(): SafeFix[];
  openNote(path: string): void;
  openResearchDesk(projectPath: string): Promise<void>;
  buildIndex(): Promise<void>;
  catchUpIndex(): Promise<void>;
  openInbox(): Promise<void>;
  reviewSafeFixes(fixes: SafeFix[], done: () => void): void;
}

/** One local scan per open or Refresh; never on a timer or vault event. */
export class HealthView extends ItemView {
  private disposeChrome: ((remove?: boolean) => void) | null = null;
  private generation = 0;

  constructor(leaf: WorkspaceLeaf, private plugin: ClaudeCompanionPlugin, private deps: HealthViewDeps) {
    super(leaf);
  }

  override getViewType(): string {
    return HEALTH_VIEW_TYPE;
  }
  override getDisplayText(): string {
    return "Vault health";
  }
  override getIcon(): string {
    return "heart-pulse";
  }

  override async onOpen(): Promise<void> {
    await this.render();
  }

  override async onClose(): Promise<void> {
    this.generation++;
    this.disposeChrome?.(false);
    this.disposeChrome = null;
  }

  async render(): Promise<void> {
    const generation = ++this.generation;
    const root = this.contentEl;
    this.disposeChrome?.();
    this.disposeChrome = null;
    root.empty();
    root.addClass("cc-health-view");
    this.disposeChrome = renderCompanionChrome(root, "health", "Vault health", this.plugin.companionChrome());
    root.createDiv({ cls: "cc-eyebrow", text: "VAULT HEALTH" });
    const bar = root.createDiv({ cls: "cc-health-bar" });
    const refresh = bar.createEl("button", { cls: "cc-health-refresh", text: "Refresh" });
    refresh.addEventListener("click", () => void this.render());
    const scanned = bar.createSpan({ cls: "cc-health-scanned", text: "Scanning…" });

    let report: HealthReport;
    try {
      report = await this.deps.scan();
    } catch (error) {
      if (generation !== this.generation) return;
      scanned.setText(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (generation !== this.generation) return;
    scanned.setText(`Scanned ${new Date(report.scannedAt).toLocaleTimeString()}`);

    const problems = report.sections.filter((s) => s.severity !== "ok");
    if (problems.length === 0) {
      root.createEl("p", { cls: "cc-health-ok", text: "Everything checks out." });
      return;
    }
    for (const section of problems) this.renderSection(root, section);
  }

  private renderSection(root: HTMLElement, section: HealthSection): void {
    const card = root.createDiv({ cls: `cc-health-section cc-health-${section.id} is-${section.severity}` });
    card.createDiv({ cls: "cc-health-title", text: `${section.title} · ${section.count}` });
    for (const item of section.items) {
      const row = card.createDiv({ cls: "cc-health-row" });
      if (item.path) {
        const link = row.createEl("button", { cls: "cc-health-link", text: item.path });
        link.addEventListener("click", () => this.deps.openNote(item.path));
      }
      row.createSpan({ cls: "cc-health-message", text: item.message });
    }
    if (section.count > section.items.length) {
      card.createDiv({ cls: "cc-health-more", text: `+${section.count - section.items.length} more` });
    }
    this.renderActions(card, section);
  }

  private renderActions(card: HTMLElement, section: HealthSection): void {
    const actions = card.createDiv({ cls: "cc-health-actions" });
    const action = (text: string, run: () => void | Promise<void>, title?: string): void => {
      const button = actions.createEl("button", { cls: "cc-health-action", text });
      if (title) button.setAttribute("title", title);
      button.addEventListener("click", () => void Promise.resolve(run()));
    };
    const then = (run: () => Promise<void>) => async (): Promise<void> => {
      await run();
      await this.render();
    };
    switch (section.id) {
      case "ontology":
        if ((section.fixable ?? 0) > 0) {
          action(`Review safe fixes (${section.fixable})`, () => this.deps.reviewSafeFixes(this.deps.safeFixes(), () => void this.render()));
        }
        return;
      case "research":
        for (const project of new Set(section.items.flatMap((i) => (i.project ? [i.project] : [])))) {
          action("Open in Research Desk", () => this.deps.openResearchDesk(project), project);
        }
        return;
      case "index":
        if (section.items.some((i) => i.path === "")) action("Build index", then(() => this.deps.buildIndex()));
        if (section.items.some((i) => i.path !== "")) action("Catch up index", then(() => this.deps.catchUpIndex()));
        return;
      case "inbox":
        action("Open Inbox", () => this.deps.openInbox());
        return;
      case "links":
        return;
    }
  }
}
