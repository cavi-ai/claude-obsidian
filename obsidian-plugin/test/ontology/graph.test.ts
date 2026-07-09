import { describe, it, expect } from "vitest";
import { buildGraph } from "../../src/ontology/graph";
import type { ResolvedType } from "../../src/ontology/types";

const person: ResolvedType = {
  name: "person", version: 1, lineage: ["person", "entity"], properties: [],
  relations: [{ key: "works_on", targets: ["project"] }],
};
const project: ResolvedType = { name: "project", version: 1, lineage: ["project", "entity"], properties: [], relations: [] };
const resolved = new Map([["person", person], ["project", project]]);

const notes = [
  { path: "People/Franco.md", basename: "Franco", frontmatter: { type: "person", works_on: ["[[CAVI]]", "[[Ghost]]"] } },
  { path: "Projects/CAVI.md", basename: "CAVI", frontmatter: { type: "project" } },
  { path: "Journal/today.md", basename: "today" },
];

describe("buildGraph", () => {
  const g = buildGraph(notes, resolved);
  it("nodes carry their type; untyped notes are still nodes", () => {
    expect(g.nodes.get("People/Franco.md")?.type).toBe("person");
    expect(g.nodes.get("Journal/today.md")?.type).toBeUndefined();
  });
  it("resolves edge targets to paths by basename", () => {
    expect(g.edges).toEqual([
      { from: "People/Franco.md", key: "works_on", to: "CAVI", toPath: "Projects/CAVI.md" },
      { from: "People/Franco.md", key: "works_on", to: "Ghost" },
    ]);
  });
  it("resolves edge targets given as full paths", () => {
    const g2 = buildGraph(
      [
        { path: "a.md", basename: "a", frontmatter: { type: "person", works_on: ["[[Projects/CAVI.md]]"] } },
        { path: "Projects/CAVI.md", basename: "CAVI", frontmatter: { type: "project" } },
      ],
      resolved,
    );
    expect(g2.edges[0]?.toPath).toBe("Projects/CAVI.md");
  });
  it("byType lists typed notes", () => {
    expect(g.byType("person").map((n) => n.path)).toEqual(["People/Franco.md"]);
    expect(g.byType("nope")).toEqual([]);
  });
  it("neighbors returns edges touching a path in either direction", () => {
    expect(g.neighbors("Projects/CAVI.md")).toHaveLength(1);
    expect(g.neighbors("People/Franco.md")).toHaveLength(2);
  });
  it("resolves extension-less folder-qualified targets", () => {
    const g4 = buildGraph(
      [
        { path: "a.md", basename: "a", frontmatter: { type: "person", works_on: ["[[Projects/CAVI]]"] } },
        { path: "Projects/CAVI.md", basename: "CAVI", frontmatter: { type: "project" } },
      ],
      resolved,
    );
    expect(g4.edges[0]?.toPath).toBe("Projects/CAVI.md");
  });
  it("basename collisions resolve deterministically to the first note in input order", () => {
    const g5 = buildGraph(
      [
        { path: "a.md", basename: "a", frontmatter: { type: "person", works_on: ["[[CAVI]]"] } },
        { path: "Projects/CAVI.md", basename: "CAVI", frontmatter: { type: "project" } },
        { path: "Archive/CAVI.md", basename: "CAVI", frontmatter: { type: "project" } },
      ],
      resolved,
    );
    expect(g5.edges[0]?.toPath).toBe("Projects/CAVI.md");
  });
  it("a note with an unknown type is untyped (no edges extracted)", () => {
    const g3 = buildGraph([{ path: "x.md", basename: "x", frontmatter: { type: "ghost", works_on: ["[[CAVI]]"] } }], resolved);
    expect(g3.nodes.get("x.md")?.type).toBeUndefined();
    expect(g3.edges).toEqual([]);
  });
});
