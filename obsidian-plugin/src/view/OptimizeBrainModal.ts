import { App, Modal, Setting } from "obsidian";
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
  private decided = false;

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
    this.titleEl.setText(`Review ${this.state.rows.length} tag merges`);
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
          void this.actions.dismiss(row.id).then(() => {
            this.state = removeRow(this.state, row.id);
            this.render();
          });
        }));
    }
    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.finish(null)))
      .addButton((b) => b.setButtonText("Apply selected").setCta().onClick(() => {
        if (this.decided) return;
        this.decided = true;
        void this.actions.apply(selectedMerges(this.state)).then((result) => {
          this.onDone(result);
          this.close();
        });
      }));
  }

  private finish(result: ApplyResult | null): void {
    this.decided = true;
    this.onDone(result);
    this.close();
  }

  override onClose(): void {
    if (!this.decided) {
      this.decided = true;
      this.onDone(null);
    }
  }
}
