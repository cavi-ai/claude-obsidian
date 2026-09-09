import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readStyles(): string {
  return readFileSync(join(__dirname, "..", "..", "styles.css"), "utf8");
}

/** The `body { ... }` token block at the top of the stylesheet (the one declaring --cc-surface). */
export function bodyBlock(css: string): string {
  let start = css.indexOf("body {");
  while (start !== -1) {
    const end = css.indexOf("}", start);
    const block = css.slice(start, end);
    if (block.includes("--cc-surface:")) return block;
    start = css.indexOf("body {", start + 1);
  }
  throw new Error("body { } token block (with --cc-surface:) not found");
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
  it("declares every semantic token on body, so leaf views and modals outside .cc-root see them", () => {
    const block = bodyBlock(readStyles());
    for (const name of SEMANTIC) expect(block, name).toContain(name);
  });

  it("keeps the brand accents on body (with the semantic tokens that derive from them) and the font stacks on .cc-root", () => {
    const css = readStyles();
    const body = bodyBlock(css);
    for (const name of ["--cc-clay:", "--cc-olive:"]) expect(body, name).toContain(name);
    const root = rootBlock(css);
    for (const name of ["--cc-serif:", "--cc-sans:", "--cc-mono:"]) expect(root, name).toContain(name);
  });

  it("derives surfaces and text from Obsidian's variables", () => {
    const block = bodyBlock(readStyles());
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

  it("keeps desk and research eyebrows/counts off Obsidian's purple --text-accent", () => {
    const css = readStyles();
    const desk = rulesFor(css, ".cc-desk") + rulesFor(css, ".cc-research");
    expect(desk).not.toContain("--text-accent");
  });

  it("puts the desk and workbench primary button on the Companion accent", () => {
    const css = readStyles();
    expect(css).toMatch(/\.cc-research-desk \.mod-cta,\s*\.cc-research-workbench \.mod-cta\s*\{[^}]*background:\s*var\(--cc-accent\)/);
  });
});

describe("diff review", () => {
  it("uses the Companion accent for the hunk card, checkbox, and primary button", () => {
    const css = readStyles();
    const hunk = rulesFor(css, ".cc-diff-hunk");
    expect(hunk).toMatch(/border-radius:\s*var\(--cc-radius-lg\)/);
    expect(hunk).toMatch(/background:\s*var\(--cc-surface-raised\)/);
    expect(css).toMatch(/\.cc-diff-modal \.mod-cta\s*\{[^}]*background:\s*var\(--cc-accent\)/);
    expect(css).toMatch(/\.cc-diff-modal input\[type="checkbox"\]:checked\s*\{[^}]*background-color:\s*var\(--cc-accent\)/);
  });
});

describe("header controls", () => {
  it("icon buttons and the backend pill read the tokens", () => {
    const css = readStyles();
    const btn = rulesFor(css, ".cc-icon-btn");
    expect(btn).toMatch(/border-radius:\s*var\(--cc-radius-sm\)/);
    expect(btn).toMatch(/\.cc-icon-btn:hover\s*\{[^}]*var\(--cc-accent-wash\)/);
    const pill = rulesFor(css, ".cc-backend-pill");
    expect(pill).toMatch(/\.cc-backend-pill\.is-ok\s*\{[^}]*var\(--cc-success\)/);
    expect(pill).toMatch(/\.cc-backend-pill\.is-warn\s*\{[^}]*var\(--cc-accent\)/);
    expect(pill).not.toContain("--cc-gray-");
  });
});
