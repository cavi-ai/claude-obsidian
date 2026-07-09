import { describe, it, expect } from "vitest";
import { buildBaseFile } from "../src/bases/baseFile";

describe("buildBaseFile", () => {
  it("emits the documented schema shape", () => {
    const yaml = buildBaseFile({
      filters: ['file.hasTag("book")'],
      formulas: { ppu: "(price / age).toFixed(2)" },
      properties: { status: "Status" },
      views: [
        {
          type: "table",
          name: "Reading list",
          order: ["file.name", "note.status", "formula.ppu"],
          groupBy: { property: "note.status", direction: "DESC" },
          limit: 50,
        },
      ],
    });
    expect(yaml).toBe(`filters:
  and:
    - "file.hasTag(\\"book\\")"
formulas:
  ppu: "(price / age).toFixed(2)"
properties:
  status:
    displayName: Status
views:
  - type: table
    name: Reading list
    groupBy:
      property: note.status
      direction: DESC
    order:
      - file.name
      - note.status
      - formula.ppu
    limit: 50
`);
  });

  it("defaults the view type to table and supports view-level filters", () => {
    const yaml = buildBaseFile({
      views: [{ name: "Open", filters: ['note.status == "open"'] }],
    });
    expect(yaml).toContain("- type: table");
    expect(yaml).toContain('- "note.status == \\"open\\""');
  });

  it("rejects invalid proposals", () => {
    expect(() => buildBaseFile({ views: [] })).toThrow(/at least one view/i);
    expect(() => buildBaseFile({ views: [{ name: " " }] })).toThrow(/name/i);
    expect(() => buildBaseFile({ views: [{ name: "v", limit: -1 }] })).toThrow(/positive/i);
    expect(() => buildBaseFile({ filters: [" "], views: [{ name: "v" }] })).toThrow(/non-empty/i);
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `v${i}` }));
    expect(() => buildBaseFile({ views: many })).toThrow(/too many/i);
  });

  it("quotes YAML-hostile scalars", () => {
    const yaml = buildBaseFile({ properties: { status: "Status: current" }, views: [{ name: "true" }] });
    expect(yaml).toContain('displayName: "Status: current"');
    expect(yaml).toContain('name: "true"');
  });
});
