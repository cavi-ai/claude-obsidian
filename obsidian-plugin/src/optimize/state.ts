export interface OptimizeState {
  dismissed: string[];
}

const MAX_DISMISSED = 2000;

export function normalizeOptimizeState(raw: unknown): OptimizeState {
  const list = (raw as { dismissed?: unknown } | null)?.dismissed;
  if (!Array.isArray(list)) return { dismissed: [] };
  const seen = new Set<string>();
  const newestFirst: string[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const entry: unknown = list[i];
    if (typeof entry !== "string" || seen.has(entry)) continue;
    seen.add(entry);
    newestFirst.push(entry);
    if (newestFirst.length === MAX_DISMISSED) break;
  }
  return { dismissed: newestFirst.reverse() };
}
