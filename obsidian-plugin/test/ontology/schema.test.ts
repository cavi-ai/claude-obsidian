import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import { extractYamlBlock, parseSchemaNote } from "../../src/ontology/schema";

const FM = { ontology: "type", type_name: "person", version: 1 };

const BODY = [
  "Some human documentation.",
  "",
  "```yaml",
  "extends: entity",
  "properties:",
  "  - key: role",
  "    type: string",
  "relations:",
  "  - key: works_on",
  "    targets: [project]",
  "    description: projects this person contributes to",
  "```",
  "",
  "More prose (ignored).",
].join("\n");

describe("extractYamlBlock", () => {
  it("extracts the first fenced yaml block", () => {
    expect(extractYamlBlock(BODY)).toContain("extends: entity");
  });
  it("returns null when there is no yaml block", () => {
    expect(extractYamlBlock("# just prose\n```js\nx\n```")).toBeNull();
  });
});

describe("parseSchemaNote", () => {
  it("parses a valid schema note into a TypeDef", () => {
    const r = parseSchemaNote("Ontology/person.md", FM, BODY, parseYaml);
    expect(r.error).toBeUndefined();
    expect(r.def).toEqual({
      name: "person",
      version: 1,
      extendsType: "entity",
      properties: [{ key: "role", type: "string", required: false }],
      relations: [{ key: "works_on", targets: ["project"], description: "projects this person contributes to" }],
    });
  });
  it("rejects notes without the ontology marker", () => {
    const r = parseSchemaNote("Ontology/x.md", { type_name: "x" }, BODY, parseYaml);
    expect(r.def).toBeUndefined();
    expect(r.error?.message).toMatch(/ontology: type/);
  });
  it("rejects a missing type_name", () => {
    const r = parseSchemaNote("Ontology/x.md", { ontology: "type" }, BODY, parseYaml);
    expect(r.error?.message).toMatch(/type_name/);
  });
  it("defaults version to 1 and tolerates a missing yaml block (bare type)", () => {
    const r = parseSchemaNote("Ontology/entity.md", { ontology: "type", type_name: "entity" }, "Just prose.", parseYaml);
    expect(r.def).toEqual({ name: "entity", version: 1, properties: [], relations: [] });
  });
  it("rejects an unknown property type", () => {
    const body = "```yaml\nproperties:\n  - key: x\n    type: blob\n```";
    const r = parseSchemaNote("Ontology/x.md", FM, body, parseYaml);
    expect(r.error?.message).toMatch(/blob/);
  });
  it("rejects a relation without targets", () => {
    const body = "```yaml\nrelations:\n  - key: knows\n```";
    const r = parseSchemaNote("Ontology/x.md", FM, body, parseYaml);
    expect(r.error?.message).toMatch(/targets/);
  });
  it("reports YAML syntax errors as SchemaError, not exceptions", () => {
    const body = "```yaml\nproperties: [unclosed\n```";
    const r = parseSchemaNote("Ontology/x.md", FM, body, parseYaml);
    expect(r.def).toBeUndefined();
    expect(r.error).toBeDefined();
  });
});
