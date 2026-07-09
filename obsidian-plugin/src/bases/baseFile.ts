// Obsidian Bases (.base) generation (spec 2026-07-06): validate a model-
// proposed database view and emit the documented YAML schema (verified against
// obsidian.md/help/bases/syntax on 2026-07-06). Pure, dependency-free.

export interface ProposedBaseView {
  /** View type; "table" (default) or "cards". */
  type?: string;
  name: string;
  /** Property order (e.g. "file.name", "note.status", "formula.ppu"). */
  order?: string[];
  /** Group rows by a property. */
  groupBy?: { property: string; direction?: "ASC" | "DESC" };
  /** Optional row cap. */
  limit?: number;
  /** View-specific filter statements (AND-ed). */
  filters?: string[];
}

export interface ProposedBase {
  /** Global filter statements, AND-ed (e.g. 'file.hasTag("book")'). */
  filters?: string[];
  /** formula name → expression. */
  formulas?: Record<string, string>;
  /** property id → display name. */
  properties?: Record<string, string>;
  views: ProposedBaseView[];
}

const MAX_VIEWS = 8;

/** Validate and serialize a proposal to .base YAML. Throws actionable errors. */
export function buildBaseFile(base: ProposedBase): string {
  if (!Array.isArray(base.views) || base.views.length === 0) throw new Error("A base needs at least one view.");
  if (base.views.length > MAX_VIEWS) throw new Error(`Too many views (${base.views.length}); at most ${MAX_VIEWS}.`);
  for (const [i, v] of base.views.entries()) {
    if (!v.name?.trim()) throw new Error(`View ${i + 1} needs a name.`);
    if (v.limit !== undefined && (!Number.isInteger(v.limit) || v.limit <= 0)) {
      throw new Error(`View "${v.name}": limit must be a positive integer.`);
    }
  }
  for (const f of base.filters ?? []) {
    if (!f.trim()) throw new Error("Filter statements must be non-empty.");
  }

  const lines: string[] = [];
  if (base.filters?.length) {
    lines.push("filters:", "  and:");
    for (const f of base.filters) lines.push(`    - ${q(f)}`);
  }
  if (base.formulas && Object.keys(base.formulas).length > 0) {
    lines.push("formulas:");
    for (const [k, v] of Object.entries(base.formulas)) lines.push(`  ${k}: ${q(v)}`);
  }
  if (base.properties && Object.keys(base.properties).length > 0) {
    lines.push("properties:");
    for (const [k, v] of Object.entries(base.properties)) {
      lines.push(`  ${k}:`, `    displayName: ${q(v)}`);
    }
  }
  lines.push("views:");
  for (const v of base.views) {
    lines.push(`  - type: ${q(v.type?.trim() || "table")}`);
    lines.push(`    name: ${q(v.name.trim())}`);
    if (v.filters?.length) {
      lines.push("    filters:", "      and:");
      for (const f of v.filters) lines.push(`        - ${q(f)}`);
    }
    if (v.groupBy?.property) {
      lines.push("    groupBy:", `      property: ${q(v.groupBy.property)}`, `      direction: ${v.groupBy.direction ?? "ASC"}`);
    }
    if (v.order?.length) {
      lines.push("    order:");
      for (const p of v.order) lines.push(`      - ${q(p)}`);
    }
    if (v.limit !== undefined) lines.push(`    limit: ${v.limit}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Quote a YAML scalar only when needed (JSON string quoting is valid YAML). */
function q(s: string): string {
  if (/^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u.test(s) && !/^(true|false|null|yes|no)$/i.test(s)) return s;
  return JSON.stringify(s);
}
