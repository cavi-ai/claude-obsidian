// Fenced code blocks, located line by line. A fence may sit behind indentation,
// blockquote markers, or a list marker (list items, callouts); it closes on a
// line of the same character at least as long, and an unclosed fence runs to
// the end of the note. Pure.

export interface Fence {
  char: "`" | "~";
  length: number;
}

const PREFIX = /^(?:[ \t]*>)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?/;

function afterPrefix(line: string): string {
  const text = line.endsWith("\r") ? line.slice(0, -1) : line;
  return text.slice(PREFIX.exec(text)?.[0].length ?? 0);
}

/** The fence `line` opens, or null. Backtick info strings may not contain backticks. */
export function fenceOpen(line: string): Fence | null {
  const m = /^(`{3,}|~{3,})(.*)$/.exec(afterPrefix(line));
  if (!m) return null;
  const run = m[1]!;
  if (run[0] === "`" && m[2]!.includes("`")) return null;
  return { char: run[0] as Fence["char"], length: run.length };
}

/** Whether `line` closes `open`. */
export function closesFence(line: string, open: Fence): boolean {
  const m = /^(`{3,}|~{3,})[ \t]*$/.exec(afterPrefix(line));
  return !!m && m[1]![0] === open.char && m[1]!.length >= open.length;
}

/** One flag per line: true for fence lines and every line between them. */
export function fencedLines(lines: readonly string[]): boolean[] {
  const out: boolean[] = [];
  let open: Fence | null = null;
  for (const line of lines) {
    if (open) {
      out.push(true);
      if (closesFence(line, open)) open = null;
      continue;
    }
    open = fenceOpen(line);
    out.push(open !== null);
  }
  return out;
}
