import type { ConformanceIssue } from "../ontology/conform";

export type HealthSeverity = "ok" | "info" | "warning" | "error";
export type HealthSectionId = "ontology" | "links" | "research" | "index" | "inbox";
export interface HealthItem { path: string; message: string; project?: string }
export interface HealthSection { id: HealthSectionId; title: string; count: number; severity: HealthSeverity; items: HealthItem[]; fixable?: number }
export interface HealthReport { sections: HealthSection[]; scannedAt: string }
export interface HealthInput {
  typedNotes: Array<{ path: string; issues: ConformanceIssue[]; fixChanges: number }> | null;
  unresolved: Record<string, Record<string, number>>;
  research: Array<{ project: string; findings: Array<{ severity: "error" | "warning" | "info"; path: string; explanation: string }> }>;
  index: { enabled: boolean; built: boolean; failed: Array<{ path: string; message: string }> };
  inboxPending: number;
  now: string;
}

export const HEALTH_ITEM_CAP = 50;
const RANK: Record<HealthSeverity, number> = { error: 0, warning: 1, info: 2, ok: 3 };
const ORDER: HealthSectionId[] = ["ontology", "links", "research", "index", "inbox"];
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

export function scanVaultHealth(input: HealthInput): HealthReport {
  const sections: HealthSection[] = [];

  if (input.typedNotes) {
    const bad = input.typedNotes.filter((n) => n.issues.length > 0);
    sections.push({
      id: "ontology", title: "Ontology", count: bad.length, severity: bad.length > 0 ? "warning" : "ok",
      items: bad.slice(0, HEALTH_ITEM_CAP).map((n) => ({ path: n.path, message: n.issues.map((i) => i.message).join("; ") })),
      fixable: input.typedNotes.filter((n) => n.fixChanges > 0).length,
    });
  }

  const linkRows = Object.entries(input.unresolved)
    .map(([path, targets]) => ({ path, targets: Object.keys(targets), total: Object.values(targets).reduce((a, b) => a + b, 0) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || a.path.localeCompare(b.path));
  const linkCount = linkRows.reduce((a, r) => a + r.total, 0);
  sections.push({
    id: "links", title: "Broken links", count: linkCount, severity: linkCount > 0 ? "warning" : "ok",
    items: linkRows.slice(0, HEALTH_ITEM_CAP).map((r) => ({ path: r.path, message: `${plural(r.total, "broken link")}: ${r.targets.slice(0, 3).join(", ")}` })),
  });

  const findings = input.research.flatMap((p) => p.findings.map((f) => ({ ...f, project: p.project }))).filter((f) => f.severity !== "info")
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.path.localeCompare(b.path));
  sections.push({
    id: "research", title: "Research", count: findings.length,
    severity: findings[0]?.severity ?? "ok",
    items: findings.slice(0, HEALTH_ITEM_CAP).map((f) => ({ path: f.path, message: f.explanation, project: f.project })),
  });

  if (input.index.enabled) {
    const items: HealthItem[] = [
      ...(input.index.built ? [] : [{ path: "", message: "Semantic index not built yet" }]),
      ...input.index.failed,
    ];
    sections.push({
      id: "index", title: "Semantic index", count: items.length,
      severity: input.index.failed.length > 0 ? "warning" : input.index.built ? "ok" : "info",
      items: items.slice(0, HEALTH_ITEM_CAP),
    });
  }

  sections.push({
    id: "inbox", title: "Inbox", count: input.inboxPending, severity: input.inboxPending > 0 ? "info" : "ok",
    items: input.inboxPending > 0 ? [{ path: "", message: `${plural(input.inboxPending, "clip")} waiting to be enriched` }] : [],
  });

  sections.sort((a, b) => RANK[a.severity] - RANK[b.severity] || ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  return { sections, scannedAt: input.now };
}
