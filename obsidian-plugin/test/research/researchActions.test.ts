import { describe, expect, it, vi } from "vitest";
import { getLastOpenedModal, WorkspaceLeaf } from "obsidian";
import { buildProjectSnapshot } from "../../src/research/graph";
import type { ResearchRecord } from "../../src/research/types";
import { ResearchActions } from "../../src/view/research/actions";
import { ProjectCreateModal } from "../../src/view/research/projectCreateModal";

const project = { path: "R/P/Project.md", title: "P", type: "research-project", project: "R/P/Project.md", question: "Does it?", stage: "read", status: "active" } as const;
const source: ResearchRecord = { path: "R/P/Sources/S.md", title: "S", type: "research-source", project: project.path, sourceKind: "web", contentFingerprint: "new", capturedContent: "Intro text. Different wording now. Outro text." };
const ev = (name: string, extra: Record<string, unknown> = {}): ResearchRecord => ({ path: `R/P/Evidence/${name}.md`, title: name, type: "evidence", project: project.path, source: source.path, excerpt: `Passage ${name}`, locatorKind: "page", locatorValue: "4", reviewState: "reviewed", sourceFingerprint: "new", ...extra }) as ResearchRecord;
const claim = (name: string, extra: Record<string, unknown> = {}): ResearchRecord => ({ path: `R/P/Claims/${name}.md`, title: name, type: "claim", project: project.path, proposition: "It does.", confidence: "moderate", reviewState: "proposed", supports: [], challenges: [], contextualizes: [], limitations: [], ...extra }) as ResearchRecord;
const snap = (records: ResearchRecord[]) => buildProjectSnapshot(project.path, [project, source, ...records], []);

function setup(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const repository = {
    updateEvidenceLocator: vi.fn(async (...a: unknown[]) => { calls.push(`locator:${a[1]}:${a[2]}`); }),
    updateEvidenceInterpretation: vi.fn(async () => { calls.push("interpretation"); }),
    reviewEvidence: vi.fn(async (_p: string, state: string) => { calls.push(`review:${state}`); }),
    linkClaimEvidence: vi.fn(async (...a: unknown[]) => { calls.push(`link:${a[2]}:${a[3]}`); }),
    reviewClaim: vi.fn(async (...a: unknown[]) => { calls.push(`claim:${a[1]}:${a[2] ?? ""}`); }),
    createClaim: vi.fn(async () => ({ path: "R/P/Claims/New.md" })),
  };
  const changed = vi.fn(async () => undefined);
  const actions = new ResearchActions({ app: new WorkspaceLeaf().app, repository: repository as never, openPath: async () => undefined, changed, openWorkbench: async () => undefined, selectProject: async () => undefined, ...overrides } as never);
  return { actions, repository, calls, changed };
}
const modal = () => getLastOpenedModal()!;
const all = (selector: string): any[] => [...modal().contentEl.querySelectorAll(selector)];
const byLabel = (label: string) => ["input", "textarea", "select"].flatMap((tag) => all(tag)).find((el) => el.getAttribute("aria-label") === label);
const button = (text: string) => all("button").find((el) => el.textContent === text);
const click = (el: any) => el.dispatchEvent({ type: "click" });
const type = (el: any, value: string) => { el.value = value; el.dispatchEvent({ type: "input" }); };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

describe("evidence review", () => {
  it("opens the passage the Desk named, not the first proposed one", () => {
    const { actions } = setup();
    actions.reviewEvidence(snap([ev("First", { reviewState: "proposed" }), ev("Named", { reviewState: "reviewed", sourceFingerprint: "old" })]), "R/P/Evidence/Named.md");
    expect(all("h2")[0].textContent).toBe("Check Named");
  });

  it("shows the changed-source banner and the passage's absence", () => {
    const { actions } = setup();
    actions.reviewEvidence(snap([ev("Named", { sourceFingerprint: "old" })]), "R/P/Evidence/Named.md");
    const texts = all("p").map((el) => el.textContent);
    expect(texts).toContain("The source changed since this was checked. Confirm the passage still says this.");
    expect(texts).toContain("This passage no longer appears in the source.");
  });

  it("shows surrounding text when the passage is still in the source", () => {
    const { actions } = setup();
    actions.reviewEvidence(snap([ev("Named", { sourceFingerprint: "old", excerpt: "Different wording now." })]), "R/P/Evidence/Named.md");
    expect(all("p").map((el) => el.textContent).some((text) => text?.includes("Intro text. Different wording now. Outro text."))).toBe(true);
  });

  it("Keep writes a changed locator before reviewing", async () => {
    const { actions, calls, changed } = setup();
    actions.reviewEvidence(snap([ev("E", { reviewState: "proposed", locatorKind: undefined, locatorValue: undefined })]));
    byLabel("Locator type").value = "section";
    type(byLabel("Locator value"), "Methods");
    click(button("Keep"));
    await settle();
    expect(calls).toEqual(["locator:section:Methods", "review:reviewed"]);
    expect(changed).toHaveBeenCalled();
  });

  it("drafts the interpretation on open without overwriting typed text", async () => {
    let resolve!: (value: string) => void;
    const rewriteText = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const { actions } = setup({ rewriteText, researchLabel: () => "Claude Code · sonnet" });
    actions.reviewEvidence(snap([ev("E", { reviewState: "proposed" })]));
    expect(all("p").map((el) => el.textContent)).toContain("Drafting with Claude Code · sonnet…");
    type(byLabel("Evidence interpretation"), "My own reading");
    resolve("Drafted reading");
    await settle();
    expect(byLabel("Evidence interpretation").value).toBe("My own reading");
  });
});

