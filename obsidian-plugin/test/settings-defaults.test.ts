import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../src/types";

describe("memory settings defaults", () => {
  it("ships sane defaults", () => {
    expect(DEFAULT_SETTINGS.memoryEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.memoryFolder).toBe("Claude/Sessions");
    expect(DEFAULT_SETTINGS.memoryIngestOnSave).toBe(false);
    expect(DEFAULT_SETTINGS.memoryBaseTags).toEqual(["claude", "session"]);
  });
});
