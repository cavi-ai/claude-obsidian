import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { ResearchRepository, type ResearchRepositoryIO } from "../../src/research/repository";

class MemoryIO implements ResearchRepositoryIO {
  files = new Map<string, string>();
  folders = new Set<string>();

  async listMarkdown() {
    return [...this.files].filter(([path]) => path.endsWith(".md")).map(([path, content]) => {
      const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      return { path, frontmatter: match ? parse(match[1] ?? "") : undefined, body: match?.[2] ?? content };
    });
  }
  exists(path: string) { return this.files.has(path) || this.folders.has(path); }
  async ensureFolder(path: string) { this.folders.add(path); }
  async create(path: string, content: string) {
    if (this.exists(path)) throw new Error(`File already exists: ${path}`);
    this.files.set(path, content);
  }
  async modify(path: string, content: string) {
    if (!this.files.has(path)) throw new Error(`File not found: ${path}`);
    this.files.set(path, content);
  }
}

const projectInput = { title: "AI Reviews", question: "How reliable are automated reviews?", folder: "Research/AI Reviews" };

describe("ResearchRepository", () => {
  it("creates a canonical vault-native project without placeholder notes", async () => {
    const io = new MemoryIO();
    const created = await new ResearchRepository(io).createProject(projectInput);
    expect(created.path).toBe("Research/AI Reviews/Project.md");
    expect(created.project).toBe(created.path);
    expect([...io.files.keys()]).toEqual([created.path]);
    expect(io.folders).toEqual(new Set(["Research/AI Reviews"]));
  });

  it.each([
    { title: "Review article", sourceKind: "web" as const, url: "https://example.test/review", contentFingerprint: "sha256:web" },
    { title: "Scanned report", sourceKind: "pdf" as const, asset: "Attachments/report.pdf", contentFingerprint: "sha256:pdf" },
  ])("imports $sourceKind sources idempotently", async (sourceInput) => {
    const io = new MemoryIO();
    const repo = new ResearchRepository(io);
    const project = await repo.createProject(projectInput);
    const first = await repo.importSource(project.path, sourceInput);
    const second = await repo.importSource(project.path, sourceInput);
    expect(first).toEqual({ kind: "created", path: `Research/AI Reviews/Sources/${sourceInput.title}.md` });
    expect(second).toEqual({ kind: "duplicate", path: first.path });
  });

  it("reconstructs persisted records from a fresh repository instance", async () => {
    const io = new MemoryIO();
    const first = new ResearchRepository(io);
    const project = await first.createProject(projectInput);
    await first.importSource(project.path, { title: "Paper", sourceKind: "doi", doi: "10.1/test", contentFingerprint: "sha256:one" });
    const snapshot = await new ResearchRepository(io).loadProject(project.path);
    expect(snapshot.project).toEqual(project);
    expect(snapshot.sources).toHaveLength(1);
  });

  it("derives evidence fingerprints from a source in the target project", async () => {
    const io = new MemoryIO();
    const repo = new ResearchRepository(io);
    const project = await repo.createProject(projectInput);
    const imported = await repo.importSource(project.path, { title: "Paper", sourceKind: "pdf", asset: "Files/Paper.pdf", contentFingerprint: "sha256:trusted" });
    if (imported.kind !== "created") throw new Error("expected created source");
    const evidence = await repo.createEvidence({ project: project.path, source: imported.path, title: "Result", excerpt: "It worked.", locatorKind: "page", locatorValue: "4", sourceFingerprint: "sha256:spoofed" } as never);
    expect(evidence.sourceFingerprint).toBe("sha256:trusted");
    await expect(repo.createEvidence({ project: project.path, source: "Elsewhere/Source.md", title: "Bad", excerpt: "No." })).rejects.toThrow("Source is not part of project");
  });

  it("rejects traversal, noncanonical project paths, and existing user-file collisions", async () => {
    const io = new MemoryIO();
    const repo = new ResearchRepository(io);
    await expect(repo.createProject({ ...projectInput, folder: "Research/../Escape" })).rejects.toThrow("Unsafe research path");
    const project = await repo.createProject(projectInput);
    await expect(repo.importSource("Research/AI Reviews/Other.md", { title: "Paper", sourceKind: "web" })).rejects.toThrow("Project path must end with /Project.md");
    io.files.set("Research/AI Reviews/Sources/Paper.md", "user content");
    await expect(repo.importSource(project.path, { title: "Paper", sourceKind: "web", url: "https://new.test" })).rejects.toThrow("Research record already exists");
  });
});
