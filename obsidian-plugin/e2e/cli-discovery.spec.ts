import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "./fixtures";
import { launchObsidianHarness } from "./obsidianHarness";

/** The PATH macOS gives an app launched from the Dock or Finder. */
const GUI_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

test("Codex and OpenCode installed on the login-shell PATH are found when Obsidian runs with the GUI PATH", async () => {
  const root = await mkdtemp(join(tmpdir(), "cc-cli-discovery-"));
  const bin = join(root, "shellbin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, "codex"), `#!/bin/sh
case "$*" in
  *--version*) printf 'codex-cli 9.9.9\\n' ;;
  *"login status"*) printf 'Logged in using ChatGPT\\n' >&2 ;;
esac
`);
  await writeFile(join(bin, "opencode"), `#!/bin/sh
case "$*" in
  *--version*) printf '8.8.8\\n' ;;
  *"providers list"*) printf '2 credentials\\n' ;;
esac
`);
  await chmod(join(bin, "codex"), 0o755);
  await chmod(join(bin, "opencode"), 0o755);
  const shell = join(root, "login-shell");
  await writeFile(shell, `#!/bin/sh\nprintf 'motd\\n__CC_PATH__%s__CC_PATH__' "${bin}:/usr/bin:/bin"\n`);
  await chmod(shell, 0o755);

  const harness = await launchObsidianHarness({ env: { PATH: GUI_PATH, SHELL: shell } });
  const { page } = harness;
  try {
    const statuses = await page.evaluate(async () => {
      const plugin = (window as unknown as { app: { plugins: { plugins: Record<string, { router(): Record<string, { refresh(): Promise<{ ok: boolean; detail: string }> }> }> } } })
        .app.plugins.plugins["claude-companion"]!;
      const router = plugin.router();
      return { codex: await router.codexCli!.refresh(), opencode: await router.opencodeCli!.refresh() };
    });
    expect(statuses.codex).toEqual({ ok: true, detail: expect.stringContaining("Codex 9.9.9 · signed in via ChatGPT") });
    expect(statuses.opencode).toEqual({ ok: true, detail: expect.stringContaining("OpenCode 8.8.8 · signed in via 2 credentials") });
  } finally {
    await harness.close();
  }
});
