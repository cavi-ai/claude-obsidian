import { expect, test } from "./fixtures";

test("ordinary scenarios reuse one Obsidian process with isolated vault state", async ({ rig }) => {
  const first = await rig.reset({
    extraFiles: { "Transient.md": "# Must not leak\n" },
    settingsOverride: { customModel: "temporary-e2e-model" },
  });
  const processId = first.processId;
  {
    await expect.poll(() => first.page.evaluate(() => {
      const app = (window as unknown as { app: { vault: { getAbstractFileByPath(path: string): unknown } } }).app;
      return Boolean(app.vault.getAbstractFileByPath("Transient.md"));
    })).toBe(true);
  }

  const second = await rig.reset();
  {
    expect(second.processId).toBe(processId);
    await expect.poll(() => second.page.evaluate(() => {
      const app = (window as unknown as {
        app: {
          plugins: { plugins: Record<string, { settings: { customModel: string } }> };
          vault: { getAbstractFileByPath(path: string): unknown };
        };
      }).app;
      return {
        customModel: app.plugins.plugins["claude-companion"].settings.customModel,
        transientExists: Boolean(app.vault.getAbstractFileByPath("Transient.md")),
      };
    })).toEqual({ customModel: "", transientExists: false });
  }
});
