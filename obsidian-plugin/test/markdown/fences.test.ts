import { describe, it, expect } from "vitest";
import { closesFence, fencedLines, fenceOpen } from "../../src/markdown/fences";

const flags = (text: string): boolean[] => fencedLines(text.split("\n"));

describe("fenceOpen / closesFence", () => {
  it("opens on backtick and tilde runs of three or more, with an info string", () => {
    expect(fenceOpen("```bash")).toEqual({ char: "`", length: 3 });
    expect(fenceOpen("~~~~")).toEqual({ char: "~", length: 4 });
    expect(fenceOpen("``")).toBeNull();
    expect(fenceOpen("text ```")).toBeNull();
  });

  it("opens behind indentation, blockquote markers, and list markers", () => {
    expect(fenceOpen("  ```bash")).toEqual({ char: "`", length: 3 });
    expect(fenceOpen("> ```")).toEqual({ char: "`", length: 3 });
    expect(fenceOpen("> > ~~~")).toEqual({ char: "~", length: 3 });
    expect(fenceOpen("- ```js")).toEqual({ char: "`", length: 3 });
    expect(fenceOpen("12. ```")).toEqual({ char: "`", length: 3 });
  });

  it("does not open on a backtick run whose info string carries a backtick (inline code)", () => {
    expect(fenceOpen("```inline``` code")).toBeNull();
    expect(fenceOpen("~~~ has ` tick")).toEqual({ char: "~", length: 3 });
  });

  it("closes only on the same character at least as long, with nothing after it", () => {
    const open = { char: "`" as const, length: 4 };
    expect(closesFence("```", open)).toBe(false);
    expect(closesFence("````", open)).toBe(true);
    expect(closesFence("`````  ", open)).toBe(true);
    expect(closesFence("~~~~", open)).toBe(false);
    expect(closesFence("```` js", open)).toBe(false);
    expect(closesFence("> ````\r", open)).toBe(true);
  });
});

describe("fencedLines", () => {
  it("flags fence lines and everything between them", () => {
    expect(flags("a\n```\ncode\n```\nb")).toEqual([false, true, true, true, false]);
  });

  it("keeps an inner shorter fence inside a longer one", () => {
    expect(flags("````md\n```\ninner\n```\nstill code\n````\nprose")).toEqual([true, true, true, true, true, true, false]);
  });

  it("does not let a tilde line close a backtick fence", () => {
    expect(flags("```\n~~~\ncode\n```\nprose")).toEqual([true, true, true, true, false]);
  });

  it("runs an unclosed fence to the end", () => {
    expect(flags("prose\n```\ncode\nmore")).toEqual([false, true, true, true]);
  });

  it("covers fences inside list items and callouts", () => {
    expect(flags("- step:\n  ```bash\n  kubectl apply\n  ```\n- next")).toEqual([false, true, true, true, false]);
    expect(flags("> [!note]\n> ```\n> code\n> ```\n> prose")).toEqual([false, true, true, true, false]);
  });
});
