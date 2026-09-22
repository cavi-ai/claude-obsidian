// Frontmatter and tag filters for vault_search; pure, no Obsidian imports.

export interface SearchFilter {
  type?: string;
  project?: string;
  tag?: string;
}

const PROVENANCE_KEYS = ["type", "project", "review_state", "source_kind", "canonical_id", "url"] as const;
const FILTER_KEYS = ["type", "project", "tag"] as const;

function text(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function parseSearchFilter(args: Record<string, unknown>): SearchFilter | null {
  const type = text(args.type);
  const project = text(args.project);
  const tag = text(args.tag)?.replace(/^#/, "");
  const filter: SearchFilter = { ...(type ? { type } : {}), ...(project ? { project } : {}), ...(tag ? { tag } : {}) };
  return Object.keys(filter).length > 0 ? filter : null;
}

export function normalizeProjectRef(v: string): string {
  const link = v.trim().match(/^\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]$/);
  return (link?.[1] ?? v).trim().replace(/\.md$/i, "").toLowerCase();
}

function projectMatches(value: unknown, wanted: string): boolean {
  const s = text(value);
  if (!s) return false;
  const have = normalizeProjectRef(s);
  const want = normalizeProjectRef(wanted);
  return have === want || have.endsWith(`/${want}`);
}

function tagMatches(tags: readonly string[], wanted: string): boolean {
  const w = wanted.toLowerCase();
  return tags.some((t) => {
    const x = t.replace(/^#/, "").toLowerCase();
    return x === w || x.startsWith(`${w}/`);
  });
}

export function matchesSearchFilter(frontmatter: Record<string, unknown> | undefined, tags: readonly string[], filter: SearchFilter): boolean {
  if (filter.type !== undefined && text(frontmatter?.type) !== filter.type) return false;
  if (filter.project !== undefined && !projectMatches(frontmatter?.project, filter.project)) return false;
  if (filter.tag !== undefined && !tagMatches(tags, filter.tag)) return false;
  return true;
}

export function hitMetadata(frontmatter: Record<string, unknown> | undefined): string {
  if (!frontmatter) return "";
  return PROVENANCE_KEYS.flatMap((k) => {
    const v = text(frontmatter[k]);
    return v ? [`${k}: ${v}`] : [];
  }).join(" · ");
}

export function describeFilter(filter: SearchFilter): string {
  return FILTER_KEYS.flatMap((k) => (filter[k] !== undefined ? [`${k}: ${filter[k]}`] : [])).join(", ");
}
