// Minimal in-memory fake of the Obsidian API surface used by the plugin's
// testable modules (currently src/mcp/vaultTools.ts). Vitest aliases the
// "obsidian" import to this file so we can exercise VaultTools against a real
// vault without launching Obsidian.
//
// Only the pieces the code under test actually touches are implemented; if a
// new dependency on the Obsidian API appears, add it here.

export function normalizePath(p: string): string {
  return p
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

export class TFile {
  path: string;
  basename: string;
  extension: string;
  stat: { mtime: number; ctime: number; size: number };
  /** internal content store (not part of the real Obsidian API) */
  _content: string;

  constructor(path: string, content: string, mtime: number) {
    this.path = path;
    this._content = content;
    this.stat = { mtime, ctime: mtime, size: content.length };
    const name = path.split("/").pop() ?? path;
    const dot = name.lastIndexOf(".");
    this.extension = dot > 0 ? name.slice(dot + 1) : "";
    this.basename = dot > 0 ? name.slice(0, dot) : name;
  }
}

export class TFolder {
  constructor(public path: string) {}
}

interface FileCache {
  tags?: Array<{ tag: string }>;
  frontmatter?: Record<string, unknown>;
}

/** Mirrors Obsidian's getAllTags(cache): returns "#tag" strings or null. */
export function getAllTags(cache: FileCache | null): string[] | null {
  if (!cache) return null;
  const out: string[] = [];
  for (const t of cache.tags ?? []) out.push(t.tag);
  const fm = cache.frontmatter?.tags;
  if (Array.isArray(fm)) for (const t of fm) out.push(String(t).startsWith("#") ? String(t) : `#${t}`);
  return out;
}

class FakeVault {
  private files = new Map<string, TFile>();
  private folders = new Set<string>();
  /** path -> tag strings (without #), used to build the metadata cache */
  tags = new Map<string, string[]>();

  /** Test helper: seed a note. */
  seed(path: string, content: string, opts: { mtime?: number; tags?: string[] } = {}): TFile {
    const p = normalizePath(path);
    const file = new TFile(p, content, opts.mtime ?? Date.now());
    this.files.set(p, file);
    if (opts.tags?.length) this.tags.set(p, opts.tags);
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    if (dir) this.folders.add(dir);
    return file;
  }

  getMarkdownFiles(): TFile[] {
    return [...this.files.values()].filter((f) => f.extension === "md");
  }

  getAbstractFileByPath(path: string): TFile | TFolder | null {
    const p = normalizePath(path);
    const f = this.files.get(p);
    if (f) return f;
    if (this.folders.has(p)) return new TFolder(p);
    return null;
  }

  cachedRead(file: TFile): Promise<string> {
    return Promise.resolve(file._content);
  }

  createFolder(path: string): Promise<void> {
    this.folders.add(normalizePath(path));
    return Promise.resolve();
  }

  create(path: string, content: string): Promise<TFile> {
    const p = normalizePath(path);
    if (this.files.has(p)) throw new Error(`File already exists: ${p}`);
    const file = new TFile(p, content, Date.now());
    this.files.set(p, file);
    return Promise.resolve(file);
  }

  append(file: TFile, content: string): Promise<void> {
    file._content += content;
    file.stat.size = file._content.length;
    return Promise.resolve();
  }
}

class FakeMetadataCache {
  constructor(private vault: FakeVault) {}
  getFileCache(file: TFile): FileCache | null {
    const tags = this.vault.tags.get(file.path);
    if (!tags) return null;
    return { tags: tags.map((t) => ({ tag: t.startsWith("#") ? t : `#${t}` })) };
  }
}

export class App {
  vault = new FakeVault();
  metadataCache = new FakeMetadataCache(this.vault);
}

// Value stubs for modules that import these names (not exercised in tests).
export class Notice {
  constructor(public message: string) {}
}
export class Plugin {}
export class MarkdownView {}
export class WorkspaceLeaf {}
