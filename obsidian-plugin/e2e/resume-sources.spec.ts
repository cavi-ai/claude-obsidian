import { expect, test } from "./fixtures";
import type ClaudeCompanionPlugin from "../src/main";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=";
const QUEUED_PNG = Buffer.from([...Buffer.from(PNG, "base64"), 0]).toString("base64");
type TestWindow = Window & { app: { commands: { executeCommandById(id: string): void }; plugins: { plugins: Record<string, ClaudeCompanionPlugin> }; vault: { createBinary(path: string, bytes: ArrayBuffer): Promise<unknown>; create(path: string, text: string): Promise<unknown>; getAbstractFileByPath(path: string): unknown; delete(file: unknown): Promise<void> } } };
const settings = { agentModeEnabled: false, context: { activeNote: false, selection: false, linkedNotes: false, searchVault: false } };

for (const missing of [false, true]) {
  test(`Resume restores its interrupted task and sources after reload${missing ? " after an unavailable source is restored" : ""}`, async ({ rig }, testInfo) => {
    const { page } = await rig.reset({ settingsOverride: settings,
      extraFiles: { "Notes/Original.md": "ORIGINAL-NOTE-652", "Notes/Queued.md": "QUEUED-NOTE-653" },
      providerDelayMs: 5000, providerReply: [{ match: "/./", replies: ["Original delayed answer."] }],
    });
    const errors: string[] = [];
    const onError = (error: Error) => errors.push(error.message);
    page.on("pageerror", onError);
    try {
      await page.evaluate(async ({ png, queued }) => {
        const app = (window as unknown as TestWindow).app;
        await app.vault.createBinary("Notes/OrigChart.png", Uint8Array.from(atob(png), c => c.charCodeAt(0)).buffer);
        await app.vault.createBinary("Notes/NextChart.png", Uint8Array.from(atob(queued), c => c.charCodeAt(0)).buffer);
        app.commands.executeCommandById("claude-companion:new-chat-tab");
      }, { png: PNG, queued: QUEUED_PNG });
      const chat = page.locator(".cc-chat-root");
      const input = chat.locator(".cc-input");
      for (const name of ["Original", "OrigChart"]) {
        await input.fill(`@${name}`);
        await expect(chat.locator(".cc-at-item.is-selected")).toContainText(name);
        await input.press("Enter");
      }
      await input.fill("ORIGINAL-TASK-651");
      await chat.getByRole("button", { name: /^Send(?: message)?$/ }).click();
      await expect.poll(() => rig.providerRequests()).toBe(1);
      await chat.getByRole("button", { name: "Stop generating", exact: true }).click();
      await expect(chat.getByRole("button", { name: "Send message", exact: true })).toBeVisible();
      await rig.reloadPlugin();
      await chat.locator(".cc-context-trigger").click();
      const context = chat.getByRole("dialog", { name: "Message context" });
      const removes = context.getByRole("button", { name: /^Remove / });
      while (await removes.count()) await removes.first().click();
      await context.getByRole("button", { name: "Close message context" }).click();
      for (const name of ["Queued", "NextChart"]) {
        await input.fill(`@${name}`);
        await expect(chat.locator(".cc-at-item.is-selected")).toContainText(name);
        await input.press("Enter");
      }
      await input.fill("Keep my next question.");
      const originalImage = PNG.replaceAll("+", "[+]");
      const queuedImage = QUEUED_PNG.replaceAll("+", "[+]");
      await rig.control.setStubs({ providerReply: [
        { match: String.raw`/^(?=[\s\S]*ORIGINAL-TASK-651)(?=[\s\S]*ORIGINAL-NOTE-652)(?=[\s\S]*${originalImage})(?![\s\S]*(?:QUEUED-NOTE-653|${queuedImage}))/`, replies: ["Original task and sources received."] },
        { match: String.raw`/^(?=[\s\S]*QUEUED-NOTE-653)(?=[\s\S]*${queuedImage})(?![\s\S]*(?:ORIGINAL-NOTE-652|${originalImage}))/`, replies: ["Queued sources received."] },
        { match: "/./", replies: ["Wrong recovery context."] },
      ] });
      const resume = chat.locator(".cc-interrupted-turn").getByRole("button", { name: "Resume", exact: true });
      if (missing) {
        await page.evaluate(async () => { const vault = (window as unknown as TestWindow).app.vault; await vault.delete(vault.getAbstractFileByPath("Notes/Original.md")); });
        await resume.click();
        await expect(page.locator(".notice").filter({ hasText: "Couldn't attach Notes/Original.md" })).toBeVisible();
        expect(await rig.providerRequests()).toBe(0);
        await expect(resume).toBeVisible();
        await expect(input).toHaveValue("Keep my next question.");
        await page.evaluate(async () => { await (window as unknown as TestWindow).app.vault.create("Notes/Original.md", "ORIGINAL-NOTE-652"); });
      }
      await resume.click();
      await expect(chat.locator(".cc-assistant .cc-body").last()).toHaveText("Original task and sources received.");
      expect(await rig.providerRequests()).toBe(1);
      await expect(chat.getByRole("button", { name: "Send message", exact: true })).toBeVisible();
      await expect(input).toHaveValue("Keep my next question.");
      await chat.locator(".cc-context-trigger").click();
      await expect(context).toContainText("Notes/Queued.md");
      await expect(context).toContainText("Notes/NextChart.png");
      await expect(context).not.toContainText("Notes/Original.md");
      await expect(context).not.toContainText("Notes/OrigChart.png");
      await page.screenshot({ path: testInfo.outputPath("resume-preserves-next-question-and-sources.png") });
      await context.getByRole("button", { name: "Close message context" }).click();
      const refs = await page.evaluate(() => (window as unknown as TestWindow).app.plugins.plugins["claude-companion"]!.conversations().getActive()?.messages.filter(({ role }) => role === "user").map(({ contextAttachments }) => contextAttachments?.paths.map(({ path }) => path)));
      expect(refs).toEqual([["Notes/Original.md"], ["Notes/Original.md"]]);
      await chat.getByRole("button", { name: /^Send(?: message)?$/ }).click();
      await expect(chat.locator(".cc-assistant .cc-body").last()).toHaveText("Queued sources received.");
      expect(await rig.providerRequests()).toBe(2);
      expect(errors).toEqual([]);
    } finally { page.off("pageerror", onError); }
  });
}

