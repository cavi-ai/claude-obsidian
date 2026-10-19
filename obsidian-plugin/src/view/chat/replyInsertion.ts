import { type Editor, Notice } from "obsidian";
import { quickNotice } from "../../notice";

/** A structured answer needs paragraph boundaries; plain inline text stays inline. */
export function formatReplyInsertion(text: string, before: string, after: string): string {
  const block = text.includes("\n") || /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|`{3}|~{3}|\|)/.test(text.trimStart());
  if (!block) return text;
  const boundary = (left: string, right: string): string => {
    if (!left || !right) return "";
    const breaks = /\n*$/.exec(left)![0].length + /^\n*/.exec(right)![0].length;
    return "\n".repeat(Math.max(0, 2 - breaks));
  };
  return boundary(before, text) + text + boundary(text, after);
}

/** Resolve spacing before the single editor transaction, preserving selection and Undo. */
export function insertReplyIntoNote(editor: Editor | undefined, text: string): void {
  if (!editor) {
    new Notice("Open a note to insert into.");
    return;
  }
  const note = editor.getValue();
  const from = editor.posToOffset(editor.getCursor("from"));
  const to = editor.posToOffset(editor.getCursor("to"));
  editor.replaceSelection(formatReplyInsertion(text, note.slice(0, from), note.slice(to)));
  quickNotice("Inserted into note");
}
