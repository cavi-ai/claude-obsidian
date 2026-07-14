# Research Command Native UX Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Companion `/research` open the native Research Workbench without inserting tool instructions, sending chat, or depending on the selected model backend.

**Architecture:** Convert the catalog entry from a prompt to a native action and route that action through a small pure dispatcher before ChatView's existing action switch. Tighten active-note project resolution to canonical research metadata only, while leaving the workbench repository, MCP tools, Claude Code skill, and trust model unchanged.

**Tech Stack:** TypeScript, Obsidian plugin API, Vitest, esbuild, Obsidian CLI isolated-vault proof.

## Global Constraints

- No version bump.
- No changes to canonical research record types or trust rules.
- No changes to MCP tool names, compatibility aliases, authentication, or write defaults.
- No autonomous research or Phase 2 intelligence features.
- No unrelated chat, slash-menu, or workbench redesign.
- No changes to the pinned `upstream/html-effectiveness` submodule.
- `/claude-obsidian:research-workbench` remains unchanged.
- `/research` must not make a completion request under Claude, Auto, or Local-only backends.

## File Structure

- Modify `obsidian-plugin/src/view/slashCommands.ts`: define `/research` as a native action and expose a pure dispatcher for that action.
- Modify `obsidian-plugin/src/view/ChatView.ts`: invoke the native dispatcher after clearing the composer and before workflow/general action dispatch.
- Modify `obsidian-plugin/src/research/workbenchRouting.ts`: resolve active notes only from valid canonical research types and metadata.
- Modify `obsidian-plugin/test/slashCommands.test.ts`: prove registry shape, dispatch behavior, and absence of the leaked prompt.
- Modify `obsidian-plugin/test/research/workbenchRouting.test.ts`: prove strict project and linked-record resolution.
- Modify `README.md` and `obsidian-plugin/README.md`: document `/research` as the model-independent native cockpit entry point.

---

### Task 1: Native `/research` registry and dispatch

**Files:**
- Modify: `obsidian-plugin/src/view/slashCommands.ts`
- Modify: `obsidian-plugin/src/view/ChatView.ts`
- Test: `obsidian-plugin/test/slashCommands.test.ts`

**Interfaces:**
- Consumes: `ClaudeCompanionPlugin.activateResearchWorkbench(projectPath?: string): Promise<void>`.
- Produces: `dispatchNativeSlashAction(action: string | undefined, handlers: NativeSlashActionHandlers): Promise<boolean>` and the `/research` action id `open-research-workbench`.

- [ ] **Step 1: Replace the prompt-parity test with failing native registry and dispatch tests**

In `obsidian-plugin/test/slashCommands.test.ts`, remove the `RESEARCH_WORKBENCH_PROMPT` import and old prompt/tool-vocabulary assertions. Import `dispatchNativeSlashAction`, then add:

```ts
describe("native research workbench command", () => {
  it("registers /research as a native workbench action", () => {
    expect(SLASH_COMMANDS.find(({ name }) => name === "research")).toMatchObject({
      kind: "action",
      action: "open-research-workbench",
    });
    expect(filterCommands(SLASH_COMMANDS, "paper").map(({ name }) => name)).toContain("research");
  });

  it("dispatches the workbench action without a prompt", async () => {
    const opened: string[] = [];
    const handled = await dispatchNativeSlashAction("open-research-workbench", {
      openResearchWorkbench: async () => { opened.push("opened"); },
    });
    expect(handled).toBe(true);
    expect(opened).toEqual(["opened"]);
  });

  it("does not consume unrelated actions or retain the internal tool prompt", async () => {
    const opened: string[] = [];
    expect(await dispatchNativeSlashAction("history", {
      openResearchWorkbench: async () => { opened.push("opened"); },
    })).toBe(false);
    expect(opened).toEqual([]);
    expect(JSON.stringify(SLASH_COMMANDS)).not.toContain("research_project_create");
    expect(JSON.stringify(SLASH_COMMANDS)).not.toContain("Use the Research Workbench tools");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `obsidian-plugin/`:

```bash
pnpm exec vitest run test/slashCommands.test.ts
```

Expected: FAIL because `/research` is still a prompt and `dispatchNativeSlashAction` is not exported.

- [ ] **Step 3: Implement the minimal native registry and pure dispatcher**

In `obsidian-plugin/src/view/slashCommands.ts`, delete `RESEARCH_WORKBENCH_PROMPT`, add:

```ts
export interface NativeSlashActionHandlers {
  openResearchWorkbench(): Promise<void>;
}

