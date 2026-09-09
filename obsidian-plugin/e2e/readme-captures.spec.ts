import { test, expect, type Locator, type Page } from "@playwright/test";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchObsidianHarness, setRightSidebarWidth, type ObsidianHarness } from "./obsidianHarness";

const ENABLED = process.env.CC_E2E_CAPTURE === "1";
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets");
const THEMES = (process.env.CC_E2E_CAPTURE_THEME ?? "both") === "both" ? (["dark", "light"] as const) : [process.env.CC_E2E_CAPTURE_THEME as "dark" | "light"];
const OUT_ROOT = process.env.CC_E2E_CAPTURE_DIR;

function outputPath(name: string, theme: "dark" | "light"): string {
  return OUT_ROOT ? join(OUT_ROOT, theme, name) : join(ASSETS, name);
}

async function shoot(target: Locator | Page, name: string, theme: "dark" | "light"): Promise<void> {
  const path = outputPath(name, theme);
  await mkdir(dirname(path), { recursive: true });
  // A startup Notice (e.g. the secrets migration banner) can still be showing
  // when a shot is fast; strip any on-screen notices so they never land in frame.
  const targetPage = "page" in target && typeof (target as Locator).page === "function" ? (target as Locator).page() : (target as Page);
  await targetPage.evaluate(() => {
    document.querySelectorAll(".notice").forEach((n) => n.remove());
    // A wide row (e.g. the usage bar) can leave an ancestor mid-horizontal-scroll;
    // pin every scrollable element back to its left edge before cropping.
    document.querySelectorAll<HTMLElement>("*").forEach((el) => {
      if (el.scrollWidth > el.clientWidth) el.scrollLeft = 0;
    });
  });
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

// Widen the right sidebar past the `.cc-controls` 360px container-query
// threshold so the Ask / Plan / Act labels render (README scenes only).
async function widen(page: Page, px: number): Promise<void> {
  await setRightSidebarWidth(page, px);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test.describe("README captures", () => {
  for (const theme of THEMES) {
    test.describe(theme, () => {
      test.skip(!ENABLED, "set CC_E2E_CAPTURE=1");
      test.skip(theme === "light" && !OUT_ROOT, "README assets are dark");

      test("composer-320.png", async () => {
        test.skip(!OUT_ROOT, "composer-320 is a comparison-only scene, not a README asset");
        const harness = await launchObsidianHarness({ theme });
        try {
          const root = await openChat(harness);
          await setRightSidebarWidth(harness.page, 320);
          // Let the `.cc-controls` container-query reflow settle after the resize.
          await harness.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          const controls = root.locator(".cc-controls");
          // Capture regardless of the fit assertions below so a wrap is still evidenced.
          await shoot(root, "composer-320.png", theme);
          const metrics = await controls.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, height: el.getBoundingClientRect().height }));
          console.log(`composer-320 (${theme}) metrics: scrollWidth=${metrics.scrollWidth} clientWidth=${metrics.clientWidth} height=${metrics.height}`);
          expect(metrics.scrollWidth, `control row must not overflow horizontally at 320px: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.clientWidth);
          expect(metrics.height, `control row must stay one line: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(40);
        } finally {
          await harness.close();
        }
      });

      test("diff-review.png", async () => {
        // "Enrich with Claude…" (not the single-edit rewrite path): its lint step
        // sends the whole note to the utility (here: chat-role/Anthropic-stub)
        // model and diffToEdits() turns the returned full copy into edits, one per
        // LCS-changed region merged only when within MERGE_GAP (3) lines of each
        // other — a changed heading and a changed last task, six unchanged lines
        // apart, stay two separate edits and so two separate .cc-diff-hunk boxes.
        const originalPlan = "# Build plan\n\nNotes for implementation.\n\n- [ ] Create the parser\n- [ ] Wire the interface\n- [ ] Write tests\n- [ ] Ship it\n";
        const enrichedPlan = "# Build Plan\n\nNotes for implementation.\n\n- [ ] Create the parser\n- [ ] Wire the interface\n- [ ] Write tests\n- [ ] Ship it to users\n";
        const harness = await launchObsidianHarness({
          providerReply: (body) => (/copyeditor/i.test(body) ? enrichedPlan : null),
          extraFiles: { "Build plan.md": originalPlan },
          theme,
        });
        try {
          const { page } = harness;
          await page.evaluate(async () => {
            const w = window as unknown as {
              app: {
                vault: { getAbstractFileByPath(path: string): unknown };
                plugins: { plugins: Record<string, { enrichNoteFlow(file: unknown, options: { rename: boolean; frontmatter: boolean; links: boolean; lint: boolean }): Promise<void> }> };
              };
            };
            const file = w.app.vault.getAbstractFileByPath("Build plan.md");
            // Fire and forget: enrichNoteFlow() only resolves once the review
            // modal it opens is closed, which this test never does.
            void w.app.plugins.plugins["claude-companion"]!.enrichNoteFlow(file, { rename: false, frontmatter: false, links: false, lint: true });
          });
          const modal = page.locator(".modal", { has: page.locator(".cc-diff-hunk") });
          await expect(modal.locator(".cc-diff-hunk")).toHaveCount(2, { timeout: 15_000 });
          await shoot(modal, "diff-review.png", theme);
        } finally {
          await harness.close();
        }
      });

      test("research-desk.png", async () => {
        const harness = await launchObsidianHarness({ theme });
        try {
          await run(harness.page, "claude-companion:open-research-desk");
          await expect(harness.page.getByRole("heading", { name: "Continuity research" })).toBeVisible();
          const desk = harness.page.locator('.workspace-leaf-content[data-type="claude-research-desk"]');
          await shoot(desk, "research-desk.png", theme);
        } finally {
          await harness.close();
        }
      });

      test("mcp-bridge-settings.png", async () => {
        const harness = await launchObsidianHarness({
          settingsOverride: { mcpEnabled: true, mcpPort: 22360, mcpToken: "3f9c1b7e2a6d4c8f9e0b1a2c3d4e5f60" },
          theme,
        });
        try {
          const settingsPage = await harness.openSettings();
          const tab = settingsPage.locator(".vertical-tab-content-container .vertical-tab-content").last();
          const header = tab.getByText("Agent bridge — MCP server (desktop)", { exact: true });
          await header.click();
          await expect(tab.getByText(/✓ Running at /)).toBeVisible({ timeout: 15_000 });
          await shoot(tab, "mcp-bridge-settings.png", theme);
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
          theme,
        });
        try {
          const root = await openChat(harness);
          await widen(harness.page, 420);
          const input = root.locator("textarea").first();
          await input.fill("Summarize my vault in one line.");
          await input.press("Enter");
          await expect(root.locator(".cc-fallback-note")).toBeVisible({ timeout: 30_000 });
          // The endpoint stub now actually answers /chat/completions, so the local
          // retry succeeds — no error card, just the fallback note and its reply.
          await expect(root.locator(".cc-msg.cc-assistant").last()).toContainText("Answered locally by the endpoint stub.", { timeout: 15_000 });
          await expect(root.locator(".cc-error")).toHaveCount(0);
          await shoot(root, "local-fallback-indicator.png", theme);
        } finally {
          await harness.close();
        }
      });

      test("agent-tool-chips.png", async () => {
        const harness = await launchObsidianHarness({ claudeCli: true, settingsOverride: { agentModeEnabled: true }, theme });
        try {
          const root = await openChat(harness);
          await widen(harness.page, 420);
          const input = root.locator("textarea").first();
          await input.fill("Show me the chips: search the vault for Continuity.");
          await input.press("Enter");
          const chips = root.locator(".cc-tool-chip");
          await expect(chips).toHaveCount(2, { timeout: 30_000 });
          await chips.first().locator("summary").click();
          // Crop to the transcript only: from top of .cc-chat-root down to bottom
          // of last assistant bubble, excluding the composer.
          // Hide the composer so nothing overflows and causes horizontal scroll offset.
          await harness.page.addStyleTag({ content: ".cc-chat-root .cc-composer, .cc-chat-root textarea { display: none !important; }" });
          // Reset every horizontal scroll: a wide row (e.g. the usage bar) can leave
          // an ancestor mid-horizontal-scroll; pin every scrollable element back to
          // its left edge before measuring bounding boxes.
          await harness.page.evaluate(() => {
            for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
              if (el.scrollLeft) el.scrollLeft = 0;
            }
            window.scrollTo(0, 0);
          });
          const rootBox = await root.boundingBox();
          const bubble = root.locator(".cc-msg.cc-assistant").last();
          const bubbleBox = await bubble.boundingBox();
          if (!rootBox || !bubbleBox) throw new Error("Failed to get bounding boxes");
          const path = outputPath("agent-tool-chips.png", theme);
          await mkdir(dirname(path), { recursive: true });
          // A startup Notice (e.g. the secrets migration banner) can still be showing
          // when a shot is fast; strip any on-screen notices so they never land in frame.
          await harness.page.evaluate(() => {
            document.querySelectorAll(".notice").forEach((n) => n.remove());
          });
          await harness.page.screenshot({
            clip: {
              x: rootBox.x,
              y: rootBox.y,
              width: rootBox.width,
              height: bubbleBox.y + bubbleBox.height - rootBox.y + 12,
            },
            path,
            scale: "device",
            animations: "disabled",
          });
          const buf = await readFile(path);
          const width = buf.readUInt32BE(16);
          const bytes = (await stat(path)).size;
          expect(width, "agent-tool-chips.png width").toBeLessThanOrEqual(1600 * 2);
          expect(bytes, "agent-tool-chips.png bytes").toBeLessThan(1_000_000);
        } finally {
          await harness.close();
        }
      });
    });
  }
});
