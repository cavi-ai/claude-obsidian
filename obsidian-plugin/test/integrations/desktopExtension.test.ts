import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { McpbManifestSchema } from "@anthropic-ai/mcpb/schemas/0.3";
import {
  EXTENSION_VERSION,
  PROXY_SOURCE,
  buildExtensionBundle,
  extensionManifest,
  withoutLegacyBridgeEntry,
} from "../../src/integrations/desktopExtension";

const URL_INPUT = { version: EXTENSION_VERSION, url: "http://127.0.0.1:22360/mcp" };

describe("Claude Desktop extension bundle", () => {
  it("carries a manifest the official MCPB 0.3 schema accepts", () => {
    const parsed = McpbManifestSchema.safeParse(extensionManifest(URL_INPUT));
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  it("zips the manifest and the proxy at the root, with the token as a masked setting and never a value", () => {
    const files = unzipSync(buildExtensionBundle(URL_INPUT));
    expect(Object.keys(files).sort()).toEqual(["manifest.json", "server/index.js"]);
    const manifest = JSON.parse(strFromU8(files["manifest.json"]!)) as Record<string, any>;
    expect(manifest.server.mcp_config).toEqual({
      command: "node",
      args: ["${__dirname}/server/index.js"],
      env: { COMPANION_VAULT_URL: "${user_config.url}", COMPANION_VAULT_TOKEN: "${user_config.token}" },
    });
    expect(manifest.user_config.url.default).toBe("http://127.0.0.1:22360/mcp");
    expect(manifest.user_config.token).toMatchObject({ sensitive: true, required: true });
    expect(manifest.user_config.token.default).toBeUndefined();
    expect(strFromU8(files["server/index.js"]!)).toBe(PROXY_SOURCE);
  });
});

describe("withoutLegacyBridgeEntry", () => {
  const legacy = { command: "npx", args: ["-y", "mcp-remote", "http://127.0.0.1:22360/mcp", "--header", "Authorization: Bearer secret"] };

  it("removes only the mcp-remote entry earlier versions wrote and keeps everything else", () => {
    const source = JSON.stringify({ theme: "dark", mcpServers: { keep: { command: "keep" }, "obsidian-vault": legacy } });
    expect(JSON.parse(withoutLegacyBridgeEntry(source)!)).toEqual({ theme: "dark", mcpServers: { keep: { command: "keep" } } });
  });

  it("never touches a config Companion did not write", () => {
    expect(withoutLegacyBridgeEntry(null)).toBeNull();
    expect(withoutLegacyBridgeEntry("{")).toBeNull();
    expect(withoutLegacyBridgeEntry(JSON.stringify({ mcpServers: { keep: { command: "keep" } } }))).toBeNull();
    expect(withoutLegacyBridgeEntry(JSON.stringify({ mcpServers: { "obsidian-vault": { command: "node", args: ["vault.js"] } } }))).toBeNull();
    expect(withoutLegacyBridgeEntry(JSON.stringify({ mcpServers: { "obsidian-vault": { ...legacy, args: ["-y", "mcp-remote", "https://example.com/mcp"] } } }))).toBeNull();
  });
});

/** A stand-in for Companion's bridge: JSON replies, a session id, 202 for notifications, 404 for an unknown session. */
function bridge(token: string) {
  const sessions = new Set<string>();
  const seen: Array<{ method: string; session: string | undefined; auth: string | undefined }> = [];
  let next = 1;
  const server: Server = createServer((req: IncomingMessage, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      const message = JSON.parse(body) as { id?: number; method: string };
      const session = req.headers["mcp-session-id"] as string | undefined;
      seen.push({ method: message.method, session, auth: req.headers.authorization });
      if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end("{}"); return; }
      if (message.method === "initialize") {
        const id = `s${next++}`;
        sessions.add(id);
        res.writeHead(200, { "content-type": "application/json", "mcp-session-id": id });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-06-18", serverInfo: { name: "obsidian-vault" } } }, null, 2));
        return;
      }
      if (!session || !sessions.has(session)) { res.writeHead(404, { "content-type": "application/json" }).end('{"error":"unknown session"}'); return; }
      if (message.id === undefined) { res.writeHead(202).end(); return; }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "vault_search" }] } }));
    });
  });
  return {
    seen,
    forget: () => sessions.clear(),
    listen: () => new Promise<string>((resolve) => server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/mcp`);
    })),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const proxyFile = (() => {
  const dir = mkdtempSync(join(tmpdir(), "companion-proxy-"));
  const file = join(dir, "index.js");
  writeFileSync(file, PROXY_SOURCE);
  return file;
})();

/** Run the proxy under plain node: send `lines` on stdin, close it, and collect each JSON line it prints. */
function runProxy(env: Record<string, string>, lines: unknown[], between?: () => void): Promise<Array<Record<string, any>>> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [proxyFile], { env: { PATH: process.env.PATH ?? "", ...env }, stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
    child.on("error", reject);
    child.on("close", () => resolve(out.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, any>)));
    void (async () => {
      for (const [index, line] of lines.entries()) {
        if (index === 2) between?.();
        child.stdin.write(`${JSON.stringify(line)}\n`);
        await new Promise((r) => setTimeout(r, 40));
      }
      child.stdin.end();
    })();
  });
}

const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-ai", version: "1" } } };
const INITIALIZED = { jsonrpc: "2.0", method: "notifications/initialized" };
const LIST = { jsonrpc: "2.0", id: 2, method: "tools/list" };

describe("Claude Desktop extension proxy", () => {
  let server: ReturnType<typeof bridge> | null = null;
  afterEach(async () => { await server?.close(); server = null; });

  it("relays initialize, a notification and a request over the bridge session as single JSON lines", async () => {
    server = bridge("tok");
    const url = await server.listen();
    const replies = await runProxy({ COMPANION_VAULT_URL: url, COMPANION_VAULT_TOKEN: "tok" }, [INIT, INITIALIZED, LIST]);
    expect(replies.map((r) => r.id)).toEqual([1, 2]);
    expect(replies[1]!.result).toEqual({ tools: [{ name: "vault_search" }] });
    expect(server.seen).toEqual([
      { method: "initialize", session: undefined, auth: "Bearer tok" },
      { method: "notifications/initialized", session: "s1", auth: "Bearer tok" },
      { method: "tools/list", session: "s1", auth: "Bearer tok" },
    ]);
  });

  it("starts a new session and retries once when the bridge forgets the old one", async () => {
    server = bridge("tok");
    const url = await server.listen();
    const restart = server.forget;
    const replies = await runProxy({ COMPANION_VAULT_URL: url, COMPANION_VAULT_TOKEN: "tok" }, [INIT, INITIALIZED, LIST], restart);
    expect(replies.map((r) => r.id)).toEqual([1, 2]);
    expect(replies[1]!.result).toBeDefined();
    expect(server.seen.map((s) => `${s.method}@${s.session ?? "-"}`)).toEqual([
      "initialize@-", "notifications/initialized@s1", "tools/list@s1", "initialize@-", "notifications/initialized@s2", "tools/list@s2",
    ]);
  });

  it("answers each request with what to fix: a wrong token, a closed bridge, missing settings", async () => {
    server = bridge("tok");
    const url = await server.listen();
    const wrong = await runProxy({ COMPANION_VAULT_URL: url, COMPANION_VAULT_TOKEN: "nope" }, [INIT]);
    expect(wrong).toEqual([{ jsonrpc: "2.0", id: 1, error: { code: -32000, message: expect.stringContaining("rejected the token") } }]);
    const closed = await runProxy({ COMPANION_VAULT_URL: "http://127.0.0.1:9/mcp", COMPANION_VAULT_TOKEN: "tok" }, [INIT]);
    expect(closed[0]!.error.message).toContain("not reachable at http://127.0.0.1:9/mcp");
    const unset = await runProxy({}, [INIT, INITIALIZED]);
    expect(unset).toEqual([{ jsonrpc: "2.0", id: 1, error: { code: -32000, message: expect.stringContaining("Set the vault bridge URL and token") } }]);
  });
});
