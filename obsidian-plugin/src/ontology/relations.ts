// Typed relations as frontmatter wikilink lists (spec 2026-07-08). Parsing and
// edge extraction are pure; serialization reuses indexing/buildFrontmatter's
// quoting (wikilinks contain '[' so they always emit quoted).

import type { ResolvedType } from "./types";

export interface RelationEdge {
  /** Vault path of the note holding the relation field. */
  from: string;
  /** Relation key (e.g. "works_on"). */
  key: string;
  /** Link target as written — a basename or vault path, alias stripped. */
  to: string;
}

export function formatWikilink(target: string): string {
  return `[[${target}]]`;
}

/** "[[Target|alias]]" → "Target"; bare strings pass through; empty → null. */
export function parseWikilink(value: string): string | null {
  const trimmed = value.trim();
  const m = trimmed.match(/^\[\[(.*)\]\]$/);
  const inner = (m ? (m[1] ?? "") : trimmed).split("|")[0]?.trim() ?? "";
  return inner.length > 0 ? inner : null;
}

/** Normalize a frontmatter relation value (scalar or list) into target names. */
export function relationTargets(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const t = parseWikilink(v);
    if (t) out.push(t);
  }
  return out;
}

/** Typed edges declared by a note's frontmatter, per its resolved type. */
export function extractEdges(path: string, frontmatter: Record<string, unknown>, type: ResolvedType): RelationEdge[] {
  const edges: RelationEdge[] = [];
  for (const rel of type.relations) {
    for (const to of relationTargets(frontmatter[rel.key])) {
      edges.push({ from: path, key: rel.key, to });
    }
  }
  return edges;
}
