import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const ARTICLE = [
  "---",
  "type: article",
  "source_enriched: true",
  "title: Tide Study",
  "site: Example Journal",
  "summary: Tides follow the moon.",
  "url: https://example.com/tides",
  "---",
  "# Tide Study",
  "",
  "The moon pulls the oceans and creates two tides a day.",
  "",
  "Spring tides happen at new and full moon.",
].join("\n");
const MAP_ONE = JSON.stringify({
  thesis: "Lunar gravity drives the tides.",
  claims: [{ claim: "The moon creates two tides a day.", evidence: ["The moon pulls the oceans and creates two tides a day."], objections: [] }],
  takeaway: "Tides follow the moon.",
});
const MAP_TWO = JSON.stringify({
  thesis: "Lunar and solar gravity drive the tides.",
  claims: [{ claim: "The sun adds to spring tides.", evidence: ["The sun lines up with the moon at spring tides."], objections: [] }],
  takeaway: "Tides follow the moon and the sun.",
});
const DATASET = [
  "---",
  "type: dataset",
  "source_enriched: true",
  "title: Prices",
  "asset: Data/prices.csv",
  "summary: Fruit prices.",
  "---",
  "# Prices",
  "",
  "![[prices.csv]]",
].join("\n");

type PageApp = {
  commands: { executeCommandById(id: string): Promise<void> };
  vault: { getAbstractFileByPath(path: string): unknown; read(file: unknown): Promise<string>; modify(file: unknown, data: string): Promise<void> };
  metadataCache: { getFileCache(file: unknown): { frontmatter?: Record<string, unknown> } | null };
  workspace: { getActiveFile(): { path: string } | null; getLeaf(newLeaf: boolean): { openFile(file: unknown, state?: unknown): Promise<void> } };
};

async function openNote(page: Page, path: string, mode: "source" | "preview" = "source"): Promise<void> {
  await expect.poll(() => page.evaluate((p) => Boolean((window as unknown as { app: PageApp }).app.vault.getAbstractFileByPath(p)), path), { timeout: 15_000 }).toBe(true);
  await page.evaluate(async ([p, m]) => {
    const app = (window as unknown as { app: PageApp }).app;
    await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(p!), { state: { mode: m } });
  }, [path, mode]);
  await expect.poll(() => page.evaluate(() => (window as unknown as { app: PageApp }).app.workspace.getActiveFile()?.path)).toBe(path);
}

const activePath = (page: Page) => page.evaluate(() => (window as unknown as { app: PageApp }).app.workspace.getActiveFile()?.path ?? "");
const runCommand = (page: Page) => page.evaluate(() => (window as unknown as { app: PageApp }).app.commands.executeCommandById("claude-companion:open-living-view"));

test("an article's living view maps its argument and rebuilds after the article changes", async ({ rig }, testInfo) => {
  const { page } = await rig.reset({
    settingsOverride: { agentModeEnabled: false },
    extraFiles: { "Sources/Tide Study.md": ARTICLE },
    providerReply: [{ match: "Map the argument", replies: [MAP_ONE, MAP_TWO] }],
  });
  await openNote(page, "Sources/Tide Study.md");
  await runCommand(page);
  await expect.poll(() => activePath(page), { timeout: 20_000 }).toBe("Claude/Artifacts/Living views/Tide Study — argument map.md");
  const view = page.locator(".workspace-leaf.mod-active .markdown-reading-view");
  await expect(view.locator(".cc-living-status")).toContainText("Up to date", { timeout: 15_000 });
  const frame = view.locator(".cc-artifact iframe").contentFrame();
  await expect(frame.locator("body")).toContainText("Lunar gravity drives the tides.");
  await expect(frame.locator(".lv-evidence.is-quoted")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("argument-map.png") });

  await page.evaluate(async () => {
    const app = (window as unknown as { app: PageApp }).app;
    const file = app.vault.getAbstractFileByPath("Sources/Tide Study.md");
    await app.vault.modify(file, `${await app.vault.read(file)}\n\nThe sun lines up with the moon at spring tides.`);
  });
  await openNote(page, "Sources/Tide Study.md");
  await openNote(page, "Claude/Artifacts/Living views/Tide Study — argument map.md", "preview");
  await expect(view.locator(".cc-living-status")).toContainText("Up to date", { timeout: 20_000 });
  await expect(view.locator(".cc-artifact iframe").contentFrame().locator("body")).toContainText("Lunar and solar gravity drive the tides.");
  expect(await rig.providerRequests()).toBe(2);
});

test("a dataset's living view explores its CSV without a model call", async ({ rig }, testInfo) => {
  const { page } = await rig.reset({
    settingsOverride: { agentModeEnabled: false },
    extraFiles: { "Data/Prices.md": DATASET, "Data/prices.csv": "item,price\nApple,3\nBanana,1\nCherry,2\n" },
    providerReply: [{ match: ".", replies: ["unexpected"] }],
  });
  await openNote(page, "Data/Prices.md");
  await runCommand(page);
  await expect.poll(() => activePath(page), { timeout: 20_000 }).toBe("Claude/Artifacts/Living views/Prices — dataset explorer.md");
  const view = page.locator(".workspace-leaf.mod-active .markdown-reading-view");
  await expect(view.locator(".cc-living-status")).toContainText("Up to date", { timeout: 15_000 });
  const frame = view.locator(".cc-artifact iframe").contentFrame();
  await expect(frame.locator("tbody tr")).toHaveCount(3);
  await frame.getByRole("button", { name: "price" }).click();
  await expect(frame.locator("tbody tr").first()).toContainText("Banana");
  await page.screenshot({ path: testInfo.outputPath("dataset-explorer.png") });
  expect(await rig.providerRequests()).toBe(0);
});
