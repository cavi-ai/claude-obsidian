import type { MergeCandidate, MergeEvidence } from "../optimize/tagScan";

export interface OptimizeRow {
  id: string;
  from: string;
  to: string;
  fromCount: number;
  toCount: number;
  evidence: MergeEvidence[];
  checked: boolean;
}
export interface OptimizeViewState {
  rows: OptimizeRow[];
}

const mapRow = (state: OptimizeViewState, id: string, fn: (row: OptimizeRow) => OptimizeRow): OptimizeViewState => ({
  rows: state.rows.map((row) => (row.id === id ? fn(row) : row)),
});

export function createOptimizeState(candidates: MergeCandidate[]): OptimizeViewState {
  return {
    rows: candidates.map((c) => ({
      id: c.id,
      from: c.from,
      to: c.to,
      fromCount: c.fromCount,
      toCount: c.toCount,
      evidence: [...c.evidence],
      checked: c.evidence.includes("separator") || c.evidence.includes("plural"),
    })),
  };
}

export function toggleRow(state: OptimizeViewState, id: string, checked: boolean): OptimizeViewState {
  return mapRow(state, id, (row) => ({ ...row, checked }));
}

export function swapRow(state: OptimizeViewState, id: string): OptimizeViewState {
  return mapRow(state, id, (row) => ({ ...row, from: row.to, to: row.from, fromCount: row.toCount, toCount: row.fromCount }));
}

export function removeRow(state: OptimizeViewState, id: string): OptimizeViewState {
  return { rows: state.rows.filter((row) => row.id !== id) };
}

export function selectedMerges(state: OptimizeViewState): Array<{ from: string; to: string }> {
  return state.rows.filter((row) => row.checked).map((row) => ({ from: row.from, to: row.to }));
}
