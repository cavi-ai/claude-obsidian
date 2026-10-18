import { expect, test } from "./fixtures";
import type ClaudeCompanionPlugin from "../src/main";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=";
const NEXT_PNG = Buffer.from([...Buffer.from(PNG, "base64"), 0]).toString("base64");
type TestWindow = Window & { finishPaste?(): void; app: { commands: { executeCommandById(id: string): void }; plugins: { plugins: Record<string, ClaudeCompanionPlugin> }; vault: { createBinary(path: string, bytes: ArrayBuffer): Promise<unknown> } } };
const settings = { agentModeEnabled: false, context: { activeNote: false, selection: false, linkedNotes: false, searchVault: false } };

test("a pending pasted image refuses Send and retains the question until ready", async ({ rig }, testInfo) => {
  const { page } = await rig.reset({ settingsOverride: settings, providerReply: [
    { match: PNG, replies: ["Image received."] }, { match: "/./", replies: ["No image received."] },
  ] });
  await page.evaluate(() => { (window as unknown as TestWindow).app.commands.executeCommandById("claude-companion:new-chat-tab"); });
  const chat = page.locator(".cc-chat-root");
  const input = chat.locator(".cc-input");
  const errors: string[] = [];
  const onError = (error: Error) => errors.push(error.message);
  page.on("pageerror", onError);
  try {
    await input.fill("Explain the chart I am pasting.");
    await input.evaluate((element, png) => {
      const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
      const file = new File([bytes], "slow-chart.png", { type: "image/png" });
      const read = new Promise<ArrayBuffer>(resolve => { (window as unknown as TestWindow).finishPaste = () => resolve(bytes.buffer); });
      Object.defineProperty(file, "arrayBuffer", { value: () => read });
      const data = new DataTransfer(); data.items.add(file);
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, PNG);
    await chat.getByRole("button", { name: /^Send(?: message)?$/ }).click();
    await expect(page.locator(".notice").filter({ hasText: "An image is still attaching" }).last()).toBeVisible();
    await expect(input).toHaveValue("Explain the chart I am pasting.");
    expect(await rig.providerRequests()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as TestWindow).app.plugins.plugins["claude-companion"]!.conversations().getActive() === null)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("pending-image-keeps-question-unsent.png") });
    await page.evaluate(() => (window as unknown as TestWindow).finishPaste?.());
    await chat.locator(".cc-context-trigger").click();
    const context = chat.getByRole("dialog", { name: "Message context" });
    await expect(context).toContainText("slow-chart.png");
    await context.getByRole("button", { name: "Close message context" }).click();
    await chat.getByRole("button", { name: /^Send(?: message)?$/ }).click();
    await expect(chat.locator(".cc-assistant .cc-body").last()).toHaveText("Image received.");
    expect(await rig.providerRequests()).toBe(1);
    await page.screenshot({ path: testInfo.outputPath("ready-pasted-image-reaches-request.png") });
    expect(errors).toEqual([]);
  } finally { await page.evaluate(() => (window as unknown as TestWindow).finishPaste?.()); page.off("pageerror", onError); }
});

