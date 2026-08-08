import { describe, expect, it } from "vitest";
import {
  EnrichmentQualityError,
  assertBodyPreserved,
  markdownBody,
  validateEnrichment,
} from "../../src/sources/enrichmentQuality";
import type { SourceRecord } from "../../src/sources/types";

function article(fields: Record<string, unknown> = {}): SourceRecord {
  return {
    type: "article",
    fields: {
      title: "A meaningful article title",
      site: "Example",
      summary: "A concise account of the source.",
      ...fields,
    },
    provenance: {
      capturedAt: "2026-08-08T00:00:00Z",
      schemaVersion: 1,
      enrichedBy: "claude",
    },
  } as SourceRecord;
}

function qualityErrors(record: SourceRecord): string[] {
  try {
    validateEnrichment(record);
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(EnrichmentQualityError);
    return (error as EnrichmentQualityError).errors;
  }
}

describe("validateEnrichment", () => {
  it("accepts a valid record with a 200-character summary boundary", () => {
    expect(() => validateEnrichment(article({ summary: "s".repeat(200), topics: ["local-ai", "research"] }))).not.toThrow();
  });

  it.each(["", "   ", "Untitled", "untitled document"])("rejects blank or placeholder title %j", (title) => {
    expect(qualityErrors(article({ title }))).toContain("title: must be a meaningful, non-placeholder title");
  });

  it.each(["document.md", "article.pdf", "capture.txt"])("rejects generic filename-only title %j", (title) => {
    expect(qualityErrors(article({ title }))).toContain("title: must be a meaningful, non-placeholder title");
  });

  it("rejects a blank summary", () => {
    expect(qualityErrors(article({ summary: " \n\t " }))).toContain("summary: must be a non-empty string");
  });

  it("rejects a summary over 200 characters", () => {
    expect(qualityErrors(article({ summary: "s".repeat(201) }))).toContain("summary: must be at most 200 characters");
  });

  it("reports each field whose runtime value has an invalid type", () => {
    const errors = qualityErrors(article({ topics: ["research", 42], rows: Number.POSITIVE_INFINITY, metadata: { private: true } }));
    expect(errors).toEqual([
      "fields.topics: expected an array of strings",
      "fields.rows: expected a finite number",
      "fields.metadata: expected a string, finite number, or array of strings",
    ]);
  });

  it("rejects sanitized and raw secret-bearing field values", () => {
    const errors = qualityErrors(article({ summary: "Credentials: ‹REDACTED›", topics: ["safe", "ghp_abcdefghijklmnopqrstuvwxyz0123"] }));
    expect(errors).toEqual([
      "fields.summary: contains secret-bearing content",
      "fields.topics[1]: contains secret-bearing content",
    ]);
  });
});

describe("markdown body preservation", () => {
  it("removes only a leading YAML block and retains every following byte", () => {
    const content = "---\r\ntitle: Before\r\n---\r\n\r\n# Heading\r\n\r\n---\r\nBody  \r\n";
    expect(markdownBody(content)).toBe("\r\n# Heading\r\n\r\n---\r\nBody  \r\n");
  });

  it("returns the complete content when there is no leading YAML block", () => {
    const content = "# Heading\n\n---\nBody\n";
    expect(markdownBody(content)).toBe(content);
  });

  it("throws a quality error when any body byte changes", () => {
    const before = "---\ntitle: Before\n---\n\nBody  \n";
    const after = "---\ntitle: After\n---\n\nBody\n";
    expect(() => assertBodyPreserved(before, after)).toThrowError(
      new EnrichmentQualityError(["markdown body changed during enrichment"]),
    );
  });

  it("accepts changed frontmatter when the body bytes are identical", () => {
    const before = "---\ntitle: Before\n---\n\nBody  \n";
    const after = "---\ntitle: After\ntags: [source]\n---\n\nBody  \n";
    expect(() => assertBodyPreserved(before, after)).not.toThrow();
  });

  it("does not treat the closing YAML delimiter's line ending as a body byte", () => {
    const before = "---\r\ntitle: Before\r\n---\r\nBody bytes\r\n";
    const after = "---\ntitle: After\n---\nBody bytes\r\n";
    expect(() => assertBodyPreserved(before, after)).not.toThrow();
  });
});
