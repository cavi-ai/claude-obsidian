import { describe, expect, it, vi } from "vitest";
import { ResearchTools } from "../../src/research/tools";

function repository() {
  return {
    loadProject: vi.fn().mockResolvedValue({ project: { path: "P/Project.md", title: "P" }, sources: [], evidence: [], claims: [], questions: [], documents: [], issues: [], health: { claimCount: 0, trustedSupportCount: 0, supportedClaimCount: 0 } }),
    createEvidence: vi.fn().mockResolvedValue({ path: "P/Evidence/E.md" }),
    createClaim: vi.fn().mockResolvedValue({ path: "P/Claims/C.md" }),
    linkClaimEvidence: vi.fn().mockResolvedValue(undefined),
    createOutline: vi.fn().mockResolvedValue({ path: "P/Documents/Outline.md" }),
  };
}

describe("ResearchTools", () => {
  it("defines compact read/audit tools and write-gated research mutations", () => {
    const names = new ResearchTools(repository() as never).definitions().map(({ name }) => name);
    expect(names).toEqual(expect.arrayContaining(["research_project_read", "research_evidence_create", "research_claim_create", "research_claim_link", "research_audit", "research_outline_create"]));
  });

  it.each([
    [{ project: "P/Project.md", source: "P/Sources/S.md", title: "E", excerpt: "" }, "excerpt"],
    [{ project: "P/Project.md", source: "P/Sources/S.md", title: "E", excerpt: "x", review_state: "reviewed" }, "locator"],
    [{ project: "P/Project.md", source: "P/Sources/S.md", title: "E", excerpt: "x", review_state: "invented" }, "review state"],
  ])("refuses invalid evidence input before repository mutation", async (args, message) => {
    const repo = repository();
    await expect(new ResearchTools(repo as never).call("research_evidence_create", args)).rejects.toThrow(new RegExp(message, "i"));
    expect(repo.createEvidence).not.toHaveBeenCalled();
  });

  it("delegates evidence creation and lets the repository enforce project source membership", async () => {
    const repo = repository();
    await new ResearchTools(repo as never).call("research_evidence_create", { project: "P/Project.md", source: "Other/S.md", title: "E", excerpt: "x" });
    expect(repo.createEvidence).toHaveBeenCalledWith(expect.objectContaining({ source: "Other/S.md", reviewState: "proposed" }));
  });

  it("returns compact project and audit JSON", async () => {
    const tools = new ResearchTools(repository() as never);
    expect(JSON.parse(await tools.call("research_project_read", { project: "P/Project.md" }))).toEqual(expect.objectContaining({ project: { path: "P/Project.md", title: "P" }, health: expect.any(Object) }));
    expect(JSON.parse(await tools.call("research_audit", { project: "P/Project.md" }))).toEqual([]);
  });
});
