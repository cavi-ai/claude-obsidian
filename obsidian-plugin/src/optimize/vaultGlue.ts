import { TFile, type App } from "obsidian";
import { normalizeTag } from "../indexing/frontmatter";
import { ensureVaultFolder, uniqueNotePath } from "../vault/vaultFiles";
import { mapTagList, OPTIMIZE_OUTPUT_ROOT, rewriteInlineTags, type NoteMergePlan, type NoteTagInput } from "./mergePlan";

function tagValues(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/[\s,]+/).filter(Boolean);
  return null;
}

function markdownFile(app: App, path: string): TFile | null {
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile ? file : null;
}

export function noteTagInput(app: App, path: string): NoteTagInput | null {
  const file = markdownFile(app, path);
  if (!file) return null;
  const cache = app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter as Record<string, unknown> | undefined;
  const frontmatterTags = [...(tagValues(fm?.tags) ?? []), ...(tagValues(fm?.tag) ?? [])];
  const inline: NoteTagInput["inline"] = [];
  for (const t of cache?.tags ?? []) {
    if (!t.position) continue;
    inline.push({ tag: t.tag.replace(/^#/, ""), start: t.position.start.offset, end: t.position.end.offset });
  }
  return { path, frontmatterTags, inline };
}

export async function applyNoteMerge(
  app: App,
  plan: NoteMergePlan,
  map: ReadonlyMap<string, string>,
): Promise<{ inlineApplied: number; inlineSkipped: number }> {
  const file = markdownFile(app, plan.path);
  if (!file) return { inlineApplied: 0, inlineSkipped: plan.inline.length };
  let inlineApplied = 0;
  let inlineSkipped = 0;
  if (plan.inline.length > 0) {
    await app.vault.process(file, (content) => {
      const result = rewriteInlineTags(content, plan.inline);
      inlineApplied = result.applied;
      inlineSkipped = result.skipped;
      return result.content;
    });
  }
  if (plan.before.some((t) => map.has(normalizeTag(t)))) {
    await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      for (const key of ["tags", "tag"]) {
        const current = fm[key];
        const values = tagValues(current);
        if (!values) continue;
        const mapped = mapTagList(values, map);
        if (mapped.changed) fm[key] = Array.isArray(current) ? mapped.tags : mapped.tags.join(", ");
      }
    });
  }
  return { inlineApplied, inlineSkipped };
}

export async function writeOptimizeRunNote(app: App, content: string, now: string): Promise<string> {
  await ensureVaultFolder(app, OPTIMIZE_OUTPUT_ROOT);
  const stamp = now.slice(0, 16).replace("T", " ").replace(":", "");
  const path = await uniqueNotePath(app, OPTIMIZE_OUTPUT_ROOT, `Tag merges ${stamp}`, "md");
  await app.vault.create(path, content);
  return path;
}
