import { describe, it, expect } from "vitest";
import { extractTasks, specBody, buildPrompt, claudeCodeBuildCommand, type SpecInput } from "../src/build/spec";
import { trackerArtifact } from "../src/build/tracker";

describe("extractTasks", () => {
  it("reads markdown checkboxes with done state", () => {
    const tasks = extractTasks("- [ ] First\n- [x] Second done\n* [X] Third");
    expect(tasks).toEqual([
      { title: "First", done: false },
      { title: "Second done", done: true },
      { title: "Third", done: true },
    ]);
  });
  it("falls back to numbered/bulleted milestones (stripping HTML)", () => {
    const plan = "<ol><li>Build the parser</li></ol>\n1. Wire the UI\n- Ship it";
    const tasks = extractTasks(plan);
    expect(tasks.map((t) => t.title)).toContain("Wire the UI");
    expect(tasks.every((t) => !t.done)).toBe(true);
  });
  it("returns empty when nothing is task-like", () => {
    expect(extractTasks("just a paragraph of prose")).toEqual([]);
  });
});

const input: SpecInput = {
  title: "Comment threads",
  plan: "- [ ] A\n- [x] B",
  specPath: "Claude/Builds/Comment threads — spec.md",
  trackerPath: "Claude/Builds/Comment threads — tracker.md",
  vault: "My Vault",
  tasks: [
    { title: "A", done: false },
    { title: "B", done: true },
  ],
};

describe("specBody", () => {
  it("includes a checklist and the plan", () => {
    const body = specBody(input);
    expect(body).toContain("# Build spec: Comment threads");
    expect(body).toContain("- [ ] A");
    expect(body).toContain("- [x] B");
    expect(body).toContain("## Plan");
  });
});

describe("buildPrompt / claudeCodeBuildCommand", () => {
  it("drives the official Obsidian CLI against the spec + tracker paths", () => {
    const p = buildPrompt(input);
    expect(p).toContain("official Obsidian CLI");
    expect(p).toContain(`obsidian vault="My Vault" read path="${input.specPath}"`);
    expect(p).toContain(`obsidian vault="My Vault" append path="${input.trackerPath}"`);
  });
  it("omits the vault= prefix when no vault is given", () => {
    const p = buildPrompt({ ...input, vault: undefined });
    expect(p).toContain(`obsidian read path="${input.specPath}"`);
    expect(p).not.toContain("vault=");
  });
  it("single-quote wraps the prompt as a shell literal", () => {
    const cmd = claudeCodeBuildCommand(input);
    expect(cmd.startsWith("claude -p '")).toBe(true);
    expect(cmd.endsWith("'")).toBe(true);
    // The prompt contains backticks (around `obsidian`) and double quotes; inside
    // single quotes those are inert, so they pass through verbatim (not escaped).
    expect(cmd).toContain("`obsidian`");
  });
  it("neutralizes shell-injection chars in user-controlled fields", () => {
    // Title flows from note content; a malicious name must not break out of the
    // single-quoted literal. $(...), backticks, $VAR, and \ stay inert; only a
    // literal single quote is rewritten via the POSIX '\'' idiom.
    const evil = claudeCodeBuildCommand({ ...input, title: "x'; rm -rf ~ #$(whoami)`id`" });
    // Every single quote in the body is the escaped form — no bare break-out quote.
    const inner = evil.slice("claude -p '".length, -1);
    expect(inner).toContain("'\\''"); // the injected ' became the escaped idiom
    // The dangerous substrings survive only as inert literal text, never as an
    // unescaped quote that would end the argument early.
    expect(inner.split("'\\''").join("")).not.toContain("'");
  });
});

describe("trackerArtifact", () => {
  it("renders progress percentage and task rows", () => {
    const html = trackerArtifact("Comment threads", input.tasks);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("1 / 2 tasks · 50%");
    expect(html).toContain("width:50%");
    expect(html).toContain("Comment threads");
  });
  it("escapes HTML in task titles", () => {
    const html = trackerArtifact("X", [{ title: "<script>alert(1)</script>", done: false }]);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("handles an empty task list without dividing by zero", () => {
    const html = trackerArtifact("Empty", []);
    expect(html).toContain("0 / 0 tasks · 0%");
  });
});
