import { BasesView, type QueryController } from "obsidian";
import { SIMILAR_VIEW_MESSAGES, isNoteAnchor, rankWithinBase, similarViewState } from "../bases/similarView";

export const SIMILAR_BASES_VIEW_TYPE = "companion-similar";
const NEIGHBOUR_POOL = 200;
const DEFAULT_LIMIT = 20;

export interface SimilarViewDeps {
  semanticEnabled(): boolean;
  related(path: string, k: number): Promise<{ path: string; score: number }[]>;
}

export class SimilarBasesView extends BasesView {
  override type = SIMILAR_BASES_VIEW_TYPE;
  private generation = 0;

  constructor(controller: QueryController, private readonly containerEl: HTMLElement, private readonly deps: SimilarViewDeps) {
    super(controller);
  }

  override onload(): void {
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => void this.refresh()));
  }

  onDataUpdated(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const generation = ++this.generation;
    const active = this.app.workspace.getActiveFile()?.path ?? null;
    const anchor = isNoteAnchor(active) ? active : null;
    const semanticEnabled = this.deps.semanticEnabled();
    const related = semanticEnabled && anchor ? await this.deps.related(anchor, NEIGHBOUR_POOL) : [];
    if (generation !== this.generation) return;
    const entries = this.data.data;
    const byPath = new Map(entries.map((e) => [e.file.path, e]));
    const limitOption = Number(this.config.get("limit"));
    const limit = Number.isFinite(limitOption) && limitOption > 0 ? limitOption : DEFAULT_LIMIT;
    const ranked = anchor ? rankWithinBase(related, new Set(byPath.keys()), anchor, limit) : [];
    const state = similarViewState({ semanticEnabled, anchorPath: anchor, relatedCount: related.length, rankedCount: ranked.length });

    this.containerEl.empty();
    const root = this.containerEl.createDiv({ cls: "cc-similar" });
    if (state !== "ready" || !anchor) {
      root.createDiv({ cls: "cc-similar-empty", text: SIMILAR_VIEW_MESSAGES[state === "ready" ? "no-note" : state] });
      return;
    }
    const order = this.config.getOrder();
    for (const hit of ranked) {
      const entry = byPath.get(hit.path);
      if (!entry) continue;
      const row = root.createDiv({ cls: "cc-similar-row" });
      const link = row.createEl("a", { cls: "cc-similar-link", text: entry.file.basename });
      link.addEventListener("click", (event) => {
        event.preventDefault();
        void this.app.workspace.openLinkText(hit.path, anchor);
      });
      row.createSpan({ cls: "cc-similar-score", text: `${Math.round(hit.score * 100)}%` });
      for (const prop of order) {
        const value = entry.getValue(prop)?.toString();
        if (value) row.createSpan({ cls: "cc-similar-prop", text: `${this.config.getDisplayName(prop)}: ${value}` });
      }
    }
  }
}
