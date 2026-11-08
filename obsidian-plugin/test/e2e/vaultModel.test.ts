import { describe, expect, it } from "vitest";
import { vaultModelIssues } from "../../e2e/rig/vaultModel";

const expected = { directories: ["Notes"], files: { "Notes/Alpha.md": "march-content-sha256" } };

describe("native fixture vault synchronization", () => {
  it("keeps deletion pending while a recorded folder or file remains in the native model", () => {
    expect(vaultModelIssues("removed", expected, { paths: ["Notes", "Notes/Alpha.md"], hashes: {} })).toEqual([
      { path: "Notes", problem: "still-present" },
      { path: "Notes/Alpha.md", problem: "still-present" },
    ]);
    expect(vaultModelIssues("removed", expected, { paths: ["Notes"], hashes: {} })).toEqual([{ path: "Notes", problem: "still-present" }]);
  });

  it("acknowledges deletion only after the recorded paths are absent", () => {
    expect(vaultModelIssues("removed", expected, { paths: [""], hashes: {} })).toEqual([]);
  });

  it("refuses to use seeded files that exist on disk but are missing from the native model", () => {
    expect(vaultModelIssues("seeded", expected, { paths: ["Notes"], hashes: {} })).toEqual([{ path: "Notes/Alpha.md", problem: "missing" }]);
  });

  it("requires the recorded folder as well as its file", () => {
    expect(vaultModelIssues("seeded", expected, { paths: ["Notes/Alpha.md"], hashes: { "Notes/Alpha.md": "march-content-sha256" } })).toEqual([{ path: "Notes", problem: "missing" }]);
  });

  it("rejects stale or unreadable native contents even when the path is loaded", () => {
    for (const hashes of [{ "Notes/Alpha.md": "november-content-sha256" }, {}]) {
      expect(vaultModelIssues("seeded", expected, { paths: ["Notes", "Notes/Alpha.md"], hashes })).toEqual([{ path: "Notes/Alpha.md", problem: "content-mismatch" }]);
    }
  });

  it("allows use after every recorded path and native content hash matches", () => {
    expect(vaultModelIssues("seeded", expected, { paths: ["", "Notes", "Notes/Alpha.md"], hashes: { "Notes/Alpha.md": "march-content-sha256" } })).toEqual([]);
  });
});
