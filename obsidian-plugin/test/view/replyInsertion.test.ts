import { describe, expect, it } from "vitest";
import { formatReplyInsertion } from "../../src/view/chat/replyInsertion";

describe("structured reply insertion", () => {
  it("keeps an appended heading separate from the existing paragraph", () => {
    expect(formatReplyInsertion("## Findings\n\n- Review evidence.", "Keep this guidance.", "")).toBe("\n\n## Findings\n\n- Review evidence.");
  });
  it("protects the following heading when inserting at the start of a note", () => {
    expect(formatReplyInsertion("## Findings\n\nResults.", "", "# Existing note")).toBe("## Findings\n\nResults.\n\n");
  });
  it("separates both sides when replacing an inline placeholder with a block", () => {
    expect(formatReplyInsertion("- First\n- Second", "Introduction. ", " More guidance.")).toBe("\n\n- First\n- Second\n\n");
  });
  it("reuses blank lines already present in the note or reply", () => {
    expect(formatReplyInsertion("## Findings\n\nResults.", "Before.\n\n", "\n\nAfter.")).toBe("## Findings\n\nResults.");
    expect(formatReplyInsertion("\n## Findings\n", "Before.\n", "\nAfter.")).toBe("\n## Findings\n");
    expect(formatReplyInsertion("## Findings\n\nResults.", "Before.\n", "\nAfter.")).toBe("\n## Findings\n\nResults.\n");
  });
  it("keeps an empty destination or whole-note replacement exact", () => {
    expect(formatReplyInsertion("## Findings\n\nResults.", "", "")).toBe("## Findings\n\nResults.");
  });
  it("preserves single-line plain text insertion and an empty reply", () => {
    expect(formatReplyInsertion("reviewed", "The ", " evidence.")).toBe("reviewed");
    expect(formatReplyInsertion("", "Before", "After")).toBe("");
  });
  it.each(["## Findings", "- Review evidence", "1. Review evidence", "> Quoted evidence", "```md", "| Claim | Evidence |"])("separates the single-line Markdown block %j", text => {
    expect(formatReplyInsertion(text, "Before.", "After.")).toBe(`\n\n${text}\n\n`);
  });
});
