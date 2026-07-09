import { describe, it, expect } from "vitest";
import { conform } from "../../src/ontology/conform";
import type { ResolvedType } from "../../src/ontology/types";

const person: ResolvedType = {
  name: "person",
  version: 1,
  lineage: ["person", "entity"],
  properties: [
    { key: "role", type: "string", required: true },
    { key: "age", type: "number", required: false },
    { key: "topics", type: "string[]", required: false },
  ],
  relations: [{ key: "works_on", targets: ["project"] }],
};

const project: ResolvedType = { name: "project", version: 1, lineage: ["project", "entity"], properties: [], relations: [] };

const lookup = (target: string): ResolvedType | undefined => (target === "CAVI" ? project : target === "Ada" ? person : undefined);

describe("conform", () => {
  it("passes a fully conforming note", () => {
    const r = conform({ type: "person", role: "engineer", works_on: ["[[CAVI]]"], title: "F", tags: ["x"] }, person, lookup);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });
  it("flags missing required properties", () => {
    const r = conform({ type: "person" }, person, lookup);
    expect(r.ok).toBe(false);
    expect(r.issues).toEqual([expect.objectContaining({ kind: "missing-required", key: "role" })]);
  });
  it("flags unknown keys but allows universal base keys", () => {
    const r = conform({ type: "person", role: "x", summary: "s", created: "2026-07-08", banana: 1 }, person, lookup);
    expect(r.issues).toEqual([expect.objectContaining({ kind: "unknown-key", key: "banana" })]);
  });
  it("auto-fixes a scalar where a list is expected (string[] and relations)", () => {
    const r = conform({ type: "person", role: "x", topics: "ai", works_on: "[[CAVI]]" }, person, lookup);
    expect(r.ok).toBe(true);
    expect(r.fixed.topics).toEqual(["ai"]);
    expect(r.fixed.works_on).toEqual(["[[CAVI]]"]);
  });
  it("auto-fixes numeric strings for number properties", () => {
    const r = conform({ type: "person", role: "x", age: "41" }, person, lookup);
    expect(r.ok).toBe(true);
    expect(r.fixed.age).toBe(41);
  });
  it("flags non-coercible wrong types", () => {
    const r = conform({ type: "person", role: "x", age: "old" }, person, lookup);
    expect(r.issues).toEqual([expect.objectContaining({ kind: "wrong-type", key: "age" })]);
  });
  it("flags relation targets whose type violates the constraint", () => {
    const r = conform({ type: "person", role: "x", works_on: ["[[Ada]]"] }, person, lookup);
    expect(r.issues).toEqual([expect.objectContaining({ kind: "bad-relation-target", key: "works_on" })]);
  });
  it("allows dangling relation targets (Obsidian semantics)", () => {
    const r = conform({ type: "person", role: "x", works_on: ["[[Not Yet Created]]"] }, person, lookup);
    expect(r.ok).toBe(true);
  });
  it("accepts any typed target when the relation targets the root", () => {
    const anyRel: ResolvedType = { ...person, relations: [{ key: "related", targets: ["entity"] }] };
    const r = conform({ type: "person", role: "x", related: ["[[Ada]]"] }, anyRel, lookup);
    expect(r.ok).toBe(true);
  });
  it("reports unknown-type when the resolved type is undefined", () => {
    const r = conform({ type: "ghost" }, undefined, lookup);
    expect(r.issues).toEqual([expect.objectContaining({ kind: "unknown-type" })]);
  });
  it("does not mutate the input frontmatter", () => {
    const fm = { type: "person", role: "x", topics: "ai" };
    conform(fm, person, lookup);
    expect(fm.topics).toBe("ai");
  });
});
