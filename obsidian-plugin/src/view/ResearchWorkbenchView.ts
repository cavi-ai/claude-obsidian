import { ItemView, Modal, Notice, TFile, type App, type WorkspaceLeaf } from "obsidian";
import { auditProject } from "../research/audit";
import type { ProjectSnapshot } from "../research/graph";
import type { ResearchRepository } from "../research/repository";
import { buildWorkbenchViewModel } from "../research/viewModel";
import { isResearchProjectChange, resolveResearchProjectLink } from "../research/workbenchRouting";
import type { IntelligenceCoordinator, IntelligenceNarratorMode } from "../research/intelligenceCoordinator";
import { ResearchIntelligencePanel } from "./ResearchIntelligencePanel";
import type { DiscoveryCoordinator } from "../discovery/coordinator";
import { DiscoveryPanel } from "./DiscoveryPanel";
import type { DraftCoordinator } from "../research/draftCoordinator";
import type { RevisionCoordinator } from "../research/revisionCoordinator";
import type { DraftSectionParseResult } from "../research/draftSections";
import type { ResearchDocumentRecord } from "../research/types";
import { ResearchDraftPanel } from "./ResearchDraftPanel";

export const RESEARCH_WORKBENCH_VIEW_TYPE = "claude-research-workbench";
export type ResearchWorkbenchTab = "Overview" | "Sources" | "Evidence" | "Claims" | "Outline" | "Draft" | "Audit" | "Intelligence" | "Discover";
type Tab = ResearchWorkbenchTab;
const TABS: Tab[] = ["Overview", "Sources", "Evidence", "Claims", "Outline", "Draft", "Audit", "Intelligence", "Discover"];
const TAB_GROUPS: Array<{ label: string; tabs: Tab[] }> = [
  { label: "Build", tabs: ["Overview", "Sources", "Evidence", "Claims"] },
  { label: "Write", tabs: ["Outline", "Draft"] },
  { label: "Assure", tabs: ["Audit", "Intelligence"] },
  { label: "Expand", tabs: ["Discover"] },
];

export interface ResearchWorkbenchDependencies {
  coordinator: IntelligenceCoordinator;
  narratorMode: () => IntelligenceNarratorMode;
  retainIntelligenceCoordinator?: () => void;
  releaseIntelligenceCoordinator?: () => void;
  discoveryCoordinator?: DiscoveryCoordinator;
  retainDiscoveryCoordinator?: () => void;
  releaseDiscoveryCoordinator?: () => void;
  draftCoordinator?: DraftCoordinator;
  revisionCoordinator?: RevisionCoordinator;
  openDesk?(projectPath: string): void | Promise<void>;
  askCompanion?(projectPath: string): void | Promise<void>;
}

export class ResearchWorkbenchView extends ItemView {
  private projectPath: string | undefined;
  private activeTab: Tab = "Overview";
  private renderSequence = 0;
  private intelligencePanel: ResearchIntelligencePanel | undefined;
  private intelligenceCoordinatorReleased = false;
  private discoveryPanel: DiscoveryPanel | undefined;
  private discoveryCoordinatorReleased = false;
  private draftPanel: ResearchDraftPanel | undefined;

  constructor(leaf: WorkspaceLeaf, private readonly repository: ResearchRepository, private readonly dependencies?: ResearchWorkbenchDependencies) {
    super(leaf);
    this.intelligencePanel = this.createIntelligencePanel();
    this.discoveryPanel = this.createDiscoveryPanel();
    this.draftPanel = this.createDraftPanel();
  }

  getViewType(): string { return RESEARCH_WORKBENCH_VIEW_TYPE; }
  getDisplayText(): string { return "Research workbench"; }
  override getIcon(): string { return "microscope"; }

  async setProjectPath(projectPath?: string): Promise<void> {
    this.projectPath = replaceResearchProjectPath(this.projectPath, projectPath, () => this.cancelIntelligence());
    await this.render();
  }

  getProjectPath(): string | undefined { return this.projectPath; }

  async focus(tab: ResearchWorkbenchTab, path?: string): Promise<void> {
    this.activeTab = tab;
    await this.render();
    if (path) await this.openPath(path);
  }

