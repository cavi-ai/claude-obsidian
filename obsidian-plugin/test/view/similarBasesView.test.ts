import { describe, expect, it, vi } from "vitest";
import { App, TFile } from "obsidian";
import { SimilarBasesView } from "../../src/view/SimilarBasesView";
import { FakeElement } from "../fakes/obsidian";

function entry(path: string, status: string) {
  const file = new TFile(path, "", 0);
  return { file, getValue: (p: string) => (p === "note.status" ? { toString: () => status } : null) };
}

function makeView(opts: { active: string | null; related: (p: string, k: number) => Promise<{ path: string; score: number }[]>; semantic?: boolean }) {
  const el = new FakeElement("div");
  const view = new SimilarBasesView({} as never, el as never, { semanticEnabled: () => opts.semantic ?? true, related: opts.related });
  const app = new App();
  const openLinkText = vi.fn();
  Object.assign(app.workspace, { getActiveFile: () => (opts.active ? { path: opts.active } : null), openLinkText, on: () => ({}) });
  view.app = app as never;
  view.config = { get: (k: string) => (k === "limit" ? 2 : undefined), getOrder: () => ["note.status"], getDisplayName: () => "Status" };
  view.data = { data: [entry("A.md", "open"), entry("B.md", "done"), entry("C.md", "open"), entry("D.md", "open")] } as never;
  return { view, el, openLinkText };
}

describe("SimilarBasesView", () => {
  it("renders base members ranked by similarity with percent and ordered properties, capped by the limit option", async () => {
    const { view, el, openLinkText } = makeView({ active: "A.md", related: async () => [{ path: "C.md", score: 0.91 }, { path: "Out.md", score: 0.9 }, { path: "B.md", score: 0.5 }, { path: "D.md", score: 0.4 }] });
    await view.refresh();
    const rows = el.querySelectorAll(".cc-similar-row");
    expect(rows.map((r) => r.querySelector(".cc-similar-link")?.textContent)).toEqual(["C", "B"]);
    expect(rows[0]?.querySelector(".cc-similar-score")?.textContent).toBe("91%");
    expect(rows[0]?.querySelector(".cc-similar-prop")?.textContent).toBe("Status: open");
    rows[0]?.querySelector(".cc-similar-link")?.dispatchEvent({ type: "click", preventDefault() {} });
    expect(openLinkText).toHaveBeenCalledWith("C.md", "A.md");
  });

  it("asks for a note when the active file is the .base itself", async () => {
    const related = vi.fn(async () => []);
    const { view, el } = makeView({ active: "Books.base", related });
    await view.refresh();
    expect(el.querySelector(".cc-similar-empty")?.textContent).toContain("Open a note");
    expect(related).not.toHaveBeenCalled();
  });

  it("shows the semantic-off state without calling related", async () => {
    const related = vi.fn(async () => []);
    const { view, el } = makeView({ active: "A.md", related, semantic: false });
    await view.refresh();
    expect(el.querySelector(".cc-similar-empty")?.textContent).toContain("Turn on semantic search");
    expect(related).not.toHaveBeenCalled();
  });

  it("drops a stale result when a newer refresh started first", async () => {
    let releaseFirst: (v: { path: string; score: number }[]) => void = () => {};
    const calls: string[] = [];
    let active = "A.md";
    const related = vi.fn((p: string) => {
      calls.push(p);
      return p === "A.md" ? new Promise<{ path: string; score: number }[]>((r) => { releaseFirst = r; }) : Promise.resolve([{ path: "D.md", score: 0.6 }]);
    });
    const { view, el } = makeView({ active: "A.md", related });
    Object.assign(view.app.workspace, { getActiveFile: () => ({ path: active }) });
    const first = view.refresh();
    active = "B.md";
    await view.refresh();
    releaseFirst([{ path: "C.md", score: 0.9 }]);
    await first;
    expect(calls).toEqual(["A.md", "B.md"]);
    expect(el.querySelectorAll(".cc-similar-link").map((l) => l.textContent)).toEqual(["D"]);
  });
});
