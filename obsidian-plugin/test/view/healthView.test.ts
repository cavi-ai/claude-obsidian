import { describe, expect, it, vi } from "vitest";
import { App, FakeElement, WorkspaceLeaf } from "obsidian";
import ClaudeCompanionPlugin from "../../src/main";
import { HealthView, type HealthViewDeps } from "../../src/view/HealthView";
import type { HealthReport, HealthSection } from "../../src/health/scan";

const settle = async (turns = 24): Promise<void> => {
  for (let turn = 0; turn < turns; turn++) await Promise.resolve();
};

const section = (over: Partial<HealthSection> & Pick<HealthSection, "id">): HealthSection => ({
  title: over.id, count: 0, severity: "ok", items: [], ...over,
});

function harness(sections: HealthSection[]): { view: HealthView; deps: HealthViewDeps; scan: ReturnType<typeof vi.fn> } {
  const app = new App();
  const plugin = Object.create(ClaudeCompanionPlugin.prototype) as ClaudeCompanionPlugin;
  Object.assign(plugin, { app, settings: {} });
  const scan = vi.fn(async (): Promise<HealthReport> => ({ sections, scannedAt: "2026-10-01T00:00:00.000Z" }));
  const deps: HealthViewDeps = {
    scan,
    safeFixes: vi.fn(() => []),
    openNote: vi.fn(),
    openResearchDesk: vi.fn(async () => undefined),
    buildIndex: vi.fn(async () => undefined),
    catchUpIndex: vi.fn(async () => undefined),
    openInbox: vi.fn(async () => undefined),
    reviewSafeFixes: vi.fn(),
  };
  return { view: new HealthView(new WorkspaceLeaf(app), plugin, deps), deps, scan };
}

const root = (view: HealthView): FakeElement => view.contentEl as unknown as FakeElement;
const text = (el: FakeElement): string => el.textContent + el.children.map(text).join(" ");
const click = (el: FakeElement | null | undefined): void => {
  expect(el).toBeTruthy();
  el!.dispatchEvent({ type: "click" });
};
const button = (view: HealthView, text: string): FakeElement =>
  root(view).querySelectorAll("button").find((b) => b.textContent === text)!;

describe("HealthView", () => {
  it("renders non-ok sections with counts", async () => {
    const { view } = harness([
      section({ id: "links", title: "Broken links", count: 3, severity: "warning", items: [{ path: "a.md", message: "3 broken links: X" }] }),
      section({ id: "ontology", title: "Ontology" }),
    ]);
    await view.onOpen();
    expect(text(root(view).querySelector(".cc-health-links")!)).toContain("Broken links · 3");
    expect(root(view).querySelector(".cc-health-ontology")).toBeNull();
  });

  it("row click opens the note", async () => {
    const { view, deps } = harness([
      section({ id: "links", title: "Broken links", count: 1, severity: "warning", items: [{ path: "a.md", message: "1 broken link: X" }] }),
    ]);
    await view.onOpen();
    click(root(view).querySelector(".cc-health-link"));
    expect(deps.openNote).toHaveBeenCalledWith("a.md");
  });

  it("summary rows are not links", async () => {
    const { view } = harness([
      section({ id: "inbox", title: "Inbox", count: 2, severity: "info", items: [{ path: "", message: "2 clips waiting to be enriched" }] }),
    ]);
    await view.onOpen();
    expect(root(view).querySelector(".cc-health-inbox")).not.toBeNull();
    expect(root(view).querySelector(".cc-health-inbox")!.querySelector(".cc-health-link")).toBeNull();
  });

  it("Refresh rescans", async () => {
    const { view, scan } = harness([section({ id: "inbox", title: "Inbox", count: 1, severity: "info", items: [{ path: "", message: "x" }] })]);
    await view.onOpen();
    click(root(view).querySelector(".cc-health-refresh"));
    await settle();
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it("actions call their deps", async () => {
    const { view, deps } = harness([
      section({ id: "ontology", title: "Ontology", count: 2, severity: "warning", fixable: 2, items: [{ path: "a.md", message: "m" }] }),
      section({ id: "index", title: "Semantic index", count: 1, severity: "info", items: [{ path: "", message: "Semantic index not built yet" }] }),
      section({ id: "inbox", title: "Inbox", count: 1, severity: "info", items: [{ path: "", message: "1 clip waiting to be enriched" }] }),
      section({ id: "research", title: "Research", count: 1, severity: "warning", items: [{ path: "P/e.md", message: "x", project: "P/Project.md" }] }),
    ]);
    await view.onOpen();
    click(button(view, "Review safe fixes (2)"));
    expect(deps.reviewSafeFixes).toHaveBeenCalledTimes(1);
    click(button(view, "Build index"));
    await settle();
    expect(deps.buildIndex).toHaveBeenCalledTimes(1);
    click(button(view, "Open Inbox"));
    expect(deps.openInbox).toHaveBeenCalledTimes(1);
    click(button(view, "Open in Research Desk"));
    expect(deps.openResearchDesk).toHaveBeenCalledWith("P/Project.md");
  });

  it("says everything checks out when all sections are ok", async () => {
    const { view } = harness([section({ id: "links", title: "Broken links" }), section({ id: "inbox", title: "Inbox" })]);
    await view.onOpen();
    expect(root(view).querySelector(".cc-health-ok")?.textContent).toBe("Everything checks out.");
  });

  it("a slow scan never paints over a newer one", async () => {
    const { view, scan } = harness([]);
    let release: (r: HealthReport) => void = () => undefined;
    scan.mockImplementationOnce(() => new Promise<HealthReport>((resolve) => { release = resolve; }));
    const first = view.render();
    await view.render();
    release({ sections: [section({ id: "links", title: "Broken links", count: 9, severity: "warning", items: [] })], scannedAt: "2026-10-01T00:00:00.000Z" });
    await first;
    expect(root(view).querySelector(".cc-health-links")).toBeNull();
  });
});
