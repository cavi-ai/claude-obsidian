// In-memory typed graph projected from note frontmatter (spec 2026-07-08 §2).
// NEVER a store — the vault is the only source of truth. Rebuilt on demand;
// callers pass note metadata (from Obsidian's metadataCache at runtime).

import { extractEdges } from "./relations";
import type { ResolvedType } from "./types";

export interface GraphNode {
  path: string;
  basename: string;
  /** Frontmatter `type` when it resolves against the registry. */
  type?: string | undefined;
}

export interface GraphEdge {
  from: string;
  key: string;
  /** Target as written (basename or path). */
  to: string;
  /** Vault path when the target resolves to a real note. */
  toPath?: string | undefined;
}

export interface NoteMeta {
  path: string;
  basename: string;
  frontmatter?: Record<string, unknown> | undefined;
}

export interface OntologyGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  byType(type: string): GraphNode[];
  neighbors(path: string): GraphEdge[];
}

export function buildGraph(notes: NoteMeta[], resolved: Map<string, ResolvedType>): OntologyGraph {
  const nodes = new Map<string, GraphNode>();
  const byBasename = new Map<string, string>();
  for (const n of notes) {
    const typeName = typeof n.frontmatter?.type === "string" ? n.frontmatter.type : undefined;
    const node: GraphNode = { path: n.path, basename: n.basename };
    if (typeName && resolved.has(typeName)) node.type = typeName;
    nodes.set(n.path, node);
    if (!byBasename.has(n.basename)) byBasename.set(n.basename, n.path);
  }

  const edges: GraphEdge[] = [];
  for (const n of notes) {
    const node = nodes.get(n.path);
    if (!node?.type || !n.frontmatter) continue;
    const type = resolved.get(node.type);
    if (!type) continue;
    for (const e of extractEdges(n.path, n.frontmatter, type)) {
      const toPath = nodes.has(e.to) ? e.to : byBasename.get(e.to);
      edges.push(toPath !== undefined ? { ...e, toPath } : { ...e });
    }
  }

  return {
    nodes,
    edges,
    byType: (type) => [...nodes.values()].filter((n) => n.type === type),
    neighbors: (path) => edges.filter((e) => e.from === path || e.toPath === path),
  };
}
