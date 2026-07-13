import { ItemView, Notice, TFile, type WorkspaceLeaf } from "obsidian";
import { auditProject } from "../research/audit";
import type { ProjectSnapshot } from "../research/graph";
import type { ResearchRepository } from "../research/repository";
import { buildWorkbenchViewModel } from "../research/viewModel";

export const RESEARCH_WORKBENCH_VIEW_TYPE = "claude-research-workbench";
type Tab = "Overview" | "Sources" | "Evidence" | "Claims" | "Outline" | "Audit";
const TABS: Tab[] = ["Overview", "Sources", "Evidence", "Claims", "Outline", "Audit"];

export class ResearchWorkbenchView extends ItemView {
  private projectPath: string | undefined;
  private activeTab: Tab = "Overview";
  private renderSequence = 0;

  constructor(leaf: WorkspaceLeaf, private readonly repository: ResearchRepository) {
    super(leaf);
  }

  getViewType(): string { return RESEARCH_WORKBENCH_VIEW_TYPE; }
  getDisplayText(): string { return "Research workbench"; }
  override getIcon(): string { return "microscope"; }

  async setProjectPath(projectPath?: string): Promise<void> {
    this.projectPath = projectPath;
    await this.render();
  }

  override async onOpen(): Promise<void> { await this.render(); }

  async render(): Promise<void> {
    const sequence = ++this.renderSequence;
    let snapshot: ProjectSnapshot | undefined;
    if (this.projectPath) {
      try { snapshot = await this.repository.loadProject(this.projectPath); }
      catch { snapshot = undefined; }
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
    for (const tab of TABS) {
      const button = tabs.createEl("button", { text: tab, attr: { role: "tab", "aria-selected": String(tab === this.activeTab) } });
      if (tab === this.activeTab) button.addClass("is-active");
      button.addEventListener("click", () => { this.activeTab = tab; void this.render(); });
    }

    const panel = root.createEl("section", { cls: "cc-research-panel", attr: { role: "tabpanel", "aria-label": this.activeTab } });
    if (!snapshot) this.renderEmpty(panel);
    else this.renderTab(panel, snapshot, findings);
    this.renderActions(root, snapshot);
  }

  private renderEmpty(root: HTMLElement): void {
    root.createEl("h3", { text: "No research project selected" });
    root.createEl("p", { text: "Open a research project note, then reopen this view. Project notes are the canonical place to frame the question." });
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
    this.actionButton(actions, "Create project", undefined, "Create a project with the research tools, then open its Project.md note.");
    this.actionButton(actions, "Add source", projectPath, "Open the project note before adding a source with the research tools.");
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
}
