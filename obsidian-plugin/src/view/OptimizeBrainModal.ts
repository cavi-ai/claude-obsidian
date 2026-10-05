import { App, Modal, Notice, Setting } from "obsidian";
import type { ApplyResult } from "../optimize/controller";
import type { MergeCandidate } from "../optimize/tagScan";
import { createOptimizeState, removeRow, selectedMerges, swapRow, toggleRow, type OptimizeViewState } from "./optimizeState";

export interface OptimizeBrainActions {
  apply(merges: Array<{ from: string; to: string }>): Promise<ApplyResult>;
  dismiss(id: string): Promise<void>;
}

/** Review gate for tag merges: nothing is written until Apply. */
export class OptimizeBrainModal extends Modal {
  private state: OptimizeViewState;
  private settled = false;
  private applying = false;

  constructor(
    app: App,
    candidates: MergeCandidate[],
    private actions: OptimizeBrainActions,
    private onDone: (result: ApplyResult | null) => void,
  ) {
    super(app);
    this.state = createOptimizeState(candidates);
  }

  override onOpen(): void {
    this.contentEl.addClass("cc-optimize-review");
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText(`Review ${this.state.rows.length} tag ${this.state.rows.length === 1 ? "merge" : "merges"}`);
    contentEl.createDiv({
      text: "Merges rewrite tags in notes. Saved searches, Bases, and queries that name a merged tag are not changed.",
    });
    if (this.state.rows.length === 0) contentEl.createDiv({ text: "No tag merges to review." });
    for (const row of this.state.rows) {
      const setting = new Setting(contentEl)
        .setName(`${row.from} (${row.fromCount}) → ${row.to} (${row.toCount})`)
        .setDesc(row.evidence.join(", "));
      const check = setting.controlEl.createEl("input", { attr: { type: "checkbox" } });
      check.checked = row.checked;
      check.addEventListener("change", () => {
        this.state = toggleRow(this.state, row.id, check.checked);
      });
      setting
        .addButton((b) => b.setButtonText("Swap").onClick(() => {
          this.state = swapRow(this.state, row.id);
          this.render();
        }))
        .addButton((b) => b.setButtonText("Dismiss").onClick(() => {
          void this.actions.dismiss(row.id).then(
            () => {
              this.state = removeRow(this.state, row.id);
              this.render();
            },
            (error: unknown) => new Notice(`Tag dismiss failed: ${errorMessage(error)}`),
          );
        }));
    }
    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => (this.applying ? this.close() : this.finish(null))))
      .addButton((b) => b.setButtonText("Apply selected").setCta().onClick(() => {
        if (this.applying || this.settled) return;
        this.applying = true;
        void this.actions.apply(selectedMerges(this.state)).then(
          (result) => this.finish(result),
          (error: unknown) => {
            new Notice(`Tag merge failed: ${errorMessage(error)}`);
            this.finish(null);
          },
        );
      }));
  }

  private finish(result: ApplyResult | null): void {
    this.applying = false;
    if (!this.settled) {
      this.settled = true;
      this.onDone(result);
    }
    this.close();
  }

  override onClose(): void {
    if (!this.settled && !this.applying) {
      this.settled = true;
      this.onDone(null);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