for (const fail of [false, true]) {
  test(`a ${fail ? "failed" : "successful"} regeneration preserves a pending paste for the next question`, async ({ rig }, testInfo) => {
    const { page } = await rig.reset({ settingsOverride: settings, providerReply: [{ match: PNG, replies: ["Original image received."] }] });
    const errors: string[] = [];
    const onError = (error: Error) => errors.push(error.message);
    page.on("pageerror", onError);
    try {
      await page.evaluate(async png => {
        const app = (window as unknown as TestWindow).app;
        await app.vault.createBinary("OriginalChart.png", Uint8Array.from(atob(png), c => c.charCodeAt(0)).buffer);
        app.commands.executeCommandById("claude-companion:new-chat-tab");
      }, PNG);
      const chat = page.locator(".cc-chat-root");
      const input = chat.locator(".cc-input");
      await input.fill("@OriginalChart");
      await expect(chat.locator(".cc-at-item.is-selected")).toContainText("OriginalChart");
      await input.press("Enter");
      await input.fill("Explain the original image.");
      await chat.getByRole("button", { name: /^Send(?: message)?$/ }).click();
      await expect(chat.getByRole("button", { name: "Regenerate", exact: true })).toBeVisible();
      await rig.control.setStubs({
        ...(fail ? { providerFail: [{ match: PNG, status: 503 }] } : {}),
        providerReply: [
          { match: String.raw`/^(?=[\s\S]*${NEXT_PNG.replaceAll("+", "[+]")})(?![\s\S]*${PNG.replaceAll("+", "[+]")})/`, replies: ["Next image only."] },
          { match: PNG, replies: ["Original image received."] },
          { match: "/./", replies: ["Wrong image selection."] },
        ],
      });
      await input.fill("Explain my next image.");
      await input.evaluate((element, png) => {
        const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
        const file = new File([bytes], "next-chart.png", { type: "image/png" });
        const read = new Promise<ArrayBuffer>(resolve => { (window as unknown as TestWindow).finishPaste = () => resolve(bytes.buffer); });
        Object.defineProperty(file, "arrayBuffer", { value: () => read });
        const data = new DataTransfer(); data.items.add(file);
        element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      }, NEXT_PNG);
      await chat.getByRole("button", { name: "Regenerate", exact: true }).click();
      await expect.poll(() => rig.providerRequests()).toBeGreaterThanOrEqual(1);
      await expect(chat.getByRole("button", { name: "Send message", exact: true })).toBeVisible();
      if (fail) await expect(chat).toContainText("Previous answer kept.");
      else await expect(chat.locator(".cc-assistant .cc-body").last()).toHaveText("Original image received.");
      await expect(input).toHaveValue("Explain my next image.");
      const before = await rig.providerRequests();
      await chat.getByRole("button", { name: /^Send(?: message)?$/ }).click();
      await expect(page.locator(".notice").filter({ hasText: "An image is still attaching" }).last()).toBeVisible();
      expect(await rig.providerRequests()).toBe(before);
      await page.evaluate(() => (window as unknown as TestWindow).finishPaste?.());
      await chat.locator(".cc-context-trigger").click();
      const context = chat.getByRole("dialog", { name: "Message context" });
      await expect(context).toContainText("next-chart.png");
      await expect(context).not.toContainText("OriginalChart.png");
      await page.screenshot({ path: testInfo.outputPath("next-image-survives-regeneration.png") });
      await context.getByRole("button", { name: "Close message context" }).click();
      await chat.getByRole("button", { name: /^Send(?: message)?$/ }).click();
      await expect(chat.locator(".cc-assistant .cc-body").last()).toHaveText("Next image only.");
      expect(await rig.providerRequests()).toBe(before + 1);
      expect(errors).toEqual([]);
    } finally { await page.evaluate(() => (window as unknown as TestWindow).finishPaste?.()); page.off("pageerror", onError); }
  });
}

test("a failed pasted image remains visible and refuses Send until removed", async ({ rig }, testInfo) => {
  const { page } = await rig.reset({ settingsOverride: settings });
  await page.evaluate(() => { (window as unknown as TestWindow).app.commands.executeCommandById("claude-companion:new-chat-tab"); });
  const chat = page.locator(".cc-chat-root"), input = chat.locator(".cc-input");
  const errors: string[] = [];
  const onError = (error: Error) => errors.push(error.message);
  page.on("pageerror", onError);
  try {
    await input.fill("Explain my chart.");
    await input.evaluate(element => {
      const file = new File([new Uint8Array([1])], "unreadable.png", { type: "image/png" });
      Object.defineProperty(file, "arrayBuffer", { value: async () => { throw new Error("Image read failed"); } });
      const data = new DataTransfer(); data.items.add(file);
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await chat.locator(".cc-context-trigger").click();
    const context = chat.getByRole("dialog", { name: "Message context" });
    await expect(context).toContainText("unreadable.png");
    await expect(context).toContainText("Image read failed");
    await expect(context.getByRole("button", { name: "Retry unreadable.png", exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("failed-paste-visible-in-message-context.png") });
    await context.getByRole("button", { name: "Close message context" }).click();
    await chat.getByRole("button", { name: /^Send(?: message)?$/ }).click();
    await expect(page.locator(".notice").filter({ hasText: "Request not sent" }).last()).toContainText("Image read failed");
    await expect(input).toHaveValue("Explain my chart.");
    expect(await rig.providerRequests()).toBe(0);
    expect(errors).toEqual([]);
  } finally { page.off("pageerror", onError); }
});
