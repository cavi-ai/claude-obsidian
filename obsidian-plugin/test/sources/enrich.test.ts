import { describe, it, expect } from "vitest";
import { App, TFile } from "obsidian";
import { enrichCapture } from "../../src/sources/enrich";
import type { EnrichDeps } from "../../src/sources/enrich";
import { EnrichmentQualityError, markdownBody } from "../../src/sources/enrichmentQuality";
import { parse as parseYaml } from "yaml";

const LEAK = "sk-ant-api03-DEADBEEFDEADBEEFDEADBEEF";

function deps(app: App, complete: EnrichDeps["complete"]): EnrichDeps {
  return { app, complete, baseTags: ["source"], enrichedBy: "claude", now: () => "2026-06-16T00:00:00Z" };
}

describe("enrichCapture — markdown clip", () => {
  it("changes frontmatter while preserving every body byte", async () => {
    const app = new App();
    const file = app.vault.seed("Clippings/a.md", "---\nsource: https://stratechery.com/p\n---\n\n# Article body\n\nLine with two spaces.  \n---\nFinal line.\n");
    const complete = async () => JSON.stringify({ title: "A useful title", site: "Stratechery", summary: "A concise summary." });
    const res = await enrichCapture(deps(app, complete), { kind: "markdown", path: "Clippings/a.md", basename: "a", content: (file as TFile)._content });
    expect(res.type).toBe("article");
    const out = await app.vault.cachedRead(res.file);
    expect(out).toContain('type: "article"');
    expect(out).toContain("source_enriched: true");
    expect(markdownBody(out)).toBe("\n# Article body\n\nLine with two spaces.  \n---\nFinal line.\n");
  });

  it("adds frontmatter to a plain Markdown capture without adding or removing a body byte", async () => {
    const app = new App();
    const before = "# Plain capture\n\nBody with trailing spaces.  \n";
    const file = app.vault.seed("Clippings/plain.md", before);
    const complete = async () => JSON.stringify({ title: "A plain capture", site: "Example", summary: "A concise summary." });

    const res = await enrichCapture(deps(app, complete), {
      kind: "markdown",
      path: "Clippings/plain.md",
      basename: "plain",
      content: (file as TFile)._content,
    });

    const out = await app.vault.cachedRead(res.file);
    expect(out).toContain("source_enriched: true");
    expect(markdownBody(out)).toBe(before);
  });

  it("unions existing, base, and normalized topic tags without duplicates", async () => {
    const app = new App();
    const file = app.vault.seed("Clippings/tags.md", "---\ntags:\n  - web-clip\n  - source\nsource: https://example.com/post\n---\n\nBody.\n");
    const complete = async () => JSON.stringify({
      title: "Tag union behavior",
      site: "Example",
      summary: "A concise summary.",
      topics: ["Research Notes", "source", "research-notes"],
    });
    const withOverlappingBase = { ...deps(app, complete), baseTags: ["source", "inbox", "web-clip"] };

    const res = await enrichCapture(withOverlappingBase, {
      kind: "markdown",
      path: "Clippings/tags.md",
      basename: "tags",
      content: (file as TFile)._content,
    });

    const out = await app.vault.cachedRead(res.file);
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(out)?.[1];
    expect(parseYaml(frontmatter ?? "").tags).toEqual(["web-clip", "source", "inbox", "research-notes"]);
  });

  it("keeps clipper-stamped values and only asks the model for the rest", async () => {
    const app = new App();
    const clipped = [
      "---",
      "type: article",
      "title: Clipped Title",
      "author: Jane Doe",
      "site: Example",
      "published: 2026-07-01",
      "source: https://example.com/post",
      "---",
      "",
      "Body text.",
    ].join("\n");
    const file = app.vault.seed("Clippings/b.md", clipped);
    let system = "";
    const complete = async (sys: string) => {
      system = sys;
      return JSON.stringify({ summary: "A one-liner." });
    };
    const res = await enrichCapture(deps(app, complete), { kind: "markdown", path: "Clippings/b.md", basename: "b", content: (file as TFile)._content });
    // The model was never asked for the page-known fields…
    expect(system).not.toContain("- title (");
    expect(system).not.toContain("- author (");
    expect(system).not.toContain("- site (");
    // …and the clipper's values survive into the enriched note.
    const out = await app.vault.cachedRead(res.file);
    expect(out).toContain("Clipped Title");
    expect(out).toContain("Jane Doe");
    expect(out).toContain("A one-liner.");
    expect(out).toContain("source_enriched: true");
  });
});

