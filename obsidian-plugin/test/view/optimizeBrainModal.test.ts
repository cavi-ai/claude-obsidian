import { App, FakeElement, getNoticeMessages } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import type { ApplyResult } from "../../src/optimize/controller";
import type { MergeCandidate } from "../../src/optimize/tagScan";
import { OptimizeBrainModal } from "../../src/view/OptimizeBrainModal";

const settle = async (turns = 24): Promise<void> => {
  for (let turn = 0; turn < turns; turn++) await Promise.resolve();
};

const candidates: MergeCandidate[] = [
  { id: "llm|llms", from: "llms", to: "llm", evidence: ["plural"], score: 1, fromCount: 2, toCount: 9 },
  { id: "kube|kubes", from: "kubes", to: "kube", evidence: ["typo"], score: 0.6, fromCount: 1, toCount: 4 },
];
const result: ApplyResult = { merges: 1, notes: 2, inlineSkipped: 0, failed: [], unchanged: 0, dropped: [], orders: [], runNote: null };

const allText = (el: FakeElement): string => [el.textContent, ...el.children.map(allText)].join("\n");
const button = (root: FakeElement, text: string): FakeElement => root.querySelectorAll("button").find((b) => b.textContent === text)!;
const setup = (list = candidates) => {
  const actions = { apply: vi.fn(async () => result), dismiss: vi.fn(async () => undefined) };
  const onDone = vi.fn();
  const modal = new OptimizeBrainModal(new App(), list, actions, onDone);
  modal.onOpen();
  return { modal, actions, onDone, root: () => modal.contentEl as unknown as FakeElement };
};

describe("OptimizeBrainModal", () => {
  it("lists rows with counts and evidence, plural checked and typo unchecked", () => {
    const { modal, root } = setup();
    expect(modal.titleEl.textContent).toBe("Review 2 tag merges");
    expect(allText(root())).toContain("llms (2) → llm (9)");
    const checks = root().querySelectorAll("input") as unknown as Array<FakeElement & { checked: boolean }>;
    expect(checks.map((c) => c.checked)).toEqual([true, false]);
  });

  it("applies only the checked merges, once, then reports the result", async () => {
    const { root, actions, onDone } = setup();
    const checks = root().querySelectorAll("input") as unknown as Array<FakeElement & { checked: boolean }>;
    checks[1]!.checked = true;
    checks[1]!.dispatchEvent({ type: "change" });
    button(root(), "Apply selected").dispatchEvent({ type: "click" });
    button(root(), "Apply selected").dispatchEvent({ type: "click" });
    await settle();
    expect(actions.apply).toHaveBeenCalledTimes(1);
    expect(actions.apply).toHaveBeenCalledWith([{ from: "llms", to: "llm" }, { from: "kubes", to: "kube" }]);
    expect(onDone).toHaveBeenCalledWith(result);
  });

  it("swap flips the direction that gets applied", async () => {
    const { root, actions } = setup();
    button(root(), "Swap").dispatchEvent({ type: "click" });
    button(root(), "Apply selected").dispatchEvent({ type: "click" });
    await settle();
    expect(actions.apply).toHaveBeenCalledWith([{ from: "llm", to: "llms" }]);
  });

  it("dismiss persists through the controller, removes the row, and applies nothing", async () => {
    const { modal, root, actions } = setup();
    button(root(), "Dismiss").dispatchEvent({ type: "click" });
    await settle();
    expect(actions.dismiss).toHaveBeenCalledWith("llm|llms");
    expect(actions.apply).not.toHaveBeenCalled();
    expect(modal.titleEl.textContent).toBe("Review 1 tag merges");
    expect(allText(root())).not.toContain("llms (2)");
  });

  it("cancel and plain close write nothing and report null", async () => {
    const a = setup();
    button(a.root(), "Cancel").dispatchEvent({ type: "click" });
    await settle();
    expect(a.actions.apply).not.toHaveBeenCalled();
    expect(a.onDone).toHaveBeenCalledTimes(1);
    expect(a.onDone).toHaveBeenCalledWith(null);
    const b = setup();
    b.modal.onClose();
    expect(b.onDone).toHaveBeenCalledWith(null);
    expect(b.actions.apply).not.toHaveBeenCalled();
  });

  it("renders the saved-search description line", () => {
    const { root } = setup();
    expect(allText(root())).toContain("Merges rewrite tags in notes. Saved searches, Bases, and queries that name a merged tag are not changed.");
  });

  it("an apply rejection shows a notice and reports null once", async () => {
    const { root, actions, onDone } = setup();
    actions.apply.mockRejectedValueOnce(new Error("boom"));
    button(root(), "Apply selected").dispatchEvent({ type: "click" });
    await settle();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(null);
    expect(getNoticeMessages()).toContain("Tag merge failed: boom").toBe(true);
  });

  it("closing while apply is in flight reports the result once, after it settles", async () => {
    const { root, actions, onDone, modal } = setup();
    let release!: (r: ApplyResult) => void;
    actions.apply.mockImplementationOnce(() => new Promise<ApplyResult>((resolve) => { release = resolve; }));
    button(root(), "Apply selected").dispatchEvent({ type: "click" });
    button(root(), "Cancel").dispatchEvent({ type: "click" });
    modal.onClose();
    expect(onDone).not.toHaveBeenCalled();
    release(result);
    await settle();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(result);
  });

  it("a dismiss rejection shows a notice and keeps the row", async () => {
    const { root, actions, modal } = setup();
    actions.dismiss.mockRejectedValueOnce(new Error("nope"));
    button(root(), "Dismiss").dispatchEvent({ type: "click" });
    await settle();
    expect(modal.titleEl.textContent).toBe("Review 2 tag merges");
    expect(getNoticeMessages()).toContain("Tag dismiss failed: nope").toBe(true);
  });

  it("shows the empty state", () => {
    const { root } = setup([]);
    expect(allText(root())).toContain("No tag merges to review.");
  });
});
