import { describe, expect, it } from "vitest";
import { HEALTH_ITEM_CAP, scanVaultHealth, type HealthInput } from "../../src/health/scan";

const base = (over: Partial<HealthInput> = {}): HealthInput => ({
  typedNotes: [],
  unresolved: {},
  research: [],
  index: { enabled: true, built: true, failed: [] },
  inboxPending: 0,
  now: "2026-10-01T00:00:00.000Z",
  ...over,
});
const section = (input: HealthInput, id: string) => scanVaultHealth(input).sections.find((s) => s.id === id);

describe("scanVaultHealth", () => {
  it("omits ontology when not seeded and index when semantic search is off", () => {
    const ids = scanVaultHealth(base({ typedNotes: null, index: { enabled: false, built: false, failed: [] } })).sections.map((s) => s.id);
    expect(ids).not.toContain("ontology");
    expect(ids).not.toContain("index");
  });

  it("reports ontology issues and fixable notes", () => {
    const s = section(base({ typedNotes: [
      { path: "a.md", issues: [{ kind: "missing-required", key: "status", message: "missing status" }], fixChanges: 1 },
      { path: "b.md", issues: [], fixChanges: 0 },
    ] }), "ontology")!;
    expect(s).toMatchObject({ count: 1, severity: "warning", fixable: 1, items: [{ path: "a.md", message: "missing status" }] });
  });

  it("counts broken link occurrences with one row per source note", () => {
    const s = section(base({ unresolved: { "a.md": { "Missing": 2, "Gone": 1 }, "b.md": {} } }), "links")!;
    expect(s.count).toBe(3);
    expect(s.items).toEqual([{ path: "a.md", message: "3 broken links: Missing, Gone" }]);
  });

  it("caps items at 50 with the uncapped count", () => {
    const unresolved: Record<string, Record<string, number>> = {};
    for (let i = 0; i < 120; i++) unresolved[`n${i}.md`] = { X: 1 };
    const s = section(base({ unresolved }), "links")!;
    expect(s.count).toBe(120);
    expect(s.items).toHaveLength(HEALTH_ITEM_CAP);
  });

  it("counts research errors and warnings, not info, and takes the worst severity", () => {
    const s = section(base({ research: [{ project: "P/Project.md", findings: [
      { severity: "warning", path: "P/e.md", explanation: "unreviewed" },
      { severity: "info", path: "P/u.md", explanation: "unused" },
      { severity: "error", path: "P/c.md", explanation: "unsupported" },
    ] }] }), "research")!;
    expect(s.count).toBe(2);
    expect(s.severity).toBe("error");
    expect(s.items.map((i) => i.path)).toEqual(["P/c.md", "P/e.md"]);
  });

  it("index: not built is info; failures are warnings with one row each", () => {
    expect(section(base({ index: { enabled: true, built: false, failed: [] } }), "index")).toMatchObject({ count: 1, severity: "info", items: [{ path: "", message: "Semantic index not built yet" }] });
    expect(section(base({ index: { enabled: true, built: true, failed: [{ path: "x.md", message: "boom" }] } }), "index")).toMatchObject({ count: 1, severity: "warning", items: [{ path: "x.md", message: "boom" }] });
  });

  it("inbox pending is info", () => {
    expect(section(base({ inboxPending: 4 }), "inbox")).toMatchObject({ count: 4, severity: "info", items: [{ path: "", message: "4 clips waiting to be enriched" }] });
  });

  it("orders sections by severity, then fixed order", () => {
    const ids = scanVaultHealth(base({
      inboxPending: 1,
      unresolved: { "a.md": { X: 1 } },
      research: [{ project: "P", findings: [{ severity: "error", path: "P/c.md", explanation: "x" }] }],
    })).sections.map((s) => s.id);
    expect(ids.slice(0, 3)).toEqual(["research", "links", "inbox"]);
  });
});
