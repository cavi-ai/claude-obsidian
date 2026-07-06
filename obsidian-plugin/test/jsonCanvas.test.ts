import { describe, it, expect } from "vitest";
import { buildCanvas, serializeCanvas } from "../src/canvas/jsonCanvas";

describe("buildCanvas", () => {
  it("normalizes nodes with generated ids, inferred types, and defaults", () => {
    const c = buildCanvas(
      [{ text: "Root idea" }, { file: "Projects/Foo.md" }, { url: "https://example.com" }],
      [],
    );
    expect(c.nodes.map((n) => n.id)).toEqual(["node-1", "node-2", "node-3"]);
    expect(c.nodes.map((n) => n.type)).toEqual(["text", "file", "link"]);
    expect(c.nodes[0]).toMatchObject({ text: "Root idea", width: 380, height: 180 });
    expect(c.nodes[1]).toMatchObject({ file: "Projects/Foo.md" });
  });

  it("lays out unplaced nodes in layers by edge depth", () => {
    const c = buildCanvas(
      [
        { id: "a", text: "root" },
        { id: "b", text: "child" },
        { id: "c", text: "grandchild" },
        { id: "d", text: "second child" },
      ],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "a", to: "d" },
      ],
    );
    const byId = new Map(c.nodes.map((n) => [n.id, n]));
    expect(byId.get("a")!.x).toBe(0);
    expect(byId.get("b")!.x).toBe(480);
    expect(byId.get("c")!.x).toBe(960);
    expect(byId.get("d")!.x).toBe(480);
    expect(byId.get("b")!.y).not.toBe(byId.get("d")!.y); // same column, different rows
  });

  it("respects explicit coordinates and survives cycles", () => {
    const c = buildCanvas(
      [
        { id: "a", text: "pinned", x: 42, y: 24 },
        { id: "b", text: "loop" },
      ],
      [
        { from: "a", to: "b" },
        { from: "b", to: "a" }, // cycle
      ],
    );
    expect(c.nodes.find((n) => n.id === "a")).toMatchObject({ x: 42, y: 24 });
    expect(Number.isNaN(c.nodes.find((n) => n.id === "b")!.x)).toBe(false);
  });

  it("normalizes edges with sides and labels", () => {
    const c = buildCanvas([{ id: "a", text: "x" }, { id: "b", text: "y" }], [{ from: "a", to: "b", label: "leads to" }]);
    expect(c.edges[0]).toEqual({ id: "edge-1", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left", label: "leads to" });
  });

  it("rejects invalid proposals with actionable messages", () => {
    expect(() => buildCanvas([], [])).toThrow(/at least one node/i);
    expect(() => buildCanvas([{ id: "a", text: "x" }, { id: "a", text: "y" }], [])).toThrow(/duplicate/i);
    expect(() => buildCanvas([{ id: "a" }], [])).toThrow(/text/i);
    expect(() => buildCanvas([{ id: "a", text: "x" }], [{ from: "a", to: "ghost" }])).toThrow(/unknown node/i);
    const many = Array.from({ length: 61 }, (_, i) => ({ text: `n${i}` }));
    expect(() => buildCanvas(many, [])).toThrow(/too many/i);
  });
});

describe("serializeCanvas", () => {
  it("round-trips as valid JSON Canvas", () => {
    const c = buildCanvas([{ id: "a", text: "hello" }], []);
    const parsed = JSON.parse(serializeCanvas(c)) as { nodes: unknown[]; edges: unknown[] };
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.edges).toEqual([]);
  });
});