describe("enrichCapture — dropped CSV", () => {
  it("creates a sidecar note with derived columns/rows and an embed", async () => {
    const app = new App();
    const complete = async () => JSON.stringify({ title: "Sales", summary: "Monthly sales." });
    const res = await enrichCapture(deps(app, complete), { kind: "datafile", path: "Clippings/sales.csv", basename: "sales", ext: "csv", content: "date,units\n2024,10\n2025,20" });
    expect(res.type).toBe("dataset");
    expect(res.record.fields.columns).toEqual(["date", "units"]);
    expect(res.record.fields.rows).toBe(2);
    const out = await app.vault.cachedRead(res.file);
    expect(out).toContain("![[sales.csv]]");
    expect(out).toContain('asset: "Clippings/sales.csv"');
  });
});

describe("enrichCapture — extraction failure", () => {
  it("propagates the error and leaves the markdown note untouched", async () => {
    const app = new App();
    const file = app.vault.seed("Clippings/x.md", "---\nsource: https://x.com/p\n---\n\nUntouched body.");
    const complete = async () => "not json at all";
    await expect(
      enrichCapture(deps(app, complete), { kind: "markdown", path: "Clippings/x.md", basename: "x", content: (file as TFile)._content }),
    ).rejects.toThrow();
    const out = await app.vault.cachedRead(file as TFile);
    expect(out).not.toContain("source_enriched");
    expect(out).toContain("Untouched body.");
  });

  it("rejects secret-bearing enrichment before mutation and leaves the complete note byte-identical", async () => {
    const app = new App();
    const before = "---\nsource: https://x.com/p\ntags:\n  - private\n---\n\nUntouched body.  \n";
    const file = app.vault.seed("Clippings/secret.md", before);
    const complete = async () => JSON.stringify({ title: "A safe title", site: "Example", summary: `Summary ${LEAK}` });

    await expect(
      enrichCapture(deps(app, complete), { kind: "markdown", path: "Clippings/secret.md", basename: "secret", content: (file as TFile)._content }),
    ).rejects.toBeInstanceOf(EnrichmentQualityError);

    expect(await app.vault.cachedRead(file as TFile)).toBe(before);
  });

  it("rolls back the exact original content when the Obsidian merge changes a body byte", async () => {
    const app = new App();
    const before = "---\nsource: https://x.com/p\n---\n\nOriginal body.  \n";
    const file = app.vault.seed("Clippings/rollback.md", before);
    const manager = app.fileManager as unknown as {
      processFrontMatter(target: TFile, mutate: (frontmatter: Record<string, unknown>) => void): Promise<void>;
    };
    const processFrontMatter = manager.processFrontMatter.bind(manager);
    manager.processFrontMatter = async (target, mutate) => {
      await processFrontMatter(target, mutate);
      target._content = target._content.replace("Original body.", "Changed body.");
    };
    const complete = async () => JSON.stringify({ title: "Rollback safety", site: "Example", summary: "A concise summary." });

    await expect(
      enrichCapture(deps(app, complete), { kind: "markdown", path: "Clippings/rollback.md", basename: "rollback", content: (file as TFile)._content }),
    ).rejects.toThrow("markdown body changed during enrichment");

    expect(await app.vault.cachedRead(file as TFile)).toBe(before);
  });
});

describe("enrichCapture — re-enriching a CSV", () => {
  it("modifies the existing sidecar instead of creating a duplicate", async () => {
    const app = new App();
    const complete = async () => JSON.stringify({ title: "Sales", summary: "Monthly sales." });
    const cap = { kind: "datafile" as const, path: "Clippings/sales.csv", basename: "sales", ext: "csv", content: "date,units\n2024,10" };
    const r1 = await enrichCapture(deps(app, complete), cap);
    const r2 = await enrichCapture(deps(app, complete), cap);
    expect(r2.file.path).toBe(r1.file.path);
    const sidecars = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Clippings/") && f.path.endsWith(".md"));
    expect(sidecars).toHaveLength(1);
  });
});
