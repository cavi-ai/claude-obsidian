import { describe, expect, it } from "vitest";
import { draftContextState, restoreDraftContext } from "../../src/view/chat/draftContextState";
import type { Composer } from "../../src/view/chat/Composer";

const OFF = { activeNote: false, selection: false, linkedNotes: false, searchVault: false };
function composer() {
  return { contextToggles: { ...OFF }, attachedPaths: [], renderContextManager: () => undefined } as unknown as Composer;
}

describe("draft context state", () => {
  it("omits unchanged defaults from legacy-compatible empty state", () => {
    expect(draftContextState(composer(), OFF)).toEqual({});
  });

  it("round-trips explicit notes, folders, and the pane's context choices", () => {
    const original = composer();
    original.contextToggles.searchVault = true;
    original.attachedPaths = [{ path: "Notes/Source.md", kind: "note" }, { path: "Research", kind: "folder" }];
    const state: unknown = JSON.parse(JSON.stringify(draftContextState(original, OFF)));
    const restored = composer();
    restoreDraftContext(restored, state);
    expect(restored.contextToggles).toEqual({ ...OFF, searchVault: true });
    expect(restored.attachedPaths).toEqual([{ path: "Notes/Source.md", kind: "note" }, { path: "Research", kind: "folder" }]);
  });

  it("does not change context when an older view state omits it", () => {
    const restored = composer();
    restored.contextToggles.linkedNotes = true;
    restoreDraftContext(restored, { conversationId: null });
    expect(restored.contextToggles.linkedNotes).toBe(true);
  });

  it("ignores malformed context fields and invalid attachment kinds", () => {
    const restored = composer();
    restoreDraftContext(restored, { context: { automatic: { activeNote: "false", searchVault: true }, paths: [null, { kind: "image", path: "a.png" }, { kind: "note", path: 4 }, { kind: "note", path: "Notes/Source.md" }] } });
    expect(restored.contextToggles).toEqual({ ...OFF, searchVault: true });
    expect(restored.attachedPaths).toEqual([{ kind: "note", path: "Notes/Source.md" }]);
  });
});
