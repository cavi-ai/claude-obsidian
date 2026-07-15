import type { DraftCoordinator, DraftPreview } from "../research/draftCoordinator";
import type { DraftSectionParseResult, ParsedDraftSection } from "../research/draftSections";
import type { ProjectSnapshot } from "../research/graph";
import { buildDraftGrounding, groundingClaimFingerprint } from "../research/draftGrounding";
import type { ResearchRepository } from "../research/repository";
import type { ResearchDocumentRecord } from "../research/types";
import { planEdits } from "../edit/diff";

export interface ResearchDraftPanelDeps {
  coordinator: DraftCoordinator;
  repository: ResearchRepository;
  rerender(): void | Promise<void>;
}

export function safeDraftError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Section draft failed.";
  return raw.replace(/\b(?:sk-ant-[A-Za-z0-9_-]+|Bearer\s+\S+|api[_-]?key\s*[=:]\s*\S+)/gi, "[redacted]").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) || "Section draft failed.";
}

export class ResearchDraftPanel {
  private readonly previews = new Map<string, DraftPreview>();
  private readonly errors = new Map<string, string>();
  private active: AbortController | undefined;

  constructor(private readonly deps: ResearchDraftPanelDeps) {}

  dispose(): void { this.active?.abort(); this.active = undefined; }

  render(root: HTMLElement, snapshot: ProjectSnapshot, document: ResearchDocumentRecord | undefined, parsed: DraftSectionParseResult | undefined): void {
    root.createEl("h3", { text: "Section drafting" });
    root.createEl("p", { text: "Draft one claim-grounded section at a time. Previewing never writes to the vault." });
    if (!document) { root.createEl("p", { text: "Build an evidence-backed outline before drafting." }); return; }
    if (!parsed) { root.createEl("p", { cls: "cc-research-error", text: "The document sections could not be loaded." }); return; }
    for (const issue of parsed.issues) root.createEl("p", { cls: "cc-research-error", text: issue });
    if (!parsed.sections.length) { root.createEl("p", { text: "This document has no managed sections. Regenerate the evidence-backed outline to make its sections draftable." }); return; }
    for (const section of parsed.sections) this.renderSection(root, snapshot, document, section);
  }

  private renderSection(root: HTMLElement, snapshot: ProjectSnapshot, document: ResearchDocumentRecord, section: ParsedDraftSection): void {
    const card = root.createEl("article", { cls: "cc-draft-section" });
    const heading = /^##\s+(.+)$/m.exec(section.markdown)?.[1] ?? section.envelope.id;
    card.createEl("h4", { text: heading });
    const evidenceDrift = section.envelope.provider !== "companion" && this.evidenceChanged(snapshot, section);
    const stale = section.modifiedSinceReview || evidenceDrift;
    const status = section.modifiedSinceReview ? "Modified since review" : evidenceDrift ? "Evidence changed since review" : section.envelope.provider === "companion" ? "Ready to draft" : "Accepted draft";
    card.createEl("p", { cls: `cc-draft-status${stale ? " is-stale" : ""}`, text: status });
    card.createEl("p", { text: `${section.envelope.claimPaths.length} claim · ${section.envelope.evidence.length} evidence record${section.envelope.evidence.length === 1 ? "" : "s"}` });
    const error = this.errors.get(section.envelope.id);
    if (error) card.createEl("p", { cls: "cc-research-error", attr: { role: "alert" }, text: error });
    const preview = this.previews.get(section.envelope.id);
    if (!preview) {
      const button = card.createEl("button", { text: "Preview draft" });
      button.addEventListener("click", () => void this.preview(snapshot, section));
      return;
    }
    card.createEl("p", { cls: "cc-draft-provider", text: `${preview.envelope.provider} · ${preview.envelope.model}` });
    card.createEl("pre", { cls: "cc-draft-preview", text: preview.response.markdown });
    const diff = card.createDiv({ cls: "cc-draft-diff", attr: { "aria-label": "Section before and after diff" } });
    const hunk = planEdits(section.markdown, [{ old_str: section.markdown, new_str: preview.response.markdown }]).hunks[0];
    if (hunk) {
      const lines = diff.createEl("pre", { cls: "cc-diff-lines" });
      for (const line of hunk.lines) lines.createDiv({ cls: `cc-diff-line is-${line.kind}`, text: `${line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "} ${line.text}` });
    }
    card.createEl("p", { text: `${preview.response.support.length} supported passage${preview.response.support.length === 1 ? "" : "s"} · ${preview.response.gaps.length} unresolved gap${preview.response.gaps.length === 1 ? "" : "s"}` });
    const support = card.createEl("details", { cls: "cc-draft-support" });
    support.createEl("summary", { text: "Inspect support manifest" });
    for (const entry of preview.response.support) {
      support.createEl("p", { text: entry.passage });
      support.createEl("p", { cls: "cc-draft-support-paths", text: `Claim: ${entry.claimPath} · Evidence: ${entry.evidencePaths.join(", ")} · Citations: ${entry.citationKeys.map((key) => `[@${key}]`).join(", ")}` });
    }
    if (preview.response.gaps.length) {
      support.createEl("strong", { text: "Unresolved gaps" });
      for (const gap of preview.response.gaps) support.createEl("p", { text: gap });
    }
    const accept = card.createEl("button", { text: "Accept section" });
    accept.addEventListener("click", () => void this.accept(snapshot.project.path, document.path, preview));
    const discard = card.createEl("button", { text: "Discard preview" });
    discard.addEventListener("click", () => { this.previews.delete(section.envelope.id); this.errors.delete(section.envelope.id); void this.deps.rerender(); });
  }

  private async preview(snapshot: ProjectSnapshot, section: ParsedDraftSection): Promise<void> {
    this.active?.abort();
    const controller = new AbortController();
    this.active = controller;
    this.errors.delete(section.envelope.id);
    try {
      const preview = await this.deps.coordinator.preview(snapshot, section, controller.signal);
      if (!controller.signal.aborted) this.previews.set(section.envelope.id, preview);
    } catch (error) {
      if (!controller.signal.aborted) this.errors.set(section.envelope.id, safeDraftError(error));
    } finally {
      if (this.active === controller) this.active = undefined;
      if (!controller.signal.aborted) await this.deps.rerender();
    }
  }

  private async accept(projectPath: string, documentPath: string, preview: DraftPreview): Promise<void> {
    this.errors.delete(preview.section.envelope.id);
    try {
      const current = await this.deps.repository.loadProject(projectPath);
      const packet = buildDraftGrounding(current, preview.packet.claim.path);
      await this.deps.repository.acceptDraftSection({ documentPath, preview: preview.section, envelope: preview.envelope, markdown: preview.response.markdown, currentEvidence: packet.evidence.map(({ path, fingerprint }) => ({ path, fingerprint })), currentClaimFingerprint: groundingClaimFingerprint(packet) });
      this.previews.delete(preview.section.envelope.id);
    } catch (error) {
      this.errors.set(preview.section.envelope.id, safeDraftError(error));
    }
    await this.deps.rerender();
  }

  private evidenceChanged(snapshot: ProjectSnapshot, section: ParsedDraftSection): boolean {
    try {
      const claimPath = section.envelope.claimPaths[0];
      if (!claimPath) return true;
      const packet = buildDraftGrounding(snapshot, claimPath);
      return groundingClaimFingerprint(packet) !== section.envelope.claimFingerprint || JSON.stringify(packet.evidence.map(({ path, fingerprint }) => ({ path, fingerprint }))) !== JSON.stringify(section.envelope.evidence);
    } catch { return true; }
  }
}
