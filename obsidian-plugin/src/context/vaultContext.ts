import { App, MarkdownView, TFile, getAllTags } from "obsidian";
import type { ContextToggles, PluginSettings } from "../types";
import { clip, scoreContent, section, snippetAround, tokenize } from "./search";

export interface GatheredContext {
  text: string;
  /** Short human-readable labels of what was attached, for the UI. */
  sources: string[];
}

/**
 * Build a context string from the vault based on the active note, the current
 * selection, linked notes, and (optionally) a keyword search across the vault.
 */
export async function gatherContext(app: App, settings: PluginSettings, toggles: ContextToggles, userQuery: string): Promise<GatheredContext> {
  const sources: string[] = [];
  const blocks: string[] = [];
  let budget = settings.contextCharBudget;

  const view = app.workspace.getActiveViewOfType(MarkdownView);
  const activeFile = view?.file ?? app.workspace.getActiveFile();

  // 1. Current selection (highest priority).
  if (toggles.selection && view) {
    const sel = view.editor.getSelection();
    if (sel && sel.trim().length > 0) {
      const block = section(`Selected text from "${activeFile?.basename ?? "current note"}"`, sel.trim());
      blocks.push(clip(block, budget));
      budget -= block.length;
      sources.push("selection");
    }
  }

  // 2. Active note.
  if (toggles.activeNote && activeFile instanceof TFile && budget > 0) {
    const content = await app.vault.cachedRead(activeFile);
    const block = section(`Current note: ${activeFile.path}`, content);
    blocks.push(clip(block, budget));
    budget -= Math.min(block.length, budget);
    sources.push("active note");
  }

  // 3. Linked + backlinked notes.
  if (toggles.linkedNotes && activeFile instanceof TFile && budget > 0) {
    const linked = collectLinkedFiles(app, activeFile, settings.maxContextNotes);
    let added = 0;
    for (const f of linked) {
      if (budget <= 0) break;
      const content = await app.vault.cachedRead(f);
      const block = section(`Linked note: ${f.path}`, content);
      const clipped = clip(block, Math.min(budget, 4000));
      blocks.push(clipped);
      budget -= clipped.length;
      added++;
    }
    if (added > 0) sources.push(`${added} linked note${added > 1 ? "s" : ""}`);
  }

  // 4. Keyword search across the vault (RAG-lite).
  if (toggles.searchVault && userQuery.trim().length > 0 && budget > 0) {
    const hits = await searchVault(app, userQuery, settings.maxContextNotes, activeFile instanceof TFile ? activeFile.path : null);
    let added = 0;
    for (const hit of hits) {
      if (budget <= 0) break;
      const block = section(`Search match: ${hit.file.path}`, hit.snippet);
      const clipped = clip(block, Math.min(budget, 3000));
      blocks.push(clipped);
      budget -= clipped.length;
      added++;
    }
    if (added > 0) sources.push(`${added} search match${added > 1 ? "es" : ""}`);
  }

  if (blocks.length === 0) return { text: "", sources: [] };
  const text = ["<vault_context>", ...blocks, "</vault_context>"].join("\n\n");
  return { text, sources };
}

function collectLinkedFiles(app: App, file: TFile, limit: number): TFile[] {
  const out: TFile[] = [];
  const seen = new Set<string>([file.path]);

  const push = (path: string) => {
    if (seen.has(path) || out.length >= limit) return;
    const f = app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile && f.extension === "md") {
      seen.add(path);
      out.push(f);
    }
  };

  // Outgoing links.
  const resolved = app.metadataCache.resolvedLinks[file.path] ?? {};
  for (const target of Object.keys(resolved)) push(target);

  // Backlinks.
  for (const [source, targets] of Object.entries(app.metadataCache.resolvedLinks)) {
    if (out.length >= limit) break;
    if (targets[file.path]) push(source);
  }

  return out.slice(0, limit);
}

interface SearchHit {
  file: TFile;
  score: number;
  snippet: string;
}

/** Lightweight keyword scoring over markdown files — no embeddings required. */
async function searchVault(app: App, query: string, limit: number, excludePath: string | null): Promise<SearchHit[]> {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const files = app.vault.getMarkdownFiles();
  const hits: SearchHit[] = [];

  for (const file of files) {
    if (file.path === excludePath) continue;

    const cache = app.metadataCache.getFileCache(file);
    const lowerTags = cache ? (getAllTags(cache) ?? []).join(" ").toLowerCase() : "";
    const content = await app.vault.cachedRead(file);
    const { score, firstIdx } = scoreContent(terms, file.path.toLowerCase(), lowerTags, content);

    if (score > 0) {
      hits.push({ file, score, snippet: snippetAround(content, firstIdx) });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
