import { describe, expect, it } from "vitest";
import { parseResearchRecord } from "../../src/research/parse";

describe("parseResearchRecord", () => {
  it("parses reviewed evidence with a page locator", () => {
    const result = parseResearchRecord({
      path: "Research/Evidence/E1.md",
      frontmatter: {
        title: "E1",
        type: "evidence",
        project: "[[Project]]",
        source: "[[Paper]]",
        locator_kind: "page",
        locator_value: "14",
        review_state: "reviewed",
      },
      body: "> Performance varied by domain.\n\nInterpretation: external validity is limited.",
    });

    expect(result.record).toMatchObject({
      type: "evidence",
      excerpt: "Performance varied by domain.",
      interpretation: "external validity is limited.",
      reviewState: "reviewed",
      locatorKind: "page",
      locatorValue: "14",
    });
    expect(result.issues).toEqual([]);
  });

  it("keeps missing-locator evidence but reports it", () => {
    const result = parseResearchRecord({
      path: "E.md",
      frontmatter: { title: "E", type: "evidence", project: "[[P]]", source: "[[S]]", review_state: "proposed" },
      body: "> excerpt",
    });

    expect(result.record?.type).toBe("evidence");
    expect(result.issues.map((issue) => issue.code)).toContain("missing-locator");
  });

  it("omits records without their identity field and reports invalid values", () => {
    const result = parseResearchRecord({
      path: "Claim.md",
      frontmatter: { title: "Claim", type: "claim", project: "[[P]]", confidence: "certain", review_state: "reviewed" },
      body: "",
    });

    expect(result.record).toBeUndefined();
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["missing-field", "invalid-value"]));
  });

  it("ignores non-research notes and unknown types without throwing", () => {
    expect(parseResearchRecord({ path: "Note.md", body: "plain" })).toEqual({ issues: [] });
    expect(parseResearchRecord({ path: "Odd.md", frontmatter: { type: "odd" }, body: "" })).toEqual({ issues: [] });
  });
});
