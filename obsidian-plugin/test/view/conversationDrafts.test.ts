import { describe, expect, it } from "vitest";
import { ConversationDrafts } from "../../src/view/chat/conversationDrafts";
import type { Composer } from "../../src/view/chat/Composer";

function fixture() {
  const input = { value: "" };
  const composer = { inputEl: input, draft: () => input.value, autosizeInput: () => undefined } as unknown as Composer;
  return { input, drafts: new ConversationDrafts(() => composer) };
}

describe("conversation draft view state", () => {
  it("keeps empty state compatible with existing workspace layouts", () => {
    const { drafts } = fixture();
    expect(drafts.getState(null)).toEqual({ conversationId: null });
  });

  it("keeps whitespace and line breaks in the current snapshot", () => {
    const { input, drafts } = fixture();
    input.value = "  Questions\nDetails  ";
    expect(drafts.getState(null)).toEqual({ conversationId: null, drafts: [{ conversationId: null, text: "  Questions\nDetails  " }] });
  });

  it("skips malformed entries without losing valid drafts", () => {
    const { input, drafts } = fixture();
    drafts.restore({ drafts: [null, 3, [], { conversationId: 4, text: "bad owner" }, { conversationId: "bad", text: [] }, { conversationId: "good", text: "Saved question" }] }, "good");
    expect(input.value).toBe("Saved question");
    drafts.switchTo("good", "bad");
    expect(input.value).toBe("");
  });

  it("leaves the current draft alone when legacy state has no draft snapshot", () => {
    const { input, drafts } = fixture();
    input.value = "Current question";
    drafts.restore({ conversationId: "a" }, "a");
    expect(input.value).toBe("Current question");
  });

  it("does not restore a consumed draft", () => {
    const { input, drafts } = fixture();
    input.value = "Submitted question";
    drafts.switchTo("a", "b");
    drafts.consume("a");
    const snapshot = JSON.parse(JSON.stringify(drafts.getState("b"))) as unknown;
    const reopened = fixture();
    reopened.drafts.restore(snapshot, "b");
    reopened.drafts.switchTo("b", "a");
    expect(reopened.input.value).toBe("");
  });
});