describe("claim review", () => {
  it("links checked passages then reviews with the limitation", async () => {
    const { actions, calls } = setup();
    actions.reviewClaim(snap([ev("A"), ev("B"), claim("C", { challenges: ["R/P/Evidence/B.md"] })]), "R/P/Claims/C.md");
    expect(all("h4").map((el) => el.textContent)).toEqual(expect.arrayContaining(["Challenges", "Link a passage that supports it"]));
    click(byLabel("Link A"));
    byLabel("Link A").checked = true;
    type(byLabel("What this claim doesn't cover"), "Adults only");
    click(button("Mark reviewed"));
    await settle();
    expect(calls).toEqual(["link:R/P/Evidence/A.md:supports", "claim:reviewed:Adults only"]);
  });

  it("drafts the limitation when challenged and none is written", async () => {
    const rewriteText = vi.fn(async () => "Does not cover children.");
    const { actions } = setup({ rewriteText });
    actions.reviewClaim(snap([ev("B"), claim("C", { challenges: ["R/P/Evidence/B.md"] })]), "R/P/Claims/C.md");
    await settle();
    expect(byLabel("What this claim doesn't cover").value).toBe("Does not cover children.");
  });
});

describe("claim creation", () => {
  const suggestion = JSON.stringify({ title: "Drafted title", proposition: "Drafted proposition.", confidence: "high", relations: [{ evidence: "R/P/Evidence/A.md", relation: "supports" }] });

  it("fills only the fields the user has not touched", async () => {
    let resolve!: (value: string) => void;
    const completeResearch = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const { actions } = setup({ completeResearch, researchLabel: () => "Claude Code · sonnet" });
    actions.createClaim(snap([ev("A")]));
    expect(all("p").map((el) => el.textContent)).toContain("Drafting a claim with Claude Code · sonnet…");
    type(byLabel("Claim title"), "My title");
    resolve(suggestion);
    await settle();
    expect(byLabel("Claim title").value).toBe("My title");
    expect(byLabel("Proposition").value).toBe("Drafted proposition.");
    expect(byLabel("Claim confidence").value).toBe("high");
    expect(byLabel("A supports").checked).toBe(true);
  });

  it("falls back to a manual form when drafting fails", async () => {
    const completeResearch = vi.fn(async () => { throw new Error("Research AI is off."); });
    const { actions } = setup({ completeResearch });
    actions.createClaim(snap([ev("A")]));
    await settle();
    expect(all("p").map((el) => el.textContent)).toEqual(expect.arrayContaining(["Couldn't draft a claim. Fill it in below.", "Research AI is off."]));
    expect(button("Suggest again")).toBeDefined();
  });

  it("creates what the user filled in", async () => {
    const { actions, repository } = setup();
    actions.createClaim(snap([ev("A")]));
    type(byLabel("Claim title"), "Mine");
    type(byLabel("Proposition"), "It does.");
    byLabel("A supports").checked = true;
    click(button("Create claim"));
    await settle();
    expect(repository.createClaim).toHaveBeenCalledWith(expect.objectContaining({ title: "Mine", supports: ["R/P/Evidence/A.md"] }));
  });
});

describe("project creation", () => {
  it("drafts the question when the title loses focus, never over typed text", async () => {
    const rewriteText = vi.fn(async () => "Does X affect Y?");
    new ProjectCreateModal(new WorkspaceLeaf().app, async () => undefined, rewriteText).open();
    byLabel("Project title").value = "X and Y";
    byLabel("Project title").dispatchEvent({ type: "blur" });
    await settle();
    expect(byLabel("Research question").value).toBe("Does X affect Y?");
    byLabel("Research question").value = "Typed";
    byLabel("Project title").dispatchEvent({ type: "blur" });
    await settle();
    expect(rewriteText).toHaveBeenCalledTimes(1);
    expect(byLabel("Research question").value).toBe("Typed");
  });
});

describe("desk actions", () => {
  it("dispatches each run kind", async () => {
    const openWorkbench = vi.fn(async () => undefined);
    const openPath = vi.fn(async () => undefined);
    const { actions } = setup({ openWorkbench, openPath });
    const snapshot = snap([]);
    await actions.run({ run: "continue-draft", path: "D.md" }, snapshot);
    await actions.run({ run: "audit" }, snapshot);
    await actions.run({ run: "open-record", path: "X.md" }, snapshot);
    await actions.run({ run: "extract-evidence", path: "R/P/Sources/S.md" }, snapshot);
    expect(openWorkbench.mock.calls).toEqual([[project.path, "Draft", "D.md"], [project.path, "Audit"], [project.path, "Evidence", "R/P/Sources/S.md"]]);
    expect(openPath).toHaveBeenCalledWith("X.md");
  });
});
