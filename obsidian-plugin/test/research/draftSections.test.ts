import { describe, expect, it } from "vitest";
import { fnv1aHex } from "../../src/hashing";
import {
  applyDraftSection,
  containsReservedMarker,
  convertV1Document,
  normalizeSectionBody,
  parseDraftSections,
  renderManagedDocument,
  validateDocumentCitationKeys,
  type DraftSectionEnvelope,
} from "../../src/research/draftSections";

const drafted: DraftSectionEnvelope = {
  id: "claim-external-validity",
  claimPaths: ["Research/Claims/External validity.md"],
  evidence: [{ path: "Research/Evidence/Domain variation.md", fingerprint: "sha256:source-v1" }],
  citations: [{ key: "smith2025", sourcePath: "Research/Sources/Smith 2025.md" }],
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  generatedAt: "2026-07-14T20:00:00.000Z",
};
const outline = (id: string, claim: string): DraftSectionEnvelope => ({ id, claimPaths: [`Research/Claims/${claim}.md`], evidence: [], citations: [], provider: "companion", model: "evidence-outline-v1", generatedAt: "outline" });

function v1Section(envelope: DraftSectionEnvelope, content: string, acceptedContent = content): string {
  const meta = encodeURIComponent(JSON.stringify(envelope));
  return `<!-- cavi:draft-section version=1 meta=${meta} fingerprint=fnv1a-${fnv1aHex(acceptedContent)} -->\n${content}\n<!-- cavi:draft-section:end id=${envelope.id} -->`;
}

describe("research document format v2", () => {
  it("round-trips clean prose with one provenance block at the end", () => {
    const doc = renderManagedDocument("# Draft", [{ envelope: drafted, heading: "External validity", markdown: "Performance varied by domain [@smith2025]." }]);
    expect(doc).not.toContain("cavi:draft-section");
    expect(doc).toContain("## External validity\n\nPerformance varied by domain [@smith2025].");
    expect(doc.split("```claude-provenance")[0]).not.toMatch(/claimPaths|fnv1a/);
    expect(doc.endsWith("```\n")).toBe(true);
    expect(parseDraftSections(doc)).toEqual({
      format: "v2",
      issues: [],
      sections: [{ envelope: drafted, heading: "External validity", markdown: "Performance varied by domain [@smith2025].", modifiedSinceReview: false }],
    });
  });

  it("flags a hand edit as modified since review", () => {
    const doc = renderManagedDocument("# Draft", [{ envelope: drafted, heading: "External validity", markdown: "Original [@smith2025]." }]);
    expect(parseDraftSections(doc.replace("Original", "Edited")).sections[0]?.modifiedSinceReview).toBe(true);
  });

  it("matches duplicate headings in order", () => {
    const doc = renderManagedDocument("", [
      { envelope: outline("same-a", "A"), heading: "Same", markdown: "first" },
      { envelope: outline("same-b", "B"), heading: "Same", markdown: "second" },
    ]);
    expect(parseDraftSections(doc).sections.map(({ markdown }) => markdown)).toEqual(["first", "second"]);
  });

  it("reports a renamed heading", () => {
    const doc = renderManagedDocument("", [{ envelope: drafted, heading: "External validity", markdown: "Body [@smith2025]." }]);
    const parsed = parseDraftSections(doc.replace("## External validity", "## Renamed"));
    expect(parsed.sections).toEqual([]);
    expect(parsed.issues).toEqual(['Section "External validity" not found — restore the heading or rebuild the outline']);
  });

  it("reports unreadable JSON", () => {
    const doc = renderManagedDocument("", [{ envelope: drafted, heading: "External validity", markdown: "Body [@smith2025]." }]);
    const parsed = parseDraftSections(doc.replace('"version": 2', '"version": 2,,'));
    expect(parsed.format).toBe("v2");
    expect(parsed.issues[0]).toMatch(/^Provenance block is unreadable/);
  });

  it("reports more than one provenance block", () => {
    const doc = renderManagedDocument("", [{ envelope: drafted, heading: "External validity", markdown: "Body [@smith2025]." }]);
    expect(parseDraftSections(`${doc}\n${doc}`).issues).toEqual(["Document has more than one provenance block"]);
  });

  it("sanitizes headings", () => {
    const doc = renderManagedDocument("", [{ envelope: outline("c-sharp", "C"), heading: "C# vs.\nF#  ", markdown: "Body" }]);
    expect(doc).toContain("## C# vs. F#\n\nBody");
    expect(parseDraftSections(doc).sections[0]?.heading).toBe("C# vs. F#");
  });

  it("normalizes model headings and leaves fenced code alone", () => {
    expect(normalizeSectionBody("## Title\n\nIntro\n\n# Big\n\n## Sub\n\n```py\n# comment\n## not heading\n```\n\n### Keep"))
      .toBe("Intro\n\n### Big\n\n### Sub\n\n```py\n# comment\n## not heading\n```\n\n### Keep");
  });

  it("rejects reserved markers", () => {
    expect(containsReservedMarker("<!-- cavi:draft-section")).toBe(true);
    expect(containsReservedMarker("x\n```claude-provenance\n{}")).toBe(true);
    expect(() => normalizeSectionBody("text ```claude-provenance")).toThrow(/reserved Companion marker/);
  });

  it("applies an accepted draft and keeps section boundaries", () => {
    const doc = renderManagedDocument("# Draft", [
      { envelope: outline("claim-a", "Claim A"), heading: "Claim A", markdown: "Outline A." },
      { envelope: outline("claim-b", "Claim B"), heading: "Claim B", markdown: "Outline B." },
    ]);
    const previewed = parseDraftSections(doc).sections[0]!;
    const next = applyDraftSection(doc, previewed, { ...outline("claim-a", "Claim A"), provider: "anthropic", model: "m", generatedAt: "2026-10-01T00:00:00.000Z" }, "## Claim A\n\nDrafted A.\n\n## Inner\n\nMore.");
    const parsed = parseDraftSections(next);
    expect(parsed.issues).toEqual([]);
    expect(parsed.sections.map(({ heading, markdown, modifiedSinceReview, envelope }) => ({ heading, markdown, modifiedSinceReview, provider: envelope.provider }))).toEqual([
      { heading: "Claim A", markdown: "Drafted A.\n\n### Inner\n\nMore.", modifiedSinceReview: false, provider: "anthropic" },
      { heading: "Claim B", markdown: "Outline B.", modifiedSinceReview: false, provider: "companion" },
    ]);
    expect(next.startsWith("# Draft\n\n## Claim A\n\nDrafted A.")).toBe(true);
  });

  it("refuses to apply when the section changed after preview", () => {
    const doc = renderManagedDocument("", [{ envelope: drafted, heading: "External validity", markdown: "Original [@smith2025]." }]);
    const previewed = parseDraftSections(doc).sections[0]!;
    expect(() => applyDraftSection(doc.replace("Original", "Edited"), previewed, drafted, "Replacement [@smith2025]."))
      .toThrow(/changed after the preview/i);
  });

  it("refuses an empty body and a mismatched id", () => {
    const doc = renderManagedDocument("", [{ envelope: drafted, heading: "External validity", markdown: "Original [@smith2025]." }]);
    const previewed = parseDraftSections(doc).sections[0]!;
    expect(() => applyDraftSection(doc, previewed, drafted, "## Only a heading")).toThrow(/must not be empty/);
    expect(() => applyDraftSection(doc, previewed, { ...drafted, id: "other" }, "Text [@smith2025].")).toThrow(/id must match/);
  });

  it("refuses a citation key that resolves to a different source", () => {
    const doc = renderManagedDocument("", [
      { envelope: outline("claim-a", "Claim A"), heading: "Claim A", markdown: "A" },
      { envelope: { ...drafted, id: "claim-b" }, heading: "Claim B", markdown: "B [@smith2025]." },
    ]);
    const previewed = parseDraftSections(doc).sections[0]!;
    const clash = { ...outline("claim-a", "Claim A"), provider: "anthropic", citations: [{ key: "smith2025", sourcePath: "Research/Sources/Other.md" }] };
    expect(() => applyDraftSection(doc, previewed, clash, "A [@smith2025].")).toThrow(/citation key collision.*smith2025/i);
  });

  it("rejects one citation key resolving to different sources across sections", () => {
    const other = { ...drafted, id: "other-section", citations: [{ key: "smith2025", sourcePath: "Research/Sources/Different.md" }] };
    expect(() => validateDocumentCitationKeys([drafted, other])).toThrow(/citation key collision.*smith2025/i);
  });
});

