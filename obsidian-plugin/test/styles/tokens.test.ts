import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readStyles(): string {
  return readFileSync(join(__dirname, "..", "..", "styles.css"), "utf8");
}

/** The `.cc-root { ... }` token block at the top of the stylesheet. */
export function rootBlock(css: string): string {
  const start = css.indexOf(".cc-root {");
  const end = css.indexOf("}", start);
  return css.slice(start, end);
}

const SEMANTIC = [
  "--cc-surface:", "--cc-surface-raised:", "--cc-surface-sunken:", "--cc-border:", "--cc-border-hover:",
  "--cc-text:", "--cc-text-muted:", "--cc-text-faint:", "--cc-accent:", "--cc-accent-fg:",
  "--cc-accent-wash:", "--cc-accent-wash-strong:", "--cc-success:", "--cc-danger:",
  "--cc-space-1:", "--cc-space-2:", "--cc-space-3:", "--cc-space-4:", "--cc-space-5:", "--cc-space-6:",
  "--cc-radius-sm:", "--cc-radius-md:", "--cc-radius-lg:", "--cc-radius-pill:",
  "--cc-elevation-1:", "--cc-elevation-2:",
  "--cc-text-2xs:", "--cc-text-xs:", "--cc-text-sm:", "--cc-text-base:", "--cc-text-md:", "--cc-text-lg:", "--cc-text-xl:",
  "--cc-touch-min:",
];

describe("design tokens", () => {
  it("declares every semantic token on .cc-root", () => {
    const block = rootBlock(readStyles());
    for (const name of SEMANTIC) expect(block, name).toContain(name);
  });

  it("keeps the brand accents and font stacks", () => {
    const block = rootBlock(readStyles());
    for (const name of ["--cc-clay:", "--cc-olive:", "--cc-serif:", "--cc-sans:", "--cc-mono:"]) expect(block).toContain(name);
  });

  it("derives surfaces and text from Obsidian's variables", () => {
    const block = rootBlock(readStyles());
    expect(block).toMatch(/--cc-surface:\s*var\(--background-primary\)/);
    expect(block).toMatch(/--cc-text:\s*var\(--text-normal\)/);
    expect(block).toMatch(/--cc-accent:\s*var\(--cc-clay\)/);
  });
});
