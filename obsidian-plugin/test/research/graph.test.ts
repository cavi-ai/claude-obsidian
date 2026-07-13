import { describe, expect, it } from "vitest";
import { buildProjectSnapshot } from "../../src/research/graph";
import type { ResearchRecord } from "../../src/research/types";

const records: ResearchRecord[] = [
  { path: "Projects/P.md", title: "P", type: "research-project", project: "Projects/P.md", question: "Why?", stage: "reason", status: "active" },
  { path: "Sources/S.md", title: "S", type: "research-source", project: "Projects/P.md", sourceKind: "pdf", contentFingerprint: "sha256:new" },
  { path: "Evidence/E1.md", title: "E1", type: "evidence", project: "Projects/P.md", source: "Sources/S.md", locatorKind: "page", locatorValue: "4", excerpt: "Result", reviewState: "reviewed", sourceFingerprint: "sha256:new" },
  { path: "Claims/C.md", title: "C", type: "claim", project: "Projects/P.md", proposition: "Effect", confidence: "high", reviewState: "reviewed", supports: ["Evidence/E1.md"], challenges: [], contextualizes: [], limitations: [] },
];

describe("buildProjectSnapshot", () => {
  it("reconstructs typed relationships and trusted support", () => {
    const snapshot = buildProjectSnapshot("Projects/P.md", records, []);
    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.claims[0]?.supporting).toEqual(["Evidence/E1.md"]);
    expect(snapshot.claims[0]?.trustedSupportCount).toBe(1);
    expect(snapshot.health).toEqual({ claimCount: 1, trustedSupportCount: 1, supportedClaimCount: 1 });
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("does not trust stale reviewed evidence but permits legacy missing fingerprints", () => {
    const stale = records.map((record) => record.type === "evidence" ? { ...record, sourceFingerprint: "sha256:old" } : record) as ResearchRecord[];
    expect(buildProjectSnapshot("Projects/P.md", stale, []).claims[0]?.trustedSupportCount).toBe(0);
    const legacy = records.map((record) => record.type === "evidence" ? { ...record, sourceFingerprint: undefined } : record) as ResearchRecord[];
    expect(buildProjectSnapshot("Projects/P.md", legacy, []).claims[0]?.trustedSupportCount).toBe(1);
  });

  it("keeps the first duplicate path and records a deterministic issue", () => {
    const duplicate = { ...records[1]!, title: "Duplicate" } as ResearchRecord;
    const snapshot = buildProjectSnapshot("Projects/P.md", [...records, duplicate], []);
    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.sources[0]?.title).toBe("S");
    expect(snapshot.issues).toContainEqual(expect.objectContaining({ path: "Sources/S.md", code: "invalid-value" }));
  });
});
