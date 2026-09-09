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

/** All rules whose selector starts with the given prefix, concatenated. */
export function rulesFor(css: string, selectorPrefix: string): string {
  const out: string[] = [];
  const re = new RegExp(`(^|\\n)(${selectorPrefix.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}[^{]*)\\{([^}]*)\\}`, "g");
  for (const m of css.matchAll(re)) out.push(`${m[2]}{${m[3]}}`);
  return out.join("\n");
}

describe("research desk surfaces", () => {
  it("carries no gradient, glow, or Obsidian purple", () => {
    const css = readStyles();
    const desk = rulesFor(css, ".cc-desk") + rulesFor(css, ".cc-research-desk");
    expect(desk).not.toContain("linear-gradient(");
    expect(desk).not.toContain("--cc-research-glow");
    expect(desk).not.toContain("--interactive-accent");
    expect(desk).not.toContain("--color-cyan");
  });

  it("derives the research tokens from the Companion accent", () => {
    const css = readStyles();
    const block = css.slice(css.indexOf(".cc-research-desk,"), css.indexOf("}", css.indexOf(".cc-research-desk,")));
    expect(block).toMatch(/--cc-research-surface:[^;]*var\(--cc-accent\)/);
    expect(block).toMatch(/--cc-research-radius:\s*var\(--cc-radius-lg\)/);
    expect(block).not.toContain("--interactive-accent");
  });
});
