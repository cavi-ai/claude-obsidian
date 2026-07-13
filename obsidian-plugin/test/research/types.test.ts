import { describe, expect, it } from "vitest";
import { isReviewState, RESEARCH_TYPE_NAMES } from "../../src/research/types";
import { SEED_TYPES } from "../../src/ontology/seed";

describe("research vocabulary", () => {
  it("accepts only persisted review states", () => {
    expect(["proposed", "reviewed", "rejected"].every(isReviewState)).toBe(true);
    expect(isReviewState("accepted")).toBe(false);
  });

  it("ships every research ontology type", () => {
    const names = new Set(SEED_TYPES.map((type) => type.name));
    for (const name of RESEARCH_TYPE_NAMES) expect(names.has(name)).toBe(true);
  });
});
