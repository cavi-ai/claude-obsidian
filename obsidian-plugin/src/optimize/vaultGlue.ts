import { TFile, type App } from "obsidian";
import { tagId } from "../tags/vocabulary";
import { ensureVaultFolder, uniqueNotePath } from "../vault/vaultFiles";
import { entryId, mapTagList, OPTIMIZE_OUTPUT_ROOT, rewriteInlineTags, type NoteMergePlan, type NoteTagInput } from "./mergePlan";

const TAG_KEY = /^tags?$/i;

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
  const frontmatterTags: string[] = [];
  for (const [key, value] of Object.entries(fm ?? {})) if (TAG_KEY.test(key)) frontmatterTags.push(...(tagValues(value) ?? []));
  const inline: NoteTagInput["inline"] = [];
  for (const t of cache?.tags ?? []) {
    if (!t.position) continue;
    inline.push({ tag: t.tag.replace(/^#/, ""), start: t.position.start.offset, end: t.position.end.offset });
  }
  return { path, frontmatterTags, inline };
}

export interface NoteMergeResult {
  inlineApplied: number;
  inlineSkipped: number;
  changed: string[];
}

export async function applyNoteMerge(
  app: App,
  plan: NoteMergePlan,
  map: ReadonlyMap<string, string>,
): Promise<NoteMergeResult> {
  const file = markdownFile(app, plan.path);
  if (!file) throw new Error(`Note not found: ${plan.path}`);
  const changed = new Set<string>();
  let inlineApplied = 0;
  let inlineSkipped = 0;
  if (plan.inline.length > 0) {
    await app.vault.process(file, (content) => {
      const result = rewriteInlineTags(content, plan.inline);
      inlineApplied = result.applied;
      inlineSkipped = result.skipped;
      for (const from of result.appliedFrom) changed.add(from);
      return result.content;
    });
  }
  if (plan.before.some((t) => map.has(tagId(t)))) {
    await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      for (const key of Object.keys(fm)) {
        if (!TAG_KEY.test(key)) continue;
        const current = fm[key];
        const entries = Array.isArray(current) ? current : typeof current === "string" ? current.split(/[\s,]+/).filter(Boolean) : null;
        if (!entries) continue;
        const mapped = mapTagList(entries, map);
        if (!mapped.changed) continue;
        fm[key] = Array.isArray(current) ? mapped.tags : mapped.tags.join(", ");
        for (const entry of entries) {
          const id = entryId(entry);
          if (id !== null && map.has(id)) changed.add(id);
        }
      }
    });
  }
  return { inlineApplied, inlineSkipped, changed: [...changed] };
}

export async function writeOptimizeRunNote(app: App, content: string, now: string): Promise<string> {
  await ensureVaultFolder(app, OPTIMIZE_OUTPUT_ROOT);
  const stamp = now.slice(0, 16).replace("T", " ").replace(":", "");
  const path = await uniqueNotePath(app, OPTIMIZE_OUTPUT_ROOT, `Tag merges ${stamp}`, "md");
  await app.vault.create(path, content);
  return path;
}
