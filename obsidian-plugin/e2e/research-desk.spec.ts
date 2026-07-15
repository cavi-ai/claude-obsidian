import { expect, test } from "@playwright/test";
import { launchObsidianHarness, type ObsidianHarness } from "./obsidianHarness";

test.describe.configure({ mode: "serial" });
let harness: ObsidianHarness;
let consoleFailures: string[] = [];

test.beforeAll(async () => {
  harness = await launchObsidianHarness();
  harness.page.on("console", (message) => { if (message.type() === "error") consoleFailures.push(message.text()); });
  harness.page.on("pageerror", (error) => consoleFailures.push(error.message));
});
test.afterAll(async () => { await harness?.close(); });

test("01 launch: plugin loads without EPIPE or console failure", async () => {
  await harness.page.evaluate(async () => { await (window as unknown as { app: { commands: { executeCommandById(id: string): Promise<void> } } }).app.commands.executeCommandById("claude-companion:open-research-desk"); });
  await expect(harness.page.locator(".cc-research-desk")).toBeVisible();
  await expect(harness.page.getByRole("heading", { name: "Continuity research" })).toBeVisible();
  expect(consoleFailures.filter((failure) => /EPIPE|claude-companion|unhandled/i.test(failure))).toEqual([]);
  await harness.page.screenshot({ path: "/private/tmp/claude-companion-research-e2e-results/01-desk.png" });
});

test("02 guidance: recommendation explains, pins, dismisses, and preserves the queue", async () => {
  const desk = harness.page.locator(".cc-research-desk");
  await expect(desk.locator(".cc-desk-next-reason")).toContainText("source changed");
  await desk.getByRole("button", { name: "Pin", exact: true }).click();
  await expect(desk.locator(".cc-desk-next")).toHaveAttribute("data-pinned", "true");
  await desk.getByRole("button", { name: "Unpin", exact: true }).click();
  const firstTitle = await desk.locator(".cc-desk-next h3").textContent();
  await desk.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(desk.locator(".cc-desk-next h3")).not.toHaveText(firstTitle ?? "");
});

test("03 continuity: project switching and active-document state remain understandable", async () => {
  const desk = harness.page.locator(".cc-research-desk");
  await desk.getByLabel("Active research project").selectOption("Research/Beta/Project.md");
  await expect(desk.getByRole("heading", { name: "Empty project" })).toBeVisible();
  await expect(desk.locator(".cc-desk-next h3")).toContainText("first source");
  await desk.getByLabel("Active research project").selectOption("Research/Alpha/Project.md");
  await expect(desk.locator(".cc-desk-document")).toContainText("White paper");
});

test("04 handoff: every quick action opens the matching advanced capability", async () => {
  const mappings = [["Capture source", "Sources"], ["Review evidence", "Evidence"], ["Develop claim", "Claims"], ["Continue draft", "Draft"], ["Run audit", "Audit"]] as const;
  for (const [button, tab] of mappings) {
    await harness.page.locator(".cc-research-desk").getByRole("button", { name: button, exact: true }).click();
    const workbench = harness.page.locator(".cc-research-workbench"); await expect(workbench).toBeVisible(); await expect(workbench.locator(".cc-research-tab-select")).toHaveValue(tab);
    await harness.page.evaluate(async () => { await (window as unknown as { app: { commands: { executeCommandById(id: string): Promise<void> } } }).app.commands.executeCommandById("claude-companion:open-research-desk"); });
    await expect(harness.page.locator(".cc-research-desk")).toBeVisible();
  }
});

test("05 advanced workbench: grouped navigation exposes every research panel without implicit network work", async () => {
  await harness.page.evaluate(async () => { await (window as unknown as { app: { commands: { executeCommandById(id: string): Promise<void> } } }).app.commands.executeCommandById("claude-companion:open-research-workbench"); });
  const workbench = harness.page.locator(".cc-research-workbench");
  await expect(workbench.locator(".cc-research-tab-group")).toHaveCount(4);
  const before = harness.providerRequests();
  for (const tab of ["Overview", "Sources", "Evidence", "Claims", "Outline", "Draft", "Audit", "Intelligence", "Discover"]) { await workbench.locator(".cc-research-tab-select").selectOption(tab); await expect(workbench.getByRole("tabpanel")).toBeVisible(); }
  expect(harness.providerRequests()).toBe(before);
  await harness.page.screenshot({ path: "/private/tmp/claude-companion-research-e2e-results/05-workbench.png" });
});

test("06 accessibility and responsive states: controls remain named and reachable", async () => {
  await harness.page.evaluate(async () => { await (window as unknown as { app: { commands: { executeCommandById(id: string): Promise<void> } } }).app.commands.executeCommandById("claude-companion:open-research-desk"); });
  const desk = harness.page.locator(".cc-research-desk");
  await expect(desk.getByRole("button", { name: "Start this task" })).toBeVisible();
  await expect(desk.getByRole("progressbar", { name: "Grounded section progress" })).toHaveAttribute("aria-valuenow");
  await harness.page.setViewportSize({ width: 1440, height: 900 });
  for (const width of [320, 360, 390, 428, 768]) {
    await harness.page.locator(".workspace-split.mod-right-split").evaluate((element, paneWidth) => { (element as HTMLElement).style.width = `${paneWidth}px`; }, width);
    await expect(desk).toBeVisible();
    await expect.poll(async () => Math.round((await desk.boundingBox())?.width ?? 0)).toBeGreaterThanOrEqual(width - 12);
    await expect.poll(async () => await desk.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await desk.evaluate((element) => { element.scrollTop = 0; });
    await desk.screenshot({ path: `/private/tmp/claude-companion-research-e2e-results/06-desk-${width}.png` });
  }
  expect(consoleFailures.filter((failure) => /EPIPE|unhandled/i.test(failure))).toEqual([]);
});
