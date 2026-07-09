// Parse schema notes (frontmatter markers + fenced yaml body block) into
// TypeDefs, and resolve inheritance into ResolvedTypes. Pure — the YAML
// parser is injected (obsidian's parseYaml at runtime, `yaml` in tests).

import { PROPERTY_TYPES } from "./types";
import type { PropertyDef, PropertyType, RelationDef, SchemaError, TypeDef } from "./types";

/** First fenced ```yaml block in a note body, or null. */
export function extractYamlBlock(body: string): string | null {
  const m = body.match(/^```yaml[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/m);
  return m?.[1] ?? null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isPropertyType(v: string): v is PropertyType {
  return PROPERTY_TYPES.has(v);
}

function parseProperty(raw: unknown, index: number, path: string): { def?: PropertyDef; error?: SchemaError } {
  if (!isRecord(raw)) return { error: { path, message: `properties[${index}]: must be a mapping with a key` } };
  const key = typeof raw.key === "string" ? raw.key.trim() : "";
  if (!key) return { error: { path, message: `properties[${index}]: missing key` } };
  const type = typeof raw.type === "string" ? raw.type : "string";
  if (!isPropertyType(type)) return { error: { path, message: `property '${key}' has unknown type '${type}'` } };
  const def: PropertyDef = { key, type, required: raw.required === true };
  if (typeof raw.description === "string" && raw.description.trim()) def.description = raw.description.trim();
  return { def };
}

function parseRelation(raw: unknown, index: number, path: string): { def?: RelationDef; error?: SchemaError } {
  if (!isRecord(raw)) return { error: { path, message: `relations[${index}]: must be a mapping with a key` } };
  const key = typeof raw.key === "string" ? raw.key.trim() : "";
  if (!key) return { error: { path, message: `relations[${index}]: missing key` } };
  const targets = Array.isArray(raw.targets) ? raw.targets.filter((t): t is string => typeof t === "string" && t.trim().length > 0) : [];
  if (targets.length === 0) return { error: { path, message: `relation '${key}' needs a non-empty targets list` } };
  const def: RelationDef = { key, targets };
  if (typeof raw.description === "string" && raw.description.trim()) def.description = raw.description.trim();
  return { def };
}

/**
 * Parse one schema note. Frontmatter must carry `ontology: type` and a
 * `type_name`; the body's first ```yaml block holds extends/properties/relations
 * (all optional — a bare type is legal). Never throws. Structural failures
 * (bad frontmatter, invalid YAML, non-mapping block) yield no def and one
 * error; bad individual properties/relations accumulate into `errors` while
 * the def keeps every valid entry (mirrors sources/validate.ts).
 */
export function parseSchemaNote(
  path: string,
  frontmatter: Record<string, unknown> | undefined,
  body: string,
  parseYaml: (src: string) => unknown,
): { def?: TypeDef; errors: SchemaError[] } {
  if (frontmatter?.ontology !== "type") return { errors: [{ path, message: "not a schema note (frontmatter must set `ontology: type`)" }] };
  const name = typeof frontmatter.type_name === "string" ? frontmatter.type_name.trim() : "";
  if (!name) return { errors: [{ path, message: "schema note missing `type_name`" }] };
  const version = typeof frontmatter.version === "number" && frontmatter.version > 0 ? frontmatter.version : 1;

  const errors: SchemaError[] = [];
  const def: TypeDef = { name, version, properties: [], relations: [] };
  const block = extractYamlBlock(body);
  if (block === null) return { def, errors };

  let raw: unknown;
  try {
    raw = parseYaml(block);
  } catch (e) {
    return { errors: [{ path, message: `invalid YAML in schema block: ${e instanceof Error ? e.message : String(e)}` }] };
  }
  if (raw === null || raw === undefined) return { def, errors };
  if (!isRecord(raw)) return { errors: [{ path, message: "schema block must be a YAML mapping" }] };

  if (typeof raw.extends === "string" && raw.extends.trim()) def.extendsType = raw.extends.trim();
  const props: unknown[] = Array.isArray(raw.properties) ? raw.properties : [];
  for (const [i, p] of props.entries()) {
    const r = parseProperty(p, i, path);
    if (r.error) errors.push(r.error);
    else if (r.def) def.properties.push(r.def);
  }
  const rels: unknown[] = Array.isArray(raw.relations) ? raw.relations : [];
  for (const [i, rel] of rels.entries()) {
    const r = parseRelation(rel, i, path);
    if (r.error) errors.push(r.error);
    else if (r.def) def.relations.push(r.def);
  }
  return { def, errors };
}
