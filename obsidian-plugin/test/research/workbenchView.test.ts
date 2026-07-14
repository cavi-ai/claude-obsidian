import { describe, expect, it } from "vitest";
import { WorkspaceLeaf } from "obsidian";
import type { ResearchRepository } from "../../src/research/repository";
import { RESEARCH_WORKBENCH_VIEW_TYPE, ResearchWorkbenchView, replaceResearchProjectPath } from "../../src/view/ResearchWorkbenchView";

const snapshot = {
  project: { path: "Research/P/Project.md", title: "Project P", question: "Why?", stage: "reason", status: "active" },
  sources: [{ path: "Research/P/Sources/S.md", title: "Source S" }], evidence: [], claims: [], questions: [], documents: [], issues: [],
  health: { claimCount: 0, trustedSupportCount: 0, supportedClaimCount: 0 },
};

function elements(view: ResearchWorkbenchView, selector: string): any[] { return [...view.contentEl.querySelectorAll(selector)]; }
function click(element: any): void { element.dispatchEvent({ type: "click" }); }

function intelligenceDependencies(overrides: Record<string, unknown> = {}) {
  let analyzeCalls = 0;
  let cancelCalls = 0;
  return {
    dependencies: {
      narratorMode: () => "current" as const,
      coordinator: {
        stateFor: () => ({ status: "not-analyzed" as const }),
        analyze: async () => { analyzeCalls += 1; return { status: "not-analyzed" as const }; },
        cancel: () => { cancelCalls += 1; },
        subscribe: () => () => undefined,
        ...overrides,
      } as never,
    },
    get analyzeCalls() { return analyzeCalls; },
    get cancelCalls() { return cancelCalls; },
  };
}

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
    expect(tabs).toHaveLength(7);
    expect(tabs[0].getAttribute("tabindex")).toBe("0");
    expect(tabs.slice(1).every((tab) => tab.getAttribute("tabindex") === "-1")).toBe(true);
    const panel = elements(view, '[role="tabpanel"]')[0];
    expect(tabs[0].getAttribute("aria-controls")).toBe(panel.getAttribute("id"));
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0].getAttribute("id"));
    tabs[0].dispatchEvent({ type: "keydown", key: "End", preventDefault() {} });
    await Promise.resolve(); await Promise.resolve();
    tabs = elements(view, '[role="tab"]');
    expect(tabs[6].getAttribute("tabindex")).toBe("0");
    expect(tabs[6].getAttribute("aria-selected")).toBe("true");
  });

  it("renders deterministic intelligence only when selected and refreshes it without implicit model analysis", async () => {
    let current = snapshot;
    const h = intelligenceDependencies();
    const view = new ResearchWorkbenchView(new WorkspaceLeaf(), { loadProject: async () => current } as never, h.dependencies);
    await view.setProjectPath(snapshot.project.path);
    click(elements(view, '[role="tab"]')[6]);
    await Promise.resolve(); await Promise.resolve();
    expect(elements(view, ".cc-intelligence-category")).toHaveLength(4);
    expect(h.analyzeCalls).toBe(0);
    current = { ...snapshot, questions: [{ path: "Q.md", title: "Open", question: "What changed?", status: "open", about: "C.md" }] } as never;
    await view.render();
    expect(elements(view, ".cc-intelligence-finding")).toHaveLength(2);
    expect(h.analyzeCalls).toBe(0);
  });

  it("cancels active intelligence on project replacement and close", async () => {
    const h = intelligenceDependencies();
    const view = new ResearchWorkbenchView(new WorkspaceLeaf(), { loadProject: async () => snapshot } as never, h.dependencies);
    await view.setProjectPath("Research/One/Project.md");
    await view.setProjectPath("Research/Two/Project.md");
    await view.onClose();
    expect(h.cancelCalls).toBe(2);
  });

  it("uses one replacement helper to cancel every changed project identity", () => {
    let cancels = 0;
    expect(replaceResearchProjectPath("Research/One/Project.md", "[[Research/Two/Project.md|Two]]", () => { cancels += 1; }))
      .toBe("Research/Two/Project.md");
    expect(replaceResearchProjectPath("Research/Two/Project.md", "Research/Two/Project.md", () => { cancels += 1; }))
      .toBe("Research/Two/Project.md");
    expect(cancels).toBe(1);
  });
});
