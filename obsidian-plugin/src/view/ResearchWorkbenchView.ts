import { ItemView, Modal, Notice, TFile, type App, type WorkspaceLeaf } from "obsidian";
import { auditProject } from "../research/audit";
import type { ProjectSnapshot } from "../research/graph";
import type { ResearchRepository } from "../research/repository";
import { buildWorkbenchViewModel } from "../research/viewModel";
import { isResearchProjectChange, resolveResearchProjectLink } from "../research/workbenchRouting";
import type { IntelligenceCoordinator, IntelligenceNarratorMode } from "../research/intelligenceCoordinator";

export const RESEARCH_WORKBENCH_VIEW_TYPE = "claude-research-workbench";
type Tab = "Overview" | "Sources" | "Evidence" | "Claims" | "Outline" | "Audit";
const TABS: Tab[] = ["Overview", "Sources", "Evidence", "Claims", "Outline", "Audit"];

export interface ResearchWorkbenchDependencies {
  coordinator: IntelligenceCoordinator;
  narratorMode: () => IntelligenceNarratorMode;
}

export class ResearchWorkbenchView extends ItemView {
  private projectPath: string | undefined;
  private activeTab: Tab = "Overview";
  private renderSequence = 0;

  constructor(leaf: WorkspaceLeaf, private readonly repository: ResearchRepository, private readonly dependencies?: ResearchWorkbenchDependencies) {
    super(leaf);
  }

  getViewType(): string { return RESEARCH_WORKBENCH_VIEW_TYPE; }
  getDisplayText(): string { return "Research workbench"; }
  override getIcon(): string { return "microscope"; }

  async setProjectPath(projectPath?: string): Promise<void> {
    this.projectPath = resolveResearchProjectLink(projectPath);
    await this.render();
  }

  getProjectPath(): string | undefined { return this.projectPath; }

  isRelevantChange(path: string, oldPath?: string): boolean {
    return isResearchProjectChange(this.projectPath, path, oldPath);
  }

  override async onOpen(): Promise<void> { await this.render(); }