  isRelevantChange(path: string, oldPath?: string): boolean {
    return isResearchProjectChange(this.projectPath, path, oldPath);
  }

  override async onOpen(): Promise<void> {
    if (this.intelligenceCoordinatorReleased) {
      this.dependencies?.retainIntelligenceCoordinator?.();
      this.intelligenceCoordinatorReleased = false;
    }
    if (this.discoveryCoordinatorReleased) {
      this.dependencies?.retainDiscoveryCoordinator?.();
      this.discoveryCoordinatorReleased = false;
    }
    this.intelligencePanel ??= this.createIntelligencePanel();
    this.discoveryPanel ??= this.createDiscoveryPanel();
    await this.render();
  }
  override async onClose(): Promise<void> {
    this.renderSequence += 1;
    if (this.intelligencePanel) {
      this.intelligencePanel.dispose();
      this.intelligencePanel = undefined;
    }
    else this.dependencies?.coordinator.cancel();
    if (!this.intelligenceCoordinatorReleased) {
      this.intelligenceCoordinatorReleased = true;
      this.dependencies?.releaseIntelligenceCoordinator?.();
    }
    if (this.discoveryPanel) { this.discoveryPanel.dispose(); this.discoveryPanel = undefined; }
    else this.dependencies?.discoveryCoordinator?.cancel();
    if (!this.discoveryCoordinatorReleased) {
      this.discoveryCoordinatorReleased = true;
      this.dependencies?.releaseDiscoveryCoordinator?.();
    }
    this.draftPanel?.dispose();
  }

