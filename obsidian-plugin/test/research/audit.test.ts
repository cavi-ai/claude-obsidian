import { describe, expect, it } from "vitest";
import { auditProject } from "../../src/research/audit";
import { buildProjectSnapshot } from "../../src/research/graph";
import type { ResearchRecord } from "../../src/research/types";

function project(records: ResearchRecord[]) {
  const root: ResearchRecord = { path: "Projects/P.md", title: "P", type: "research-project", project: "Projects/P.md", question: "Why?", stage: "reason", status: "active" };
  return buildProjectSnapshot("Projects/P.md", [root, ...records], []);
}

describe("auditProject", () => {
  it("explains unreviewed, unsupported, and unused records in stable order", () => {
    const findings = auditProject(project([
      { path: "Sources/S.md", title: "S", type: "research-source", project: "Projects/P.md", sourceKind: "pdf" },
      { path: "Evidence/E.md", title: "E", type: "evidence", project: "Projects/P.md", source: "Sources/S.md", locatorKind: "page", locatorValue: "2", excerpt: "X", reviewState: "proposed" },
      { path: "Claims/C.md", title: "C", type: "claim", project: "Projects/P.md", proposition: "X", confidence: "low", reviewState: "proposed", supports: [], challenges: [], contextualizes: [], limitations: [] },
    ]));
    expect(findings.map(({ code }) => code)).toEqual(["unsupported-claim", "unreviewed-evidence", "unused-evidence"]);
    expect(findings.every(({ explanation, repair }) => explanation.length > 0 && repair.length > 0)).toBe(true);
  });

  it("treats challenging-only claims as unsupported", () => {
    const findings = auditProject(project([
      { path: "Sources/S.md", title: "S", type: "research-source", project: "Projects/P.md", sourceKind: "web" },
      { path: "Evidence/E.md", title: "E", type: "evidence", project: "Projects/P.md", source: "Sources/S.md", locatorKind: "section", locatorValue: "Results", excerpt: "X", reviewState: "reviewed" },
      { path: "Claims/C.md", title: "C", type: "claim", project: "Projects/P.md", proposition: "X", confidence: "low", reviewState: "proposed", supports: [], challenges: ["Evidence/E.md"], contextualizes: [], limitations: [] },
    ]));
    expect(findings.map(({ code }) => code)).toContain("unsupported-claim");
    expect(findings.map(({ code }) => code)).not.toContain("unused-evidence");
  });

  it("reports missing sources, locators, and stale captures", () => {
    const findings = auditProject(project([
      { path: "Sources/S.md", title: "S", type: "research-source", project: "Projects/P.md", sourceKind: "web", contentFingerprint: "new" },
      { path: "Evidence/Missing.md", title: "Missing", type: "evidence", project: "Projects/P.md", source: "Sources/Nope.md", excerpt: "X", reviewState: "reviewed" },
      { path: "Evidence/Stale.md", title: "Stale", type: "evidence", project: "Projects/P.md", source: "Sources/S.md", locatorKind: "paragraph", locatorValue: "3", excerpt: "Y", reviewState: "reviewed", sourceFingerprint: "old" },
      { path: "Claims/C.md", title: "C", type: "claim", project: "Projects/P.md", proposition: "X", confidence: "low", reviewState: "proposed", supports: ["Evidence/Stale.md"], challenges: [], contextualizes: [], limitations: [] },
    ]));
    expect(findings.map(({ code }) => code)).toEqual(expect.arrayContaining(["broken-reference", "missing-locator", "stale-evidence", "unsupported-claim"]));
  });
});
