import { describe, expect, it } from "vitest";
import type { ResearchSourceRecord } from "../../src/research/types";
import { canonicalSourceId, findDuplicate, normalizeArxivId, normalizeDoi } from "../../src/research/identity";

type ScholarlySource = ResearchSourceRecord & {
  doi?: string;
  arxivId?: string;
  zoteroKey?: string;
  authors?: string[];
  published?: string;
};

function source(path: string, fields: Partial<ScholarlySource> = {}): ScholarlySource {
  return {
    path,
    title: "A Reliable Result",
    type: "research-source",
    project: "Projects/Test",
    sourceKind: "web",
    ...fields,
  };
}

describe("scholarly source identity", () => {
  it("normalizes DOI resolver URLs", () => {
    expect(normalizeDoi("https://doi.org/10.1000/ABC.1")).toBe("10.1000/abc.1");
  });

  it("normalizes arXiv prefixes and removes version suffixes", () => {
    expect(normalizeArxivId("arXiv:2501.01234v2")).toBe("2501.01234");
  });

  it("chooses canonical identifiers in DOI, arXiv, Zotero, URL order", () => {
    expect(canonicalSourceId({ canonicalId: "legacy", url: "https://Example.com/paper/", doi: "doi:10.1/X", arxivId: "2501.01234", zoteroKey: " Z9 " })).toBe("doi:10.1/x");
    expect(canonicalSourceId({ canonicalId: "legacy", url: "https://Example.com/paper/", arxivId: "2501.01234v3", zoteroKey: " Z9 " })).toBe("arxiv:2501.01234");
    expect(canonicalSourceId({ canonicalId: "legacy", url: "https://Example.com/paper/", zoteroKey: " Z9 " })).toBe("zotero:Z9");
    expect(canonicalSourceId({ canonicalId: "legacy", url: "https://Example.com/paper/" })).toBe("url:https://example.com/paper");
  });

  it("finds duplicates by the highest-precedence shared stable identifier", () => {
    const existing = [source("Sources/Paper.md", { doi: "10.1000/abc.1" })];
    const candidate = source("Inbox/paper.md", { doi: "https://doi.org/10.1000/ABC.1" });
    expect(findDuplicate(candidate, existing)?.path).toBe("Sources/Paper.md");
  });

  it("falls back through arXiv, Zotero, normalized URL, then bibliographic fingerprint", () => {
    expect(findDuplicate(source("new", { arxivId: "2501.01234v2" }), [source("arxiv", { arxivId: "arXiv:2501.01234" })])?.path).toBe("arxiv");
    expect(findDuplicate(source("new", { zoteroKey: " KEY1 " }), [source("zotero", { zoteroKey: "KEY1" })])?.path).toBe("zotero");
    expect(findDuplicate(source("new", { url: "https://EXAMPLE.com/paper/#abstract" }), [source("url", { url: "https://example.com/paper" })])?.path).toBe("url");
    expect(findDuplicate(source("new", { title: " A Reliable Result ", authors: ["Ada Lovelace"], published: "2025-04-02" }), [source("fingerprint", { title: "a reliable result", authors: ["Ada Lovelace", "Grace Hopper"], published: "2025" })])?.path).toBe("fingerprint");
  });

  it("uses equal content fingerprints only when stable identifiers do not conflict", () => {
    const candidate = source("new", { doi: "10.1/new", contentFingerprint: "sha256:same" });
    expect(findDuplicate(candidate, [source("conflict", { doi: "10.1/old", contentFingerprint: "sha256:same" })])).toBeUndefined();
    expect(findDuplicate(source("new", { contentFingerprint: "sha256:same" }), [source("match", { contentFingerprint: "sha256:same" })])?.path).toBe("match");
  });

  it("never merges a bibliographic match when stable identifiers conflict", () => {
    const shared = { authors: ["Ada Lovelace"], published: "2025" };
    expect(findDuplicate(source("new", { ...shared, doi: "10.1/new" }), [source("old", { ...shared, doi: "10.1/old" })])).toBeUndefined();
  });
});