export async function dispatchNativeSlashAction(
  action: string | undefined,
  handlers: NativeSlashActionHandlers,
): Promise<boolean> {
  if (action !== "open-research-workbench") return false;
  await handlers.openResearchWorkbench();
  return true;
}
```

Replace the `/research` catalog entry with:

```ts
{
  name: "research",
  aliases: ["paper", "evidence", "workbench", "literature"],
  description: "Open the evidence-backed Research Workbench",
  kind: "action",
  action: "open-research-workbench",
},
```

In `obsidian-plugin/src/view/ChatView.ts`, import `dispatchNativeSlashAction`. Immediately after the prompt-command branch in `runSlashCommand`, add:

```ts
if (await dispatchNativeSlashAction(cmd.action, {
  openResearchWorkbench: () => this.plugin.activateResearchWorkbench(),
})) return;
```

This preserves the existing initial composer clear, creates no message, and returns before any provider call.

- [ ] **Step 4: Run focused tests and static prompt-leak checks**

Run:

```bash
pnpm exec vitest run test/slashCommands.test.ts
rg -n "RESEARCH_WORKBENCH_PROMPT|Use the Research Workbench tools" src test
```

Expected: Vitest PASS; `rg` returns no matches.

- [ ] **Step 5: Commit the native dispatch slice**

```bash
git add obsidian-plugin/src/view/slashCommands.ts obsidian-plugin/src/view/ChatView.ts obsidian-plugin/test/slashCommands.test.ts
git commit -m "fix: open research workbench from slash command"
```

### Task 2: Canonical active-note project resolution

**Files:**
- Modify: `obsidian-plugin/src/research/workbenchRouting.ts`
- Test: `obsidian-plugin/test/research/workbenchRouting.test.ts`

**Interfaces:**
- Consumes: active file path and Obsidian frontmatter passed by `activateResearchWorkbench`.
- Produces: unchanged `inferResearchProjectPath(filePath: string, frontmatter?: Record<string, unknown>): string | undefined`, now metadata-strict for activation.

- [ ] **Step 1: Write failing strict-routing tests**

Replace the current child inference assertion and add malformed/unrelated cases:

```ts
it("resolves project notes and canonically linked research records", () => {
  expect(inferResearchProjectPath("Research/Alpha/Project.md", { type: "research-project" }))
    .toBe("Research/Alpha/Project.md");
  for (const type of ["research-source", "evidence", "claim", "research-question", "research-document"]) {
    expect(inferResearchProjectPath("Anywhere/Record.md", {
      type,
      project: "[[Research/Alpha/Project.md|Alpha]]",
    })).toBe("Research/Alpha/Project.md");
  }
});

it("does not guess an owning project from folders or unrelated metadata", () => {
  expect(inferResearchProjectPath("Research/Alpha/Evidence/E1.md", {})).toBeUndefined();
  expect(inferResearchProjectPath("Research/Alpha/Evidence/E1.md", { type: "ordinary-note", project: "Research/Alpha/Project.md" })).toBeUndefined();
  expect(inferResearchProjectPath("Research/Alpha/Evidence/E1.md", { type: "evidence", project: "Elsewhere.md" })).toBeUndefined();
  expect(inferResearchProjectPath("Research/Alpha/Project.md", { type: "research-project", project: "Elsewhere.md" })).toBeUndefined();
});
```

- [ ] **Step 2: Run the routing test and verify RED**

Run:

```bash
pnpm exec vitest run test/research/workbenchRouting.test.ts
```

Expected: FAIL because an untyped canonical-folder child is currently inferred from its path.

- [ ] **Step 3: Implement metadata-strict activation routing**

In `obsidian-plugin/src/research/workbenchRouting.ts`, import `RESEARCH_TYPE_NAMES` and replace `inferResearchProjectPath` with:

```ts
import { RESEARCH_TYPE_NAMES } from "./types";

const LINKED_RESEARCH_TYPES: ReadonlySet<string> = new Set(
  RESEARCH_TYPE_NAMES.filter((type) => type !== "research-project"),
);

