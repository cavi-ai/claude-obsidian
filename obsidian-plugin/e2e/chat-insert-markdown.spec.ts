import { expect, test } from "./fixtures";

type VaultWindow = { app: {
  commands: { executeCommandById(id: string): Promise<void> };
  vault: { getAbstractFileByPath(path: string): unknown; cachedRead(file: unknown): Promise<string> };
  workspace: {
    getLeaf(value: boolean): { openFile(file: unknown): Promise<void> };
    getLeavesOfType(type: string): { view: { file?: { path: string }; editor: { setCursor(position: { line: number; ch: number }): void; getValue(): string } } }[];
  };
} };

test("inserting a structured reply preserves the existing paragraph and its new heading", async ({ rig }, testInfo) => {
  const original = "# Review\n\nKeep the existing guidance.";
  const answer = "## Findings\n\n- Started in March.\n- Needs review.";
  const { page } = await rig.reset({
    settingsOverride: { agentModeEnabled: false, autoTagOnSave: false },
    extraFiles: { "Notes/Review.md": original },
    providerReply: [{ match: ".", replies: [answer] }],
  });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.evaluate(async () => {
    const app = (window as unknown as VaultWindow).app;
    await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath("Notes/Review.md"));
    await app.commands.executeCommandById("claude-companion:open-chat");
  });
  const chat = page.locator(".cc-chat-root");
  await chat.locator(".cc-input").fill("Give me a short findings section to add to this note.");
  await chat.getByRole("button", { name: /^Send(?: message)?$/ }).click();
  const reply = chat.locator(".cc-assistant").last();
  await expect(reply.getByRole("button", { name: "Insert", exact: true })).toBeVisible();
  await page.evaluate(() => {
    const view = (window as unknown as VaultWindow).app.workspace.getLeavesOfType("markdown").find(leaf => leaf.view.file?.path === "Notes/Review.md")!.view;
    view.editor.setCursor({ line: 2, ch: "Keep the existing guidance.".length });
  });
  await reply.getByRole("button", { name: "Insert", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("inserted-findings-section.png") });
  const text = await page.evaluate(() => {
    const view = (window as unknown as VaultWindow).app.workspace.getLeavesOfType("markdown").find(leaf => leaf.view.file?.path === "Notes/Review.md")!.view;
    return view.editor.getValue();
  });
  expect(text).toBe(`${original}\n\n${answer}`);
  await page.locator(".markdown-source-view .cm-content").click();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await page.evaluate(() => {
    const view = (window as unknown as VaultWindow).app.workspace.getLeavesOfType("markdown").find(leaf => leaf.view.file?.path === "Notes/Review.md")!.view;
    return view.editor.getValue();
  })).toBe(original);
  expect(errors).toEqual([]);
});
