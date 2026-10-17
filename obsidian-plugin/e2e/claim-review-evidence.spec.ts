import { expect, test } from "./fixtures";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("claim review explains stale evidence and opens the passage for re-checking", async ({ rig }, testInfo) => {
  const { page } = await rig.reset({ settingsOverride: { agentModeEnabled: false } });
  await page.evaluate(async () => {
    await (window as unknown as { app: { commands: { executeCommandById(id: string): Promise<void> } } }).app.commands.executeCommandById("claude-companion:open-research-desk");
  });
  const desk = page.locator(".cc-research-desk");
  const card = desk.locator(".cc-desk-card").filter({ hasText: "Continuity claim" });
  await card.locator(".cc-desk-card-head").click();
  await card.getByRole("button", { name: "Check claim", exact: true }).click();
  const modal = page.locator(".modal-container").last();
  await expect(modal.getByText("Continuity study · page 4", { exact: true })).toBeVisible();
  await expect(modal.getByText("The source changed. Re-check this passage before relying on it.", { exact: true })).toBeVisible();
  await expect(modal.getByText("This passage is not marked reviewed.", { exact: true })).toBeVisible();
  await expect(modal.getByText("Marking this claim reviewed does not check its passages.", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("claim-review-with-evidence-warnings.png") });
  await modal.getByLabel("What this claim doesn't cover", { exact: true }).fill("Keep this limitation until I decide.");
  await modal.getByRole("button", { name: "Check passage: Stale result", exact: true }).click();
  await page.locator(".modal-container").last().getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(modal.getByLabel("What this claim doesn't cover", { exact: true })).toHaveValue("Keep this limitation until I decide.");
  await modal.getByRole("button", { name: "Check passage: Stale result", exact: true }).click();
  await page.locator(".modal-container").last().getByRole("button", { name: "Discard and check", exact: true }).click();
  const evidence = page.locator(".modal-container").last();
  await expect(evidence.getByRole("heading", { name: "Check Stale result", exact: true })).toBeVisible();
  await expect(evidence.getByText("The source changed since this was checked. Confirm the passage still says this.", { exact: true })).toBeVisible();
  await expect(evidence.getByRole("button", { name: "Keep", exact: true })).toBeVisible();
  const claim = await readFile(join(rig.paths.vault, "Research/Alpha/Claims/Continuity claim.md"), "utf8");
  expect(claim).toContain('review_state: reviewed');
  const passage = await readFile(join(rig.paths.vault, "Research/Alpha/Evidence/Stale result.md"), "utf8");
  expect(passage).toContain('source_fingerprint: "sha256:old"');
});
