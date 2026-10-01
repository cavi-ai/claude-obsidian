import { Modal, type App } from "obsidian";
import type { ClaimRecord } from "../../research/types";
import { sanitizeLoadError } from "./shared";

export class OutlineCreateModal extends Modal {
  constructor(app: App, private readonly claims: ClaimRecord[], private readonly submit: (claimPaths: string[]) => Promise<void>) { super(app); }
  override onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "Build evidence-backed outline" });
    this.contentEl.createEl("p", { text: "Choose the reviewed, supported claims to include in the canonical outline." });
    const selected = new Map<string, HTMLInputElement>();
    for (const claim of this.claims) {
      const row = this.contentEl.createEl("label", { cls: "cc-research-outline-claim" });
      const input = row.createEl("input", { attr: { type: "checkbox", "aria-label": `Include ${claim.title}` } });
      input.checked = true;
      row.createEl("strong", { text: claim.title });
      row.createSpan({ text: claim.proposition });
      selected.set(claim.path, input);
    }
    const error = this.contentEl.createEl("p", { cls: "cc-research-error", attr: { role: "alert" } });
    const button = this.contentEl.createEl("button", { cls: "mod-cta", text: "Build outline" });
    button.addEventListener("click", () => {
      const paths = [...selected].filter(([, input]) => input.checked).map(([path]) => path);
      if (!paths.length) { error.setText("Select at least one claim."); return; }
      void this.submit(paths).then(() => this.close()).catch((cause) => error.setText(sanitizeLoadError(cause)));
    });
  }
}