  async render(): Promise<void> {
    const sequence = ++this.renderSequence;
    let snapshot: ProjectSnapshot | undefined;
    let loadError: string | undefined;
    if (this.projectPath) {
      try { snapshot = await this.repository.loadProject(this.projectPath); }
      catch (error) { loadError = sanitizeLoadError(error); }
    }
    if (sequence !== this.renderSequence) return;
    let draftDocument: ResearchDocumentRecord | undefined;
    let draftSections: DraftSectionParseResult | undefined;
    if (snapshot && this.activeTab === "Draft") {
      draftDocument = snapshot.documents.find(({ documentKind }) => documentKind === "draft") ?? snapshot.documents.find(({ documentKind }) => documentKind === "outline");
      if (draftDocument) {
        try { draftSections = await this.repository.loadDraftSections(draftDocument.path); }
        catch (error) { draftSections = { sections: [], issues: [sanitizeLoadError(error)] }; }
      }
    }
    if (sequence !== this.renderSequence) return;
    const findings = snapshot ? auditProject(snapshot) : [];
    const vm = buildWorkbenchViewModel(snapshot, findings);
    const root = this.contentEl;
    root.empty();
    root.addClass("cc-research-workbench");

    const header = root.createEl("header", { cls: "cc-research-header" });
    if (this.projectPath && (this.dependencies?.openDesk || this.dependencies?.askCompanion)) {
      const navigation = header.createDiv({ cls: "cc-workspace-navigation", attr: { "aria-label": "Research workspace navigation" } });
      if (this.dependencies.openDesk) {
        const desk = navigation.createEl("button", { text: "Research Desk" });
        desk.addEventListener("click", () => void this.dependencies?.openDesk?.(this.projectPath!));
      }
      if (this.dependencies.askCompanion) {
        const ask = navigation.createEl("button", { cls: "cc-workspace-companion-action", text: "Ask Companion" });
        ask.addEventListener("click", () => void this.dependencies?.askCompanion?.(this.projectPath!));
      }
    }
    header.createEl("div", { cls: "cc-eyebrow", text: "RESEARCH WORKBENCH" });
    header.createEl("h2", { text: vm.title });
    header.createEl("p", { cls: "cc-research-question", text: vm.question });
    header.createEl("span", { cls: "cc-research-stage", text: vm.stage });

    const tabs = root.createEl("div", { cls: "cc-research-tabs", attr: { role: "tablist", "aria-label": "Research workbench sections" } });
    for (const group of TAB_GROUPS) {
      const groupRoot = tabs.createDiv({ cls: "cc-research-tab-group" });
      groupRoot.createSpan({ cls: "cc-research-tab-group-label", text: group.label });
      const groupTabs = groupRoot.createDiv({ cls: "cc-research-tab-buttons" });
      for (const tab of group.tabs) {
        const index = TABS.indexOf(tab); const id = tabId(tab);
        const button = groupTabs.createEl("button", { text: tab, attr: { id, role: "tab", "aria-selected": String(tab === this.activeTab), "aria-controls": `${id}-panel`, tabindex: tab === this.activeTab ? "0" : "-1" } });
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
    }
    const compactTabs = root.createEl("select", { cls: "cc-research-tab-select", attr: { "aria-label": "Research workbench section" } });
    for (const tab of TABS) compactTabs.createEl("option", { text: tab, value: tab });
    compactTabs.value = this.activeTab;
    compactTabs.addEventListener("change", () => { this.activeTab = compactTabs.value as Tab; void this.render(); });

    const activeId = tabId(this.activeTab);
    const panel = root.createEl("section", { cls: "cc-research-panel", attr: { id: `${activeId}-panel`, role: "tabpanel", "aria-labelledby": activeId } });
    if (loadError && this.projectPath) this.renderError(panel, this.projectPath, loadError);
    else if (!snapshot) this.renderEmpty(panel);
    else this.renderTab(panel, snapshot, findings, draftDocument, draftSections);
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

  private renderTab(root: HTMLElement, snapshot: ProjectSnapshot, findings: ReturnType<typeof auditProject>, draftDocument?: ResearchDocumentRecord, draftSections?: DraftSectionParseResult): void {
    const vm = buildWorkbenchViewModel(snapshot, findings);
    if (this.activeTab === "Intelligence") {
      if (this.intelligencePanel) this.intelligencePanel.render(root, snapshot);
      else root.createEl("p", { text: "Research intelligence is unavailable." });
      return;
    }
    if (this.activeTab === "Discover") {
      if (this.discoveryPanel) this.discoveryPanel.render(root, snapshot);
      else root.createEl("p", { text: "Scholarly discovery is unavailable." });
      return;
    }
    if (this.activeTab === "Draft") {
      if (this.draftPanel) this.draftPanel.render(root, snapshot, draftDocument, draftSections);
      else root.createEl("p", { text: "Section drafting is unavailable." });
      return;
    }
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

  private cancelIntelligence(): void {
    if (this.intelligencePanel) this.intelligencePanel.cancel();
    else this.dependencies?.coordinator.cancel();
    if (this.discoveryPanel) this.discoveryPanel.cancel();
    else this.dependencies?.discoveryCoordinator?.cancel();
    this.draftPanel?.dispose();
  }

  private createDiscoveryPanel(): DiscoveryPanel | undefined {
    if (!this.dependencies?.discoveryCoordinator) return undefined;
    return new DiscoveryPanel({ coordinator: this.dependencies.discoveryCoordinator, openPath: (path) => this.openPath(path), rerender: () => this.render() });
  }

  private createIntelligencePanel(): ResearchIntelligencePanel | undefined {
    if (!this.dependencies) return undefined;
    return new ResearchIntelligencePanel({
      coordinator: this.dependencies.coordinator,
      openPath: (path) => this.openPath(path),
      rerender: () => this.render(),
    });
  }

  private createDraftPanel(): ResearchDraftPanel | undefined {
    if (!this.dependencies?.draftCoordinator) return undefined;
    return new ResearchDraftPanel({ coordinator: this.dependencies.draftCoordinator, ...(this.dependencies.revisionCoordinator ? { revisionCoordinator: this.dependencies.revisionCoordinator } : {}), repository: this.repository, rerender: () => this.render() });
  }

  private openCreateProject(): void {
    new ResearchInputModal(this.app, "Create research project", ["Title", "Research question", "Project folder"], async ([title, question, folder]) => {
      const record = await this.repository.createProject({ title: title ?? "", question: question ?? "", folder: folder ?? "" });
      await this.setProjectPath(record.path);
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
export function replaceResearchProjectPath(currentPath: string | undefined, requestedPath: string | undefined, cancel: () => void): string | undefined {
  const nextPath = resolveResearchProjectLink(requestedPath);
  if (currentPath !== undefined && currentPath !== nextPath) cancel();
  return nextPath;
}
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