describe("old v1 documents", () => {
  const b = { ...drafted, id: "claim-b", claimPaths: ["Research/Claims/B claim.md"] };
  const v1 = `# Outline\n\n${v1Section(outline("claim-a", "Claim A"), "## Claim A\n\nProposition A.")}\n${v1Section(b, "Hand edited B [@smith2025].", "Drafted B [@smith2025].")}\n`;

  it("parses v1 sections with headings and modified status", () => {
    expect(parseDraftSections(v1)).toEqual({
      format: "v1",
      issues: [],
      sections: [
        { envelope: outline("claim-a", "Claim A"), heading: "Claim A", markdown: "Proposition A.", modifiedSinceReview: false },
        { envelope: b, heading: "B claim", markdown: "Hand edited B [@smith2025].", modifiedSinceReview: true },
      ],
    });
  });

  it("converts to v2 and keeps every status", () => {
    const { document, converted } = convertV1Document(v1);
    expect(converted).toBe(2);
    expect(document).not.toContain("cavi:draft-section");
    expect(document.startsWith("# Outline\n\n## Claim A\n\nProposition A.\n\n## B claim\n\nHand edited B [@smith2025].")).toBe(true);
    expect(parseDraftSections(document)).toEqual({
      format: "v2",
      issues: [],
      sections: [
        { envelope: outline("claim-a", "Claim A"), heading: "Claim A", markdown: "Proposition A.", modifiedSinceReview: false },
        { envelope: b, heading: "B claim", markdown: "Hand edited B [@smith2025].", modifiedSinceReview: true },
      ],
    });
  });

  it("converts before applying an accepted draft", () => {
    const previewed = parseDraftSections(v1).sections[0]!;
    const next = applyDraftSection(v1, previewed, { ...outline("claim-a", "Claim A"), provider: "anthropic", model: "m" }, "New A.");
    const parsed = parseDraftSections(next);
    expect(next).not.toContain("cavi:draft-section");
    expect(parsed.sections.map(({ markdown, modifiedSinceReview }) => [markdown, modifiedSinceReview])).toEqual([["New A.", false], ["Hand edited B [@smith2025].", true]]);
  });

  it("refuses to convert a document that mixes formats", () => {
    const mixed = `${v1}\n${renderManagedDocument("", [{ envelope: drafted, heading: "X", markdown: "Y [@smith2025]." }])}`;
    expect(() => convertV1Document(mixed)).toThrow(/mixes old and new/);
    expect(parseDraftSections(mixed).issues).toEqual(["Document mixes old and new section markers"]);
  });
});
