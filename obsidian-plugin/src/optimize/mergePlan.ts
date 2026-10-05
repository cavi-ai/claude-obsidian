import { buildFrontmatter, normalizeTag } from "../indexing/frontmatter";

export interface NoteTagInput {
  path: string;
  frontmatterTags: string[];
  inline: Array<{ tag: string; start: number; end: number }>;
}
export interface NoteMergePlan {
  path: string;
  before: string[];
  after: string[];
  inline: Array<{ start: number; end: number; from: string; to: string }>;
}

export const OPTIMIZE_OUTPUT_ROOT = "Claude/Optimize";

const wikiTarget = (path: string) => path.replace(/\.md$/i, "");

export function collapseMerges(merges: Array<{ from: string; to: string }>): { map: Map<string, string>; cycles: string[][] } {
  const direct = new Map<string, string>();
  for (const m of merges) {
    const from = normalizeTag(m.from);
    const to = normalizeTag(m.to);
    if (!from || !to || from === to || direct.has(from)) continue;
    direct.set(from, to);
  }
  const map = new Map<string, string>();
  const cycles: string[][] = [];
  const reported = new Set<string>();
  for (const start of direct.keys()) {
    const path: string[] = [];
    const seen = new Map<string, number>();
    let cur: string | undefined = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.set(cur, path.length);
      path.push(cur);
      cur = direct.get(cur);
    }
    if (cur === undefined) {
      map.set(start, path[path.length - 1] as string);
      continue;
    }
    const cycle = path.slice(seen.get(cur));
    const first = cycle.indexOf([...cycle].sort()[0] as string);
    const rotated = [...cycle.slice(first), ...cycle.slice(0, first)];
    const key = rotated.join("|");
    if (!reported.has(key)) {
      reported.add(key);
      cycles.push(rotated);
    }
  }
  return { map, cycles };
}

export function mapTagList(tags: string[], map: ReadonlyMap<string, string>): { tags: string[]; changed: boolean } {
  const out: string[] = [];
  const seen = new Set<string>();
  let changed = false;
  for (const entry of tags) {
    const key = normalizeTag(entry);
    const target = map.get(key);
    if (target !== undefined) changed = true;
    const value = target ?? entry;
    const norm = target ?? key;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(value);
  }
  return { tags: out, changed };
}

export function planTagMerges(map: ReadonlyMap<string, string>, notes: NoteTagInput[]): NoteMergePlan[] {
  const plans: NoteMergePlan[] = [];
  for (const note of notes) {
    const mapped = mapTagList(note.frontmatterTags, map);
    const inline: NoteMergePlan["inline"] = [];
    for (const t of note.inline) {
      const from = normalizeTag(t.tag);
      const to = map.get(from);
      if (to !== undefined) inline.push({ start: t.start, end: t.end, from, to });
    }
    if (!mapped.changed && inline.length === 0) continue;
    plans.push({ path: note.path, before: note.frontmatterTags, after: mapped.tags, inline });
  }
  return plans;
}

export function rewriteInlineTags(
  content: string,
  edits: NoteMergePlan["inline"],
): { content: string; applied: number; skipped: number } {
  let out = content;
  let applied = 0;
  let skipped = 0;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    if (out.slice(edit.start, edit.end).toLowerCase() !== `#${edit.from}`) {
      skipped++;
      continue;
    }
    out = `${out.slice(0, edit.start)}#${edit.to}${out.slice(edit.end)}`;
    applied++;
  }
  return { content: out, applied, skipped };
}

export function renderRunNote(applied: Array<{ from: string; to: string; paths: string[] }>, now: string): string {
  const notes = new Set(applied.flatMap((m) => m.paths));
  const frontmatter = buildFrontmatter({
    type: "optimize-run",
    created: now,
    merges: applied.length,
    notes: notes.size,
  });
  const lines = [frontmatter, "", "# Tag merges", ""];
  for (const m of applied) {
    lines.push(`- \`${m.from}\` → \`${m.to}\``);
    for (const p of m.paths) lines.push(`  - [[${wikiTarget(p)}]]`);
  }
  return `${lines.join("\n")}\n`;
}
