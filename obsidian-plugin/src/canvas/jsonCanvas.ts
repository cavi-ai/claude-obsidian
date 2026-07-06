// JSON Canvas (.canvas) generation (spec 2026-07-06): validate and normalize a
// model-proposed node/edge graph into Obsidian's JSON Canvas 1.0 format, with
// deterministic auto-layout for nodes without coordinates. Pure.

export interface ProposedCanvasNode {
  id?: string;
  /** Inferred when omitted: file → "file", url → "link", else "text". */
  type?: "text" | "file" | "link";
  text?: string;
  /** Vault path for file nodes (e.g. "Projects/Foo.md"). */
  file?: string;
  url?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Canvas preset color "1".."6" or hex. */
  color?: string;
}

export interface ProposedCanvasEdge {
  from: string;
  to: string;
  label?: string;
}

export interface CanvasNode {
  id: string;
  type: "text" | "file" | "link";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  url?: string;
  color?: string;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: "right";
  toNode: string;
  toSide: "left";
  label?: string;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

const MAX_NODES = 60;
const NODE_W = 380;
const NODE_H = 180;
const COL_GAP = 480;
const ROW_GAP = 240;

/**
 * Validate the proposal and produce canvas data. Nodes without coordinates get
 * a deterministic layered layout (columns = BFS depth from the roots, rows =
 * arrival order), so the model can think purely in graph terms.
 */
export function buildCanvas(nodes: ProposedCanvasNode[], edges: ProposedCanvasEdge[]): CanvasData {
  if (nodes.length === 0) throw new Error("A canvas needs at least one node.");
  if (nodes.length > MAX_NODES) throw new Error(`Too many nodes (${nodes.length}); at most ${MAX_NODES}.`);

  const ids = new Set<string>();
  const normalized: CanvasNode[] = nodes.map((n, i) => {
    const id = n.id?.trim() || `node-${i + 1}`;
    if (ids.has(id)) throw new Error(`Duplicate node id: ${id}`);
    ids.add(id);
    const type = n.type ?? (n.file ? "file" : n.url ? "link" : "text");
    if (type === "text" && !n.text?.trim()) throw new Error(`Text node "${id}" needs non-empty text.`);
    if (type === "file" && !n.file?.trim()) throw new Error(`File node "${id}" needs a vault path.`);
    if (type === "link" && !n.url?.trim()) throw new Error(`Link node "${id}" needs a url.`);
    return {
      id,
      type,
      x: n.x ?? Number.NaN, // resolved by layout below
      y: n.y ?? Number.NaN,
      width: n.width ?? NODE_W,
      height: n.height ?? NODE_H,
      ...(type === "text" ? { text: n.text!.trim() } : {}),
      ...(type === "file" ? { file: n.file!.trim() } : {}),
      ...(type === "link" ? { url: n.url!.trim() } : {}),
      ...(n.color ? { color: n.color } : {}),
    };
  });

  const normalizedEdges: CanvasEdge[] = edges.map((e, i) => {
    if (!ids.has(e.from)) throw new Error(`Edge ${i + 1} references unknown node "${e.from}".`);
    if (!ids.has(e.to)) throw new Error(`Edge ${i + 1} references unknown node "${e.to}".`);
    return {
      id: `edge-${i + 1}`,
      fromNode: e.from,
      fromSide: "right",
      toNode: e.to,
      toSide: "left",
      ...(e.label?.trim() ? { label: e.label.trim() } : {}),
    };
  });

  layoutMissing(normalized, normalizedEdges);
  return { nodes: normalized, edges: normalizedEdges };
}

/** Serialize to the .canvas file format (pretty-printed JSON Canvas 1.0). */
export function serializeCanvas(data: CanvasData): string {
  return `${JSON.stringify(data, null, "\t")}\n`;
}

/** Layered auto-layout for nodes the model left unplaced. Deterministic. */
function layoutMissing(nodes: CanvasNode[], edges: CanvasEdge[]): void {
  const depth = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const n of nodes) incoming.set(n.id, 0);
  for (const e of edges) incoming.set(e.toNode, (incoming.get(e.toNode) ?? 0) + 1);

  // BFS from the roots (no incoming edges); cycles and orphans fall back to depth 0.
  const queue = nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id);
  for (const id of queue) depth.set(id, 0);
  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = depth.get(id) ?? 0;
    for (const e of edges) {
      if (e.fromNode !== id) continue;
      if (!depth.has(e.toNode)) {
        depth.set(e.toNode, d + 1);
        queue.push(e.toNode);
      }
    }
  }

  const rowByCol = new Map<number, number>();
  for (const n of nodes) {
    if (!Number.isNaN(n.x) && !Number.isNaN(n.y)) continue;
    const col = depth.get(n.id) ?? 0;
    const row = rowByCol.get(col) ?? 0;
    rowByCol.set(col, row + 1);
    n.x = col * COL_GAP;
    n.y = row * ROW_GAP;
  }
}
