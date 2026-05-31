import { parseTagSuggestions } from "./frontmatter";

/** Pure parser for the tagger model's two-line output. Obsidian-free for tests. */
export function parseTaggerOutput(raw: string): { tags: string[]; summary: string } {
  let tags: string[] = [];
  let summary = "";
  for (const line of raw.split("\n")) {
    const m = /^\s*tags\s*:\s*(.+)$/i.exec(line);
    const s = /^\s*summary\s*:\s*(.+)$/i.exec(line);
    if (m) tags = parseTagSuggestions(m[1]);
    else if (s) summary = s[1].trim();
  }
  // Fallback: if the model ignored the format, treat the whole thing as tags.
  if (tags.length === 0) tags = parseTagSuggestions(raw);
  return { tags, summary };
}
