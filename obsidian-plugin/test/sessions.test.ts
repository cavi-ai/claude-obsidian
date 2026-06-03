import { describe, it, expect } from "vitest";
import { encodeProjectDir } from "../src/memory/sessions";

describe("encodeProjectDir", () => {
  it("maps every non-alphanumeric char to a dash (empirically confirmed)", () => {
    expect(encodeProjectDir("/Volumes/MIRZA/.hermes")).toBe("-Volumes-MIRZA--hermes");
    expect(encodeProjectDir("/Volumes/MIRZA/workspace/CAVI/plugins/claude-obsidian"))
      .toBe("-Volumes-MIRZA-workspace-CAVI-plugins-claude-obsidian");
  });
});
