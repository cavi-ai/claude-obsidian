import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { parseResearchRecord } from "../../src/research/parse";
import { renderResearchRecord } from "../../src/research/render";
import type { ResearchRecord } from "../../src/research/types";

function parseRendered(path: string, markdown: string) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error("rendered note lacks frontmatter");
  return parseResearchRecord({ path, frontmatter: parse(match[1] ?? ""), body: (match[2] ?? "").trim() });
}

const records: ResearchRecord[] = [
  { path: "Projects/P.md", title: "P", type: "research-project", project: "[[Projects/P]]", question: "What works?", audience: "Researchers", stage: "gather", status: "active" },
  { path: "Sources/S.md", title: "S", type: "research-source", project: "[[Projects/P]]", sourceKind: "doi", canonicalId: "10.1/x", url: "https://example.test", asset: "[[Files/S.pdf]]", contentFingerprint: "sha256:abc" },
  { path: "Evidence/E.md", title: "E", type: "evidence", project: "[[Projects/P]]", source: "[[Sources/S]]", locatorKind: "page", locatorValue: "14", excerpt: "Measured effect.\nAcross cohorts.", interpretation: "Useful result.", reviewState: "reviewed", model: "claude" },
  { path: "Claims/C.md", title: "C", type: "claim", project: "[[Projects/P]]", proposition: "The effect generalizes.", confidence: "moderate", reviewState: "proposed", supports: ["[[Evidence/E1]]"], challenges: ["[[Evidence/E2]]"], contextualizes: ["[[Evidence/E3]]"], limitations: ["Small sample"] },
  { path: "Questions/Q.md", title: "Q", type: "research-question", project: "[[Projects/P]]", question: "Does it generalize?", status: "open", about: "[[Claims/C]]" },
  { path: "Documents/D.md", title: "D", type: "research-document", project: "[[Projects/P]]", documentKind: "outline", claims: ["[[Claims/C]]"] },
];

describe("renderResearchRecord", () => {
  it("uses canonical locator keys and quoted evidence excerpts", () => {
    const rendered = renderResearchRecord(records[2]!);
    expect(rendered).toContain("locator_kind: page");
    expect(rendered).toContain("locator_value: 14");
    expect(rendered).not.toContain("locatorKind:");
    expect(rendered).toContain("> Measured effect.\n> Across cohorts.");
  });

  it.each(records.map((record) => [record.type, record] as const))("round-trips %s records", (_type, record) => {
    const result = parseRendered(record.path, renderResearchRecord(record));
    expect(result.issues).toEqual([]);
    expect(result.record).toEqual(record);
  });
});
