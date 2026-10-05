import { normalizeTag } from "../indexing/frontmatter";
import type { TagStat, Vocabulary } from "./vocabulary";

export type TagMatch = "exact" | "variant" | "new";
export type VariantRule = "separator" | "plural";
export interface ResolvedTag {
  input: string;
  tag: string;
  match: TagMatch;
  via?: VariantRule;
}

const RULES: VariantRule[] = ["separator", "plural"];
const PLURAL_INVARIANT = new Set(["news", "series", "species", "means", "windows", "rails", "pandas", "goods", "customs"]);

function singularize(word: string): string {
  if (word.length <= 3 || PLURAL_INVARIANT.has(word)) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(sses|xes|zes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function variantKeys(tag: string): Record<VariantRule, string> {
  const segments = tag.split("/");
  return {
    separator: segments.map((s) => s.replace(/[-_]/g, "")).join("/"),
    plural: segments
      .map((s) => s.split(/[-_]/).map(singularize).join(""))
      .join("/"),
  };
}

function better(a: TagStat, b: TagStat, input: string): boolean {
  if (a.count !== b.count) return a.count > b.count;
  if ((a.tag === input) !== (b.tag === input)) return a.tag === input;
  if (a.tag.length !== b.tag.length) return a.tag.length < b.tag.length;
  return a.tag < b.tag;
}

export function resolveTags(raw: string[], vocab: Vocabulary): ResolvedTag[] {
  const index: Record<VariantRule, Map<string, TagStat[]>> = { separator: new Map(), plural: new Map() };
  for (const stat of vocab.values()) {
    const keys = variantKeys(stat.tag);
    for (const rule of RULES) {
      const list = index[rule].get(keys[rule]);
      if (list) list.push(stat);
      else index[rule].set(keys[rule], [stat]);
    }
  }

  const out: ResolvedTag[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const input = normalizeTag(r);
    if (input.length === 0) continue;
    const keys = variantKeys(input);
    const family = new Map<string, TagStat>();
    const exact = vocab.get(input);
    if (exact) family.set(exact.tag, exact);
    for (const rule of RULES) for (const s of index[rule].get(keys[rule]) ?? []) family.set(s.tag, s);

    let resolved: ResolvedTag;
    if (family.size === 0) {
      resolved = { input, tag: input, match: "new" };
    } else {
      let winner: TagStat | undefined;
      for (const s of family.values()) if (!winner || better(s, winner, input)) winner = s;
      if (winner!.tag === input) {
        resolved = { input, tag: input, match: "exact" };
      } else {
        const wk = variantKeys(winner!.tag);
        const via = RULES.find((rule) => wk[rule] === keys[rule]);
        resolved = { input, tag: winner!.tag, match: "variant", via };
      }
    }
    if (seen.has(resolved.tag)) continue;
    seen.add(resolved.tag);
    out.push(resolved);
  }
  return out;
}
