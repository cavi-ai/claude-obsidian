import { describe, expect, it } from "vitest";
import { draftContextState, restoreDraftContext } from "../../src/view/chat/draftContextState";
import type { Composer } from "../../src/view/chat/Composer";

const OFF = { activeNote: false, selection: false, linkedNotes: false, searchVault: false };
function composer() {
  return { contextToggles: { ...OFF }, attachedPaths: [], attachedMedia: [], renderContextManager: () => undefined } as unknown as Composer;
}

describe("draft context state", () => {
  it("restores vault image and PDF references without serializing their bytes", () => {
    const original = composer();
    original.attachedMedia = [
      { kind: "image", label: "Chart", path: "Notes/chart.png", mime: "image/png", data: "inline-image-bytes" },
      { kind: "pdf", label: "Paper", path: "Notes/paper.pdf", mime: "application/pdf" },
    ];
    const serialized = JSON.stringify(draftContextState(original, OFF));
    const restored = composer();
    restoreDraftContext(restored, JSON.parse(serialized));
    expect(restored.attachedMedia).toEqual([
      { kind: "image", label: "Chart", path: "Notes/chart.png", mime: "image/png" },
      { kind: "pdf", label: "Paper", path: "Notes/paper.pdf", mime: "application/pdf" },
    ]);
    expect(serialized).not.toContain("inline-image-bytes");
  });

  it("ignores invalid media references and derives MIME from the file type", () => {
    const restored = composer();
    restoreDraftContext(restored, { context: { media: [null, { kind: "image", label: "bad", path: "Notes/file.md" }, { kind: "pdf", label: "Paper", path: "Notes/paper.pdf", mime: "text/html" }] } });
    expect(restored.attachedMedia).toEqual([{ kind: "pdf", label: "Paper", path: "Notes/paper.pdf", mime: "application/pdf" }]);
  });

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
