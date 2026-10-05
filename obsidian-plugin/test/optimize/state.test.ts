import { describe, expect, it } from "vitest";
import { normalizeOptimizeState } from "../../src/optimize/state";

describe("normalizeOptimizeState", () => {
  it("returns empty for anything that is not a dismissed list", () => {
    expect(normalizeOptimizeState(undefined)).toEqual({ dismissed: [] });
    expect(normalizeOptimizeState({ dismissed: "x" })).toEqual({ dismissed: [] });
  });

  it("keeps strings only, deduped", () => {
    expect(normalizeOptimizeState({ dismissed: ["a|b", 4, null, "a|b", "c|d"] })).toEqual({ dismissed: ["a|b", "c|d"] });
  });

  it("keeps the newest 2000", () => {
    const list = Array.from({ length: 2005 }, (_, i) => `t${i}|u${i}`);
    const { dismissed } = normalizeOptimizeState({ dismissed: list });
    expect(dismissed).toHaveLength(2000);
    expect(dismissed[0]).toBe("t5|u5");
    expect(dismissed[1999]).toBe("t2004|u2004");
  });

  it("moves a re-dismissed id to the newest position", () => {
    expect(normalizeOptimizeState({ dismissed: ["a|b", "c|d", "a|b"] })).toEqual({ dismissed: ["c|d", "a|b"] });
  });
});
