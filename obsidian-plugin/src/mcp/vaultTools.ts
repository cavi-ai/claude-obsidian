import { App, TFile, normalizePath, getAllTags } from "obsidian";
import type { McpToolDef } from "./protocol";
import { scoreContent, snippetAround, tokenize } from "../context/search";
import { buildFrontmatter, normalizeTags } from "../indexing/frontmatter";

/**
 * Vault tools exposed over MCP so Claude Code / Claude Desktop can read,
 * search, and write notes in this vault — the core of the unified bridge.
 *
 * All write tools are gated by the `allowWrites` flag from settings.
 */
export class VaultTools {
  constructor(
    private app: App,
    private opts: { allowWrites: boolean; defaultFolder: string },
  ) {}

  setOptions(opts: { allowWrites: boolean; defaultFolder: string }): void {
    this.opts = opts;
  }

  definitions(): McpToolDef[] {
    const defs: McpToolDef[] = [
      {
        name: "vault_search",
        description: "Search the Obsidian vault by keyword. Returns matching notes with a relevance score and a snippet.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Keywords to search for." },
            limit: { type: "number", description: "Max results (default 8)." },
          },
          required: ["query"],
        },
      },
      {
        name: "note_read",
        description: "Read the full Markdown content of a note by its vault path (e.g. 'Folder/Note.md').",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string", description: "Vault-relative path to the note." } },
          required: ["path"],
        },
      },
      {
        name: "list_recent",
        description: "List the most recently modified notes in the vault.",
        inputSchema: {
          type: "object",
          properties: { limit: { type: "number", description: "Max results (default 15)." } },
        },
      },
      {
        name: "vault_tags",
        description: "List existing tags in the vault with usage counts, to reuse consistent tags.",
        inputSchema: { type: "object", properties: {} },
      },
    ];

    if (this.opts.allowWrites) {
      defs.push(
        {
          name: "note_create",
          description: "Create a new Markdown note. Adds YAML frontmatter (title, tags, source) for correct indexing.",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string", description: "Note title (also used for the filename)." },
              content: { type: "string", description: "Markdown body." },
              folder: { type: "string", description: "Target folder (defaults to the configured folder)." },
              tags: { type: "array", items: { type: "string" }, description: "Tags to apply." },
            },
            required: ["title", "content"],
          },
        },
        {
          name: "note_append",
          description: "Append Markdown text to an existing note (creates it if missing).",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "Vault-relative path to the note." },
              content: { type: "string", description: "Markdown to append." },
            },
            required: ["path", "content"],
          },
        },
      );
    }
    return defs;
  }

  async call(name: string, args: Record<string, unknown>): Promise<string> {
    switch (name) {
      case "vault_search":
        return this.search(str(args.query), num(args.limit, 8));
      case "note_read":
        return this.read(str(args.path));
      case "list_recent":
        return this.listRecent(num(args.limit, 15));
      case "vault_tags":
        return this.tags();
      case "note_create":
        this.assertWrites();
        return this.create(str(args.title), str(args.content), optStr(args.folder), strArray(args.tags));
      case "note_append":
        this.assertWrites();
        return this.append(str(args.path), str(args.content));
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private assertWrites(): void {
    if (!this.opts.allowWrites) throw new Error("Write tools are disabled. Enable 'Allow MCP writes' in Claude Companion settings.");
  }

  private async search(query: string, limit: number): Promise<string> {
    const terms = tokenize(query);
    if (terms.length === 0) return "No searchable terms in query.";
    const hits: Array<{ path: string; score: number; snippet: string }> = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      const lowerTags = cache ? (getAllTags(cache) ?? []).join(" ").toLowerCase() : "";
      const content = await this.app.vault.cachedRead(file);
      const { score, firstIdx } = scoreContent(terms, file.path.toLowerCase(), lowerTags, content);
      if (score > 0) hits.push({ path: file.path, score, snippet: snippetAround(content, firstIdx) });
    }
    hits.sort((a, b) => b.score - a.score);
    const top = hits.slice(0, limit);
    if (top.length === 0) return `No matches for "${query}".`;
    return top.map((h) => `## ${h.path} (score ${h.score})\n${h.snippet}`).join("\n\n");
  }

  private async read(path: string): Promise<string> {
    const file = this.resolveFile(path);
    return this.app.vault.cachedRead(file);
  }

  private async listRecent(limit: number): Promise<string> {
    const files = this.app.vault
      .getMarkdownFiles()
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, limit);
    if (files.length === 0) return "Vault has no notes.";
    return files.map((f) => `- ${f.path} (modified ${new Date(f.stat.mtime).toISOString().slice(0, 16).replace("T", " ")})`).join("\n");
  }

  private async tags(): Promise<string> {
    const counts = new Map<string, number>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) continue;
      for (const t of getAllTags(cache) ?? []) {
        const tag = t.replace(/^#/, "");
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    if (counts.size === 0) return "No tags in the vault yet.";
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([t, c]) => `- #${t} (${c})`)
      .join("\n");
  }

  private async create(title: string, content: string, folder: string | undefined, tags: string[]): Promise<string> {
    const dir = (folder ?? this.opts.defaultFolder).trim();
    await this.ensureFolder(dir);
    const fm = buildFrontmatter({
      title,
      created: new Date().toISOString().slice(0, 10),
      source: "claude-mcp",
      tags: normalizeTags(["claude", ...tags]),
    });
    const body = `${fm}\n\n# ${title}\n\n${content}\n`;
    const path = await this.uniquePath(dir, title);
    const file = await this.app.vault.create(path, body);
    return `Created note: ${file.path}`;
  }

  private async append(path: string, content: string): Promise<string> {
    const existing = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (existing instanceof TFile) {
      await this.app.vault.append(existing, `\n${content}\n`);
      return `Appended to: ${existing.path}`;
    }
    const file = await this.app.vault.create(normalizePath(path), `${content}\n`);
    return `Created and wrote: ${file.path}`;
  }

  // ---- helpers ----

  private resolveFile(path: string): TFile {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (f instanceof TFile) return f;
    throw new Error(`Note not found: ${path}`);
  }

  private async ensureFolder(folder: string): Promise<void> {
    const p = normalizePath(folder);
    if (p === "" || p === "/" || this.app.vault.getAbstractFileByPath(p)) return;
    let cur = "";
    for (const part of p.split("/")) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        try {
          await this.app.vault.createFolder(cur);
        } catch {
          /* race */
        }
      }
    }
  }

  private async uniquePath(folder: string, title: string): Promise<string> {
    const safe = title.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled";
    let path = normalizePath(folder ? `${folder}/${safe}.md` : `${safe}.md`);
    let i = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(folder ? `${folder}/${safe} ${i}.md` : `${safe} ${i}.md`);
      i++;
    }
    return path;
  }
}

function str(v: unknown): string {
  if (typeof v !== "string" || v.length === 0) throw new Error("Expected a non-empty string argument.");
  return v;
}
function optStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function num(v: unknown, dflt: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : dflt;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
