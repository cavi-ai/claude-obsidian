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
});