  async render(): Promise<void> {
    const sequence = ++this.renderSequence;
    let snapshot: ProjectSnapshot | undefined;
    let loadError: string | undefined;
    if (this.projectPath) {
      try { snapshot = await this.repository.loadProject(this.projectPath); }
      catch (error) { loadError = sanitizeLoadError(error); }
    }
    if (sequence !== this.renderSequence) return;
    const findings = snapshot ? auditProject(snapshot) : [];
    const vm = buildWorkbenchViewModel(snapshot, findings);
    const root = this.contentEl;
    root.empty();
    root.addClass("cc-research-workbench");

    const header = root.createEl("header", { cls: "cc-research-header" });
    header.createEl("div", { cls: "cc-eyebrow", text: "RESEARCH WORKBENCH" });
    header.createEl("h2", { text: vm.title });
    header.createEl("p", { cls: "cc-research-question", text: vm.question });
    header.createEl("span", { cls: "cc-research-stage", text: vm.stage });

    const tabs = root.createEl("div", { cls: "cc-research-tabs", attr: { role: "tablist", "aria-label": "Research workbench sections" } });
    for (const [index, tab] of TABS.entries()) {
      const id = tabId(tab);
      const button = tabs.createEl("button", { text: tab, attr: { id, role: "tab", "aria-selected": String(tab === this.activeTab), "aria-controls": `${id}-panel`, tabindex: tab === this.activeTab ? "0" : "-1" } });
      if (tab === this.activeTab) button.addClass("is-active");
      button.addEventListener("click", () => { this.activeTab = tab; void this.render(); });
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
        this.activeTab = TABS[next] ?? "Overview";
        void this.render().then(() => this.contentEl.querySelector<HTMLElement>(`#${tabId(this.activeTab)}`)?.focus());
      });
    }

    const activeId = tabId(this.activeTab);
    const panel = root.createEl("section", { cls: "cc-research-panel", attr: { id: `${activeId}-panel`, role: "tabpanel", "aria-labelledby": activeId } });
    if (loadError && this.projectPath) this.renderError(panel, this.projectPath, loadError);
    else if (!snapshot) this.renderEmpty(panel);
    else this.renderTab(panel, snapshot, findings);
    this.renderActions(root, snapshot);
  }

  private renderEmpty(root: HTMLElement): void {
    root.createEl("h3", { text: "No research project selected" });
    root.createEl("p", { text: "Open a research project note, then reopen this view. Project notes are the canonical place to frame the question." });
  }

  private renderError(root: HTMLElement, projectPath: string, message: string): void {
    root.createEl("h3", { text: "Research project could not be loaded" });
    root.createEl("p", { cls: "cc-research-project-path", text: projectPath });
    root.createEl("p", { cls: "cc-research-error", text: message });
    root.createEl("p", { text: "Repair the project note or its research frontmatter, then retry. Run Audit to inspect any records that can still be parsed." });
    this.actionButton(root, "Run audit", undefined, undefined, () => { this.activeTab = "Audit"; void this.render(); });
  }

  private renderTab(root: HTMLElement, snapshot: ProjectSnapshot, findings: ReturnType<typeof auditProject>): void {
    const vm = buildWorkbenchViewModel(snapshot, findings);
    if (this.activeTab === "Overview") {
      const grid = root.createDiv({ cls: "cc-research-metrics" });
      for (const [label, value] of [["Sources", vm.counts.sources], ["Evidence", vm.counts.evidence], ["Claims", vm.counts.claims], ["Open questions", vm.counts.openQuestions]] as const) {
        const card = grid.createEl("button", { cls: "cc-research-metric", attr: { "aria-label": `Open ${label.toLowerCase()}` } });
        card.createEl("strong", { text: String(value) }); card.createSpan({ text: label });
        card.addEventListener("click", () => { this.activeTab = label === "Open questions" ? "Overview" : label; void this.render(); });
      }
      root.createEl("h3", { text: "Audit health" });
      const health = root.createDiv({ cls: "cc-research-health", attr: { role: "status", "aria-label": "Research audit health" } });
      for (const [label, value] of [["Unsupported claims", vm.health.unsupportedClaims], ["Unreviewed evidence", vm.health.unreviewedEvidence], ["Missing locators", vm.health.missingLocators], ["Broken references", vm.health.brokenReferences]] as const) {
        const metric = health.createDiv({ cls: "cc-research-health-metric", attr: { "aria-label": `${label}: ${value}` } });
        metric.createEl("strong", { text: String(value) });
        metric.createSpan({ text: label });
      }
      root.createEl("h3", { text: "Next actions" });
      for (const action of vm.nextActions) this.openButton(root, action.label, action.path);
      return;
    }
    if (this.activeTab === "Audit") {
      if (!findings.length) root.createEl("p", { text: "No audit findings." });
      for (const finding of findings) this.openButton(root, `${finding.code}: ${finding.explanation}`, finding.path);
      return;
    }
    const records = this.activeTab === "Sources" ? snapshot.sources : this.activeTab === "Evidence" ? snapshot.evidence : this.activeTab === "Claims" ? snapshot.claims : snapshot.documents.filter(({ documentKind }) => documentKind === "outline");
    if (!records.length) root.createEl("p", { text: `No ${this.activeTab.toLowerCase()} yet.` });
    for (const record of records) this.openButton(root, record.title, record.path);
  }

  private renderActions(root: HTMLElement, snapshot?: ProjectSnapshot): void {
    const actions = root.createDiv({ cls: "cc-research-actions", attr: { "aria-label": "Research actions" } });
    const projectPath = snapshot?.project.path;
    this.actionButton(actions, "Create project", undefined, undefined, () => this.openCreateProject());
    this.actionButton(actions, "Add source", projectPath, "Select a research project before adding a source.", () => projectPath ? this.openAddSource(projectPath) : new Notice("Select a research project first."));
    this.actionButton(actions, "Review evidence", snapshot?.evidence.find(({ reviewState }) => reviewState === "proposed")?.path ?? projectPath);
    this.actionButton(actions, "Create claim", projectPath, "Open the project note before creating a claim with the research tools.");
    this.actionButton(actions, "Run audit", projectPath, undefined, () => { this.activeTab = "Audit"; void this.render(); });
    this.actionButton(actions, "Build outline", snapshot?.documents.find(({ documentKind }) => documentKind === "outline")?.path ?? projectPath);
  }

  private actionButton(root: HTMLElement, label: string, path?: string, hint?: string, action?: () => void): void {
    const button = root.createEl("button", { text: label, attr: { "aria-label": label, ...(hint ? { title: hint } : {}) } });
    button.addEventListener("click", action ?? (() => path ? void this.openPath(path) : new Notice(hint ?? "Select a research project first.")));
  }

  private openButton(root: HTMLElement, label: string, path?: string): void {
    const button = root.createEl("button", { cls: "cc-research-open", text: label });
    if (path) button.addEventListener("click", () => void this.openPath(path));
    else button.disabled = true;
  }

  private async openPath(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
    else new Notice(`Research note not found: ${path}`);
  }

  private openCreateProject(): void {
    new ResearchInputModal(this.app, "Create research project", ["Title", "Research question", "Project folder"], async ([title, question, folder]) => {
      const record = await this.repository.createProject({ title: title ?? "", question: question ?? "", folder: folder ?? "" });
      this.projectPath = record.path;
      await this.render();
    }).open();
  }

  private openAddSource(project: string): void {
    new ResearchInputModal(this.app, "Add research source", ["Title", "Source kind", "URL or stable identifier", "Captured text (optional)"], async ([title, sourceKind, identity, capturedContent]) => {
      if (!["pdf", "web", "doi", "arxiv", "zotero", "vault"].includes(sourceKind ?? "")) throw new Error("Source kind must be pdf, web, doi, arxiv, zotero, or vault");
      const kind = sourceKind as "pdf" | "web" | "doi" | "arxiv" | "zotero" | "vault";
      await this.repository.importSource(project, { title: title ?? "", sourceKind: kind, ...(identity ? (kind === "doi" ? { doi: identity } : kind === "arxiv" ? { arxivId: identity } : { url: identity }) : {}), ...(capturedContent ? { capturedContent } : {}) });
      await this.render();
    }).open();
  }
}

function tabId(tab: Tab): string { return `cc-research-tab-${tab.toLowerCase()}`; }
function sanitizeLoadError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Unknown project load error";
  return raw.replace(/\b(?:sk-ant-[A-Za-z0-9_-]+|Bearer\s+\S+|api[_-]?key\s*[=:]\s*\S+)/gi, "[redacted]").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) || "Unknown project load error";
}

class ResearchInputModal extends Modal {
  constructor(app: App, private readonly heading: string, private readonly labels: string[], private readonly submit: (values: string[]) => Promise<void>) { super(app); }
  override onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: this.heading });
    const inputs = this.labels.map((label) => {
      const wrapper = this.contentEl.createDiv({ cls: "cc-research-modal-field" });
      wrapper.createEl("label", { text: label });
      return wrapper.createEl(label.includes("text") ? "textarea" : "input");
    });
    const error = this.contentEl.createEl("p", { cls: "cc-research-error", attr: { role: "alert" } });
    const button = this.contentEl.createEl("button", { text: this.heading });
    button.addEventListener("click", () => void this.submit(inputs.map(({ value }) => value)).then(() => this.close()).catch((cause) => { error.setText(sanitizeLoadError(cause)); }));
  }
}
