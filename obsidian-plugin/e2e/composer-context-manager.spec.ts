import { expect, test } from "@playwright/test";
import { launchObsidianHarness } from "./obsidianHarness";

test("context manager replaces pills and opens the existing source picker", async () => {
  const harness = await launchObsidianHarness();
  try {
    await harness.page.evaluate(async () => {
      const app = (window as unknown as {
        app: {
          plugins: { plugins: Record<string, { settings: { context: Record<string, boolean> } }> };
          commands: { executeCommandById(id: string): Promise<void> };
        };
      }).app;
      app.plugins.plugins["claude-companion"].settings.context = {
        activeNote: false,
        selection: false,
        linkedNotes: false,
        searchVault: false,
      };
      await app.commands.executeCommandById("claude-companion:open-chat");
    });
    const chat = harness.page.locator(".cc-chat-root");
    await expect(chat).toBeVisible();
    await expect(chat.locator(".cc-attach-pill")).toHaveCount(0);

    const trigger = chat.locator(".cc-context-trigger");
    await expect(trigger).toHaveAttribute("aria-label", "Manage context, 0 items active");
    await trigger.click();
    const manager = chat.getByRole("dialog", { name: "Message context" });
    await expect(manager).toBeVisible();
    await manager.getByLabel("This note").check();
    await expect(trigger).toHaveAttribute("aria-label", "Manage context, 1 item active");
    await manager.getByRole("button", { name: "Add context" }).click();
    await expect(chat.locator(".cc-at-menu")).toBeVisible();
    await expect(chat.locator("textarea")).toBeFocused();
  } finally {
    await harness.close();
  }
});