export function inferResearchProjectPath(
  filePath: string,
  frontmatter?: Record<string, unknown>,
): string | undefined {
  const type = frontmatter?.type;
  if (type === "research-project") return resolveResearchProjectLink(filePath);
  if (typeof type !== "string" || !LINKED_RESEARCH_TYPES.has(type)) return undefined;
  return resolveResearchProjectLink(frontmatter?.project);
}
```

Keep `projectFromCanonicalRecord` private for change-notification routing only; do not use it to select a project from the active note.

- [ ] **Step 4: Run the routing and workbench view tests**

Run:

```bash
pnpm exec vitest run test/research/workbenchRouting.test.ts test/research/workbenchView.test.ts
```

Expected: both files PASS, including empty, loaded, and transparent error states.

- [ ] **Step 5: Commit strict project resolution**

```bash
git add obsidian-plugin/src/research/workbenchRouting.ts obsidian-plugin/test/research/workbenchRouting.test.ts
git commit -m "fix: resolve research projects from canonical metadata"
```

### Task 3: User-facing documentation and regression gates

**Files:**
- Modify: `README.md`
- Modify: `obsidian-plugin/README.md`
- Verify: `obsidian-plugin/main.js`

**Interfaces:**
- Consumes: the shipped native `/research` behavior from Tasks 1-2.
- Produces: accurate public instructions and a production bundle without the internal prompt.

- [ ] **Step 1: Update the two user-facing research sections**

In `README.md`, replace wording that presents the two slash commands as equivalent agent workflows with:

```md
Use `/research` in Companion to open the native Research Workbench. It shows
project state, evidence health, audits, and next actions without requiring a
model request. In Claude Code, use `/claude-obsidian:research-workbench` for the
skill-driven MCP workflow over the same canonical vault records.
```

In `obsidian-plugin/README.md`, replace “begin the evidence-backed workflow” with:

```md
Use `/research` in the Companion composer to open the native Research Workbench.
The cockpit and deterministic audit work with Claude, Auto, or Local-only mode
and do not send the slash command to a model.
```

- [ ] **Step 2: Run focused and full automated gates**

Run from `obsidian-plugin/`:

```bash
pnpm exec vitest run test/slashCommands.test.ts test/research/workbenchRouting.test.ts test/research/workbenchView.test.ts
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
```

Expected: every command exits 0.

- [ ] **Step 3: Verify the production bundle and repository diff**

Run from the repository root:

```bash
rg -n "RESEARCH_WORKBENCH_PROMPT|Use the Research Workbench tools|research_project_create; import sources" obsidian-plugin/main.js obsidian-plugin/src/view/slashCommands.ts
git diff --check
git status --short
```

Expected: `rg` returns no matches; diff check exits 0; status contains only intended files plus the pre-existing lowercase `m upstream/html-effectiveness` entry.

- [ ] **Step 4: Commit docs and verified production bundle**

```bash
git add README.md obsidian-plugin/README.md obsidian-plugin/main.js
git commit -m "docs: explain native research workbench entry point"
```

### Task 4: Isolated-vault Local-only screenshot proof

**Files:**
- Runtime copy only: `/private/tmp/codex-research-workbench-vault/.obsidian/plugins/claude-companion/`
- Proof artifact: `/private/tmp/research-native-local-proof.png`

**Interfaces:**
- Consumes: production `main.js`, `manifest.json`, and `styles.css` built in Task 3.
- Produces: visible proof that `/research` opens a populated workbench without creating chat messages under Local-only mode.

- [ ] **Step 1: Refresh the isolated plugin copy**

Copy the three production plugin files into the existing isolated vault plugin directory, preserving the isolated profile at `/private/tmp/codex-obsidian-profile-2` and its Local-only backend setting.

Expected: the isolated vault contains the newly built bundle and no user vault or user profile is modified.

- [ ] **Step 2: Reproduce the fixed workflow**

Launch the isolated Obsidian instance, open `Research Demo/Project.md`, open Companion, type `/research`, and select the menu entry.

Expected: the composer clears, the chat remains empty, no completion request appears, and the populated Research Workbench opens on the active project.

- [ ] **Step 3: Capture and inspect screenshot proof**

Capture the verified isolated Obsidian window to `/private/tmp/research-native-local-proof.png` and inspect it at original resolution.

Expected: the screenshot visibly includes the populated project cockpit and enough Companion chat surface to establish that no Python, tool prompt, user message, or assistant response was produced.

- [ ] **Step 4: Re-run final cleanliness checks**

Run:

```bash
git diff --check
git status --short
git log -4 --oneline
```

Expected: no whitespace errors; only the pre-existing submodule dirt remains unstaged; the three implementation commits follow the design and plan checkpoints.
