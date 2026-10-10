// One tool, declared once: what it advertises, whether it changes the vault, when it is listed, and how it runs. Pure.

import type { McpToolDef } from "./protocol";

export interface ToolRecord {
  def: McpToolDef;
  /** Changes the vault. Required, so every tool states it; advertised as `annotations.readOnlyHint`. */
  writes: boolean;
  /** Listed while this holds (default true). An unlisted tool's handler still reports why it is unavailable. */
  listed?: boolean;
  run(args: Record<string, unknown>): Promise<string>;
}

/** The definition a client sees, with its write flag as the MCP read-only annotation. */
export function advertise(record: ToolRecord): McpToolDef {
  return { ...record.def, annotations: { ...record.def.annotations, readOnlyHint: !record.writes } };
}
