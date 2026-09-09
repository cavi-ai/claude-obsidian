import { test, expect, type Locator, type Page } from "@playwright/test";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchObsidianHarness, type ObsidianHarness } from "./obsidianHarness";

const ENABLED = process.env.CC_E2E_CAPTURE === "1";
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets");

async function shoot(target: Locator | Page, name: string): Promise<void> {
  await mkdir(ASSETS, { recursive: true });
  const path = join(ASSETS, name);
  // A startup Notice (e.g. the secrets migration banner) can still be showing
  // when a shot is fast; strip any on-screen notices so they never land in frame.
  const targetPage = "page" in target && typeof (target as Locator).page === "function" ? (target as Locator).page() : (target as Page);
  await targetPage.evaluate(() => document.querySelectorAll(".notice").forEach((n) => n.remove()));
  await target.screenshot({ path, scale: "device", animations: "disabled" });
  const buf = await readFile(path);
  const width = buf.readUInt32BE(16);
  const bytes = (await stat(path)).size;
  expect(width, `${name} width`).toBeLessThanOrEqual(1600 * 2);
  expect(bytes, `${name} bytes`).toBeLessThan(1_000_000);
}

async function run(page: Page, id: string): Promise<void> {
  await page.evaluate(async (commandId) => {
    await (window as unknown as { app: { commands: { executeCommandById(id: string): Promise<void> } } }).app.commands.executeCommandById(commandId);
  }, id);
}

async function openChat(harness: ObsidianHarness): Promise<Locator> {
  await run(harness.page, "claude-companion:open-chat");
  const root = harness.page.locator(".cc-chat-root");
  await expect(root).toBeVisible();
  return root;
}

test.describe("README captures", () => {
  test.skip(!ENABLED, "set CC_E2E_CAPTURE=1");

  test("diff-review.png", async () => {
    const harness = await launchObsidianHarness({
      providerReply: (body) => (/rewrite/i.test(body) ? "Create the tokenizer first.\n\nThen wire the parser to it." : null),
      settingsOverride: { inlineDiffEnabled: false },
    });
    try {
      const { page } = harness;
      await page.evaluate(async () => {
        const w = window as unknown as { app: { workspace: { openLinkText(l: string, s: string): Promise<void>; activeEditor?: { editor?: { setSelection(a: { line: number; ch: number }, b: { line: number; ch: number }): void; lastLine(): number } } } } };
        await w.app.workspace.openLinkText("Build plan", "", false);
      });
      await page.evaluate(() => {
        const w = window as unknown as { app: { workspace: { activeEditor?: { editor?: { setSelection(a: { line: number; ch: number }, b: { line: number; ch: number }): void; lastLine(): number } } } } };
        const ed = w.app.workspace.activeEditor?.editor;
        if (ed) ed.setSelection({ line: 0, ch: 0 }, { line: ed.lastLine(), ch: 0 });
      });
      await run(page, "claude-companion:rewrite-selection");
      const preset = page.locator(".modal .cc-rewrite-preset").first();
      await preset.click();
      await page.locator(".modal").getByRole("button", { name: "Rewrite", exact: true }).click();
      // A single-selection rewrite is always exactly one ProposedEdit -> one
      // planEdits() span -> one hunk; propose_note_edit (agent tool_use, not
      // fakeable through the plain provider stub) is the only path to >=2.
      const modal = page.locator(".modal", { has: page.locator(".cc-diff-hunk") });
      await expect(modal.locator(".cc-diff-hunk")).toHaveCount(1, { timeout: 15_000 });
      await shoot(modal, "diff-review.png");
    } finally {
      await harness.close();
    }
  });

  test("research-desk.png", async () => {
    const harness = await launchObsidianHarness();
    try {
      await run(harness.page, "claude-companion:open-research-desk");
      await expect(harness.page.getByRole("heading", { name: "Continuity research" })).toBeVisible();
      const desk = harness.page.locator('.workspace-leaf-content[data-type="claude-research-desk"]');
      await shoot(desk, "research-desk.png");
    } finally {
      await harness.close();
    }
  });

  test("mcp-bridge-settings.png", async () => {
    const harness = await launchObsidianHarness({
      settingsOverride: { mcpEnabled: true, mcpPort: 22360, mcpToken: "3f9c1b7e2a6d4c8f9e0b1a2c3d4e5f60" },
    });
    try {
      const settingsPage = await harness.openSettings();
      const tab = settingsPage.locator(".vertical-tab-content-container .vertical-tab-content").last();
      const header = tab.getByText("Agent bridge — MCP server (desktop)", { exact: true });
      await header.click();
      await expect(tab.getByText(/✓ Running at /)).toBeVisible({ timeout: 15_000 });
      await shoot(tab, "mcp-bridge-settings.png");
    } finally {
      await harness.close();
    }
  });

  test("local-fallback-indicator.png", async () => {
    const harness = await launchObsidianHarness({
      endpointModels: ["local-model"],
      // ollamaHost is non-empty by default (localhost:11434), so Ollama would
      // otherwise be probed as the fallback candidate ahead of the stub below
      // and, on a machine actually running Ollama, answer instead of it.
      settingsOverride: { chatBackend: "auto", openaiCompatModel: "local-model", ollamaHost: "" },
      providerFail: () => 503,
    });
    try {
      const root = await openChat(harness);
      const input = root.locator("textarea").first();
      await input.fill("Summarize my vault in one line.");
      await input.press("Enter");
      await expect(root.locator(".cc-fallback-note")).toBeVisible({ timeout: 30_000 });
      await shoot(root, "local-fallback-indicator.png");
    } finally {
      await harness.close();
    }
  });

  test("agent-tool-chips.png", async () => {
    const harness = await launchObsidianHarness({ claudeCli: true, settingsOverride: { agentModeEnabled: true } });
    try {
      const root = await openChat(harness);
      const input = root.locator("textarea").first();
      await input.fill("Show me the chips: search the vault for Continuity.");
      await input.press("Enter");
      const chips = root.locator(".cc-tool-chip");
      await expect(chips).toHaveCount(2, { timeout: 30_000 });
      await chips.first().locator("summary").click();
      const bubble = root.locator(".cc-msg.cc-assistant").last();
      await shoot(bubble, "agent-tool-chips.png");
    } finally {
      await harness.close();
    }
  });
});
