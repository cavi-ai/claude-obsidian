import { describe, expect, it } from "vitest";
import { WorkspaceLeaf } from "obsidian";
import type { ResearchRepository } from "../../src/research/repository";
import { RESEARCH_WORKBENCH_VIEW_TYPE, ResearchWorkbenchView } from "../../src/view/ResearchWorkbenchView";

describe("ResearchWorkbenchView", () => {
  it("registers stable accessible view metadata", () => {
    const repository = { loadProject: () => Promise.reject(new Error("unused")) } as ResearchRepository;
    const view = new ResearchWorkbenchView(new WorkspaceLeaf(), repository);
    expect(view.getViewType()).toBe(RESEARCH_WORKBENCH_VIEW_TYPE);
    expect(view.getDisplayText()).toBe("Research workbench");
    expect(view.getIcon()).toBe("microscope");
  });

  it("normalizes a child record project link before loading", async () => {
    const loaded: string[] = [];
    const repository = { loadProject: (path: string) => { loaded.push(path); return Promise.reject(new Error("stop after routing")); } } as ResearchRepository;
    class RoutingView extends ResearchWorkbenchView {
      override async render(): Promise<void> {
        const path = this.getProjectPath();
        if (path) await repository.loadProject(path).catch(() => undefined);
      }
    }
    const view = new RoutingView(new WorkspaceLeaf(), repository);
    await view.setProjectPath("[[Research/Alpha/Project.md|Alpha]]");
    expect(loaded).toEqual(["Research/Alpha/Project.md"]);
  });
});