test("Regenerate keeps the accepted question after a different draft fails source validation", async ({ rig }, testInfo) => {
  const { page } = await rig.reset({ settingsOverride: settings, extraFiles: { "Notes/Missing.md": "NEXT-DRAFT-NOTE-655" }, providerReply: [
    { match: "REJECTED-QUESTION-654", replies: ["Rejected draft was sent."] },
    { match: "ACCEPTED-QUESTION-653", replies: ["Accepted question received."] },
  ] });
  await page.evaluate(() => { (window as unknown as TestWindow).app.commands.executeCommandById("claude-companion:new-chat-tab"); });
  const chat = page.locator(".cc-chat-root");
  const input = chat.locator(".cc-input");
  await input.fill("ACCEPTED-QUESTION-653");
  await chat.getByRole("button", { name: /^Send(?: message)?$/ }).click();
  await expect(chat.getByRole("button", { name: "Regenerate", exact: true })).toBeVisible();
  await input.fill("@Missing");
  await expect(chat.locator(".cc-at-item.is-selected")).toContainText("Missing");
  await input.press("Enter");
  await input.fill("REJECTED-QUESTION-654");
  await page.evaluate(async () => { const vault = (window as unknown as TestWindow).app.vault; await vault.delete(vault.getAbstractFileByPath("Notes/Missing.md")); });
  await chat.getByRole("button", { name: /^Send(?: message)?$/ }).click();
  await expect(page.locator(".notice").filter({ hasText: "Couldn't attach Notes/Missing.md" })).toBeVisible();
  expect(await rig.providerRequests()).toBe(1);
  await chat.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect.poll(() => rig.providerRequests()).toBe(2);
  await expect(chat.getByRole("button", { name: "Send message", exact: true })).toBeVisible();
  await expect(chat.locator(".cc-assistant .cc-body").last()).toHaveText("Accepted question received.");
  await expect(input).toHaveValue("REJECTED-QUESTION-654");
  await page.screenshot({ path: testInfo.outputPath("regenerate-uses-accepted-question-after-refused-draft.png") });
});
