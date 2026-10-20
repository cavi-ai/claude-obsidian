import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { buildExtensionBundle, EXTENSION_VERSION } from "../src/integrations/desktopExtension";
import { expect, test } from "./fixtures";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => { const a = s.address(); if (!a || typeof a === "string") return reject(new Error("No port")); s.close(() => resolve(a.port)); });
  });
}

type PageApp = { plugins: { plugins: Record<string, { syncMcpServer(): Promise<void>; resolvedMcpToken(): string }> } };

/** Unpack the bundle Companion hands Claude Desktop and run its server the way Claude Desktop does: `node server/index.js`. */
function runExtension(bundle: Uint8Array, env: Record<string, string>, messages: unknown[]): Promise<Array<Record<string, any>>> {
  const dir = mkdtempSync(join(tmpdir(), "companion-extension-"));
  for (const [name, data] of Object.entries(unzipSync(bundle))) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), strFromU8(data));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(dir, "server/index.js")], { env: { PATH: process.env.PATH ?? "", ...env }, stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
    child.on("error", reject);
    child.on("close", () => resolve(out.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, any>)));
    void (async () => {
      for (const message of messages) {
        child.stdin.write(`${JSON.stringify(message)}\n`);
        await new Promise((r) => setTimeout(r, 150));
      }
      child.stdin.end();
    })();
  });
}

test("the Claude Desktop extension's server reaches the vault through Companion's live bridge", async ({ rig }) => {
  const port = await freePort();
  const harness = await rig.reset({
    settingsOverride: { mcpEnabled: true, mcpPort: port, mcpAllowWrites: false, mcpToken: "9b2d4f6a8c0e1b3d5f7a9c1e3b5d7f9a" },
    extraFiles: { "Notes/Heron.md": "Herons wade through the estuary at dawn." },
  });
  const { page } = harness;
  try {
    const token = await page.evaluate(async () => {
      const plugin = (window as unknown as { app: PageApp }).app.plugins.plugins["claude-companion"]!;
      await plugin.syncMcpServer();
      return plugin.resolvedMcpToken();
    });
    const url = `http://127.0.0.1:${port}/mcp`;
    const replies = await runExtension(buildExtensionBundle({ version: EXTENSION_VERSION, url }), { COMPANION_VAULT_URL: url, COMPANION_VAULT_TOKEN: token }, [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-ai", version: "1" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "vault_search", arguments: { query: "estuary" } } },
    ]);
    expect(replies.map((reply) => reply.id)).toEqual([1, 2, 3]);
    expect(replies[0]!.result.serverInfo.name).toBe("obsidian-vault");
    expect((replies[1]!.result.tools as Array<{ name: string }>).map((tool) => tool.name)).toContain("vault_search");
    expect(JSON.stringify(replies[2]!.result)).toContain("Notes/Heron.md");
  } finally {
    await harness.close();
  }
});
