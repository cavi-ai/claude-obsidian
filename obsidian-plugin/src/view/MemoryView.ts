import { ItemView, WorkspaceLeaf, TFile, normalizePath, setIcon } from "obsidian";
import type ClaudeCompanionPlugin from "../main";

export const MEMORY_VIEW_TYPE = "claude-memory-view";

/** Sidebar list of captured session digest notes, with open / re-ingest. */
export class MemoryView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: ClaudeCompanionPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return MEMORY_VIEW_TYPE;
  }
  getDisplayText(): string {
    return "Claude session memory";
  }
  getIcon(): string {
    return "brain";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  /** Notes in the memory folder that carry a `claude-session` frontmatter key. */
  private capturedNotes(): TFile[] {
    const dir = normalizePath(this.plugin.settings.memoryFolder);
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(`${dir}/`))
      .filter((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        return fm != null && "claude-session" in fm;
      })
      .sort((a, b) => b.stat.mtime - a.stat.mtime);
  }

  async render(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("cc-memory-view");
    root.createEl("div", { cls: "cc-eyebrow", text: "SESSION MEMORY" });

    const notes = this.capturedNotes();
    if (notes.length === 0) {
      root.createEl("p", {
        cls: "setting-item-description",
        text: "No captured sessions yet. Use “Capture session memory…” to ingest a Claude Code session.",
      });
      return;
    }

    const list = root.createDiv({ cls: "cc-memory-list" });
    for (const f of notes) {
      const row = list.createDiv({ cls: "cc-memory-row" });
      const open = row.createEl("button", { cls: "cc-memory-open", text: f.basename });
      open.addEventListener("click", () => void this.app.workspace.getLeaf(false).openFile(f));

      const sessionId = String(this.app.metadataCache.getFileCache(f)?.frontmatter?.["claude-session"] ?? "");
      const reBtn = row.createEl("button", { cls: "cc-action", attr: { "aria-label": "Re-ingest", title: "Re-ingest" } });
      setIcon(reBtn, "refresh-cw");
      reBtn.addEventListener("click", () => void this.plugin.reingestSession(sessionId));
    }
  }
}
