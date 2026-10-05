import { describe, expect, it } from "vitest";
import type { MergeCandidate, MergeEvidence } from "../../src/optimize/tagScan";
import { createOptimizeState, removeRow, selectedMerges, swapRow, toggleRow } from "../../src/view/optimizeState";

const cand = (id: string, evidence: MergeEvidence[]): MergeCandidate => ({ id, from: `${id}-from`, to: `${id}-to`, evidence, score: 1, fromCount: 1, toCount: 5 });

describe("optimize view state", () => {
  it("starts separator and plural rows checked, every other evidence unchecked", () => {
    const kinds: MergeEvidence[] = ["separator", "plural", "plural-loose", "token-order", "leaf", "typo", "semantic"];
    const state = createOptimizeState(kinds.map((k) => cand(k, [k])));
    expect(Object.fromEntries(state.rows.map((r) => [r.id, r.checked]))).toEqual({
      separator: true, plural: true, "plural-loose": false, "token-order": false, leaf: false, typo: false, semantic: false,
    });
  });

  it("checks a row that has plural evidence alongside others", () => {
    expect(createOptimizeState([cand("x", ["typo", "plural"])]).rows[0]?.checked).toBe(true);
  });

  it("toggles, swaps from/to with counts, removes, and selects without mutating", () => {
    const start = createOptimizeState([cand("a", ["typo"]), cand("b", ["plural"])]);
    const toggled = toggleRow(start, "a", true);
    expect(start.rows[0]?.checked).toBe(false);
    expect(selectedMerges(toggled)).toEqual([{ from: "a-from", to: "a-to" }, { from: "b-from", to: "b-to" }]);
    const swapped = swapRow(toggled, "a");
    expect(swapped.rows[0]).toMatchObject({ from: "a-to", to: "a-from", fromCount: 5, toCount: 1, id: "a" });
    expect(removeRow(swapped, "a").rows.map((r) => r.id)).toEqual(["b"]);
    expect(toggled.rows[0]?.from).toBe("a-from");
  });
});
