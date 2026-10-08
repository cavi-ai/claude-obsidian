import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  clearPendingRange,
  escapeInlinePrompt,
  pendingRangeField,
  setPendingRange,
  validPendingRange,
  type PendingRange,
} from "../../src/editor/inlinePrompt";

const DOC = "# Plan\n\nFirst line here.\nSecond line here.\n";
const FROM = DOC.indexOf("Second");
const TO = FROM + "Second line".length;

function open(p: Partial<PendingRange> = {}): EditorState {
  const range: PendingRange = { id: 7, mode: "rewrite", from: FROM, to: TO, anchor: FROM, valid: true, ...p };
  const state = EditorState.create({ doc: DOC, extensions: [pendingRangeField] });
  return state.update({ effects: setPendingRange.of(range) }).state;
}

describe("pending range (selection mode)", () => {
  it("an edit before the range shifts it and keeps it valid", () => {
    const s = open().update({ changes: { from: 0, insert: "## " } }).state;
    expect(validPendingRange(s, 7)).toEqual({ from: FROM + 3, to: TO + 3 });
    expect(s.doc.sliceString(FROM + 3, TO + 3)).toBe("Second line");
  });

  it("an edit after the range leaves it in place", () => {
    const s = open().update({ changes: { from: DOC.length, insert: "tail" } }).state;
    expect(validPendingRange(s, 7)).toEqual({ from: FROM, to: TO });
  });

  it("an edit inside the range invalidates it", () => {
    const s = open().update({ changes: { from: FROM + 2, to: FROM + 3, insert: "X" } }).state;
    expect(validPendingRange(s, 7)).toBeNull();
    expect(s.field(pendingRangeField)?.valid).toBe(false);
  });

  it("an edit that overlaps an end of the range invalidates it", () => {
    const s = open().update({ changes: { from: FROM - 3, to: FROM + 1, insert: "" } }).state;
    expect(validPendingRange(s, 7)).toBeNull();
  });

  it("stays invalid after a later unrelated edit", () => {
    let s = open().update({ changes: { from: FROM + 1, insert: "z" } }).state;
    s = s.update({ changes: { from: 0, insert: "a" } }).state;
    expect(validPendingRange(s, 7)).toBeNull();
  });
});

describe("pending range (insert mode)", () => {
  const AT = DOC.indexOf("here.\nSecond");

  it("edits above the cursor shift the insert position", () => {
    const s = open({ mode: "insert", from: AT, to: AT, anchor: DOC.indexOf("First") })
      .update({ changes: { from: 0, to: 2, insert: "Heading: " } }).state;
    expect(validPendingRange(s, 7)).toEqual({ from: AT + 7, to: AT + 7 });
  });

  it("a deletion across the insert position invalidates it", () => {
    const s = open({ mode: "insert", from: AT, to: AT }).update({ changes: { from: AT - 2, to: AT + 2, insert: "" } }).state;
    expect(validPendingRange(s, 7)).toBeNull();
  });
});

describe("pending range lifecycle", () => {
  it("a whole-document replacement (note switch) drops it", () => {
    const s = open().update({ changes: { from: 0, to: DOC.length, insert: "other note" } }).state;
    expect(s.field(pendingRangeField)).toBeNull();
  });

  it("clearing a different prompt's id leaves this one", () => {
    const s = open().update({ effects: clearPendingRange.of(99) }).state;
    expect(validPendingRange(s, 7)).not.toBeNull();
    expect(validPendingRange(s, 99)).toBeNull();
    expect(s.update({ effects: clearPendingRange.of(7) }).state.field(pendingRangeField)).toBeNull();
  });

  it("Escape in the editor falls through to the inline diff when no prompt is open", () => {
    expect(escapeInlinePrompt({} as EditorView)).toBe(false);
  });
});
