import { describe, expect, it } from "vitest";
import { WorkspaceLeaf } from "obsidian";
import type { ResearchRepository } from "../../src/research/repository";
import { RESEARCH_WORKBENCH_VIEW_TYPE, ResearchWorkbenchView } from "../../src/view/ResearchWorkbenchView";

const snapshot = {
  project: { path: "Research/P/Project.md", title: "Project P", question: "Why?", stage: "reason", status: "active" },
  sources: [{ path: "Research/P/Sources/S.md", title: "Source S" }], evidence: [], claims: [], questions: [], documents: [], issues: [],
  health: { claimCount: 0, trustedSupportCount: 0, supportedClaimCount: 0 },
};

function elements(view: ResearchWorkbenchView, selector: string): any[] { return [...view.contentEl.querySelectorAll(selector)]; }

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

  it("renders distinct empty, loaded, and sanitized load-error states", async () => {
    const empty = new ResearchWorkbenchView(new WorkspaceLeaf(), { loadProject: async () => snapshot } as never);
    await empty.render();
    expect(elements(empty, "h3").map(({ textContent }) => textContent)).toContain("No research project selected");

    const loaded = new ResearchWorkbenchView(new WorkspaceLeaf(), { loadProject: async () => snapshot } as never);
    await loaded.setProjectPath(snapshot.project.path);
    expect(elements(loaded, "h2").map(({ textContent }) => textContent)).toContain("Project P");
    expect(elements(loaded, ".cc-research-health-metric")).toHaveLength(4);
    expect(elements(loaded, ".cc-research-actions")[0]?.children.map(({ textContent }: any) => textContent)).toEqual(expect.arrayContaining(["Create project", "Add source", "Run audit"]));

    const broken = new ResearchWorkbenchView(new WorkspaceLeaf(), { loadProject: async () => { throw new Error("bad\nsecret\tmetadata Bearer token-value"); } } as never);
    await broken.setProjectPath(snapshot.project.path);
    expect(elements(broken, ".cc-research-project-path")[0]?.textContent).toBe(snapshot.project.path);
    expect(elements(broken, ".cc-research-error")[0]?.textContent).toBe("bad secret metadata [redacted]");
    expect(elements(broken, "h3").map(({ textContent }) => textContent)).not.toContain("No research project selected");
    expect(elements(broken, "button").map(({ textContent }) => textContent)).toContain("Run audit");
  });

  it("implements linked tabpanels, roving tabindex, and keyboard tab navigation", async () => {
    const view = new ResearchWorkbenchView(new WorkspaceLeaf(), { loadProject: async () => snapshot } as never);
    await view.setProjectPath(snapshot.project.path);
    let tabs = elements(view, '[role="tab"]');
    expect(tabs).toHaveLength(6);
    expect(tabs[0].getAttribute("tabindex")).toBe("0");
    expect(tabs.slice(1).every((tab) => tab.getAttribute("tabindex") === "-1")).toBe(true);
    const panel = elements(view, '[role="tabpanel"]')[0];
    expect(tabs[0].getAttribute("aria-controls")).toBe(panel.getAttribute("id"));
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0].getAttribute("id"));
    tabs[0].dispatchEvent({ type: "keydown", key: "End", preventDefault() {} });
    await Promise.resolve(); await Promise.resolve();
    tabs = elements(view, '[role="tab"]');
    expect(tabs[5].getAttribute("tabindex")).toBe("0");
    expect(tabs[5].getAttribute("aria-selected")).toBe("true");
  });
});
