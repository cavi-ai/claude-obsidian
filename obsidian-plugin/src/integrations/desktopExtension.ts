// The Claude Desktop extension (.mcpb) for Companion's vault bridge: a manifest
// plus a dependency-free stdio proxy that Claude Desktop runs on its built-in
// Node. The bridge URL is a setting; the token is a sensitive setting the user
// pastes at install, so Companion never writes it to disk. Pure.

import { strToU8, zipSync } from "fflate";
import { isRecord } from "../records";

/** Bundle file name; no spaces so every platform's opener takes it as one argument. */
export const EXTENSION_FILE_NAME = "companion-obsidian-vault.mcpb";
export const EXTENSION_NAME = "companion-obsidian-vault";
/** Version of the proxy and manifest; raise it when either changes so Claude Desktop offers the update. */
export const EXTENSION_VERSION = "1.0.0";
/** The settings field Claude Desktop shows for the token. */
export const EXTENSION_TOKEN_TITLE = "Vault bridge token";

/** MCP over stdio to Companion's loopback HTTP bridge. Runs under plain `node`; uses only built-ins. */
export const PROXY_SOURCE = String.raw`"use strict";
// Companion for Claude: MCP over stdio to Companion's vault bridge in Obsidian.
const readline = require("node:readline");
const URL_ = (process.env.COMPANION_VAULT_URL || "").trim();
const TOKEN = (process.env.COMPANION_VAULT_TOKEN || "").trim();
let session = null;
let initRequest = null;
const out = (message) => process.stdout.write(JSON.stringify(message) + "\n");
const idsOf = (message) => (Array.isArray(message) ? message : [message])
  .map((m) => (m && typeof m === "object" ? m.id : undefined))
  .filter((id) => id !== undefined && id !== null);
const failAll = (message, text) => { for (const id of idsOf(message)) out({ jsonrpc: "2.0", id, error: { code: -32000, message: text } }); };
async function post(message) {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer " + TOKEN };
  if (session) headers["mcp-session-id"] = session;
  const response = await fetch(URL_, { method: "POST", headers, body: JSON.stringify(message) });
  const id = response.headers.get("mcp-session-id");
  if (id) session = id;
  return response;
}
function emit(text, type) {
  const bodies = type.includes("text/event-stream")
    ? text.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim())
    : [text];
  for (const body of bodies) {
    if (!body.trim()) continue;
    try { out(JSON.parse(body)); } catch { /* not JSON-RPC */ }
  }
}
async function reinitialize() {
  session = null;
  const response = await post(initRequest);
  await response.text();
  if (!response.ok) return false;
  await (await post({ jsonrpc: "2.0", method: "notifications/initialized" })).text();
  return true;
}
async function forward(message) {
  if (!URL_ || !TOKEN) return failAll(message, "Set the vault bridge URL and token in this extension's settings in Claude Desktop.");
  const isInit = !Array.isArray(message) && message && message.method === "initialize";
  if (isInit) { initRequest = message; session = null; }
  let response;
  try {
    response = await post(message);
    // The bridge forgets sessions when Obsidian restarts; start a new one and retry once.
    if (response.status === 404 && !isInit && initRequest) {
      await response.text();
      if (await reinitialize()) response = await post(message);
    }
  } catch {
    return failAll(message, "Companion's vault bridge is not reachable at " + URL_ + ". Open Obsidian with Companion's vault bridge turned on.");
  }
  const text = await response.text();
  if (response.status === 202 || response.status === 204) return;
  if (!response.ok) {
    return failAll(message, response.status === 401
      ? "Companion's vault bridge rejected the token. Copy it again in Companion and update this extension's settings."
      : "Companion's vault bridge answered HTTP " + response.status + ".");
  }
  emit(text, response.headers.get("content-type") || "");
}
let ready = Promise.resolve();
const pending = new Set();
const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch { return out({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
  // Everything waits for the latest initialize, so its session is in place; the rest run concurrently.
  const run = ready.then(() => forward(message));
  if (!Array.isArray(message) && message && message.method === "initialize") ready = run.catch(() => undefined);
  const task = run.catch((error) => failAll(message, String((error && error.message) || error)));
  pending.add(task);
  task.finally(() => pending.delete(task));
});
input.on("close", () => { Promise.allSettled([...pending]).then(() => process.exit(0)); });
`;

export interface ExtensionInput {
  version: string;
  /** The bridge's MCP endpoint, e.g. http://127.0.0.1:27125/mcp. */
  url: string;
}

/** The MCPB manifest (spec 0.3) for the proxy. */
export function extensionManifest(input: ExtensionInput): Record<string, unknown> {
  return {
    manifest_version: "0.3",
    name: EXTENSION_NAME,
    display_name: "Obsidian vault (Companion for Claude)",
    version: input.version,
    description: "Your Obsidian vault in Claude Desktop through Companion for Claude's vault bridge. Obsidian must be open.",
    author: { name: "Companion for Claude", url: "https://github.com/cavi-ai/companion-for-claude" },
    server: {
      type: "node",
      entry_point: "server/index.js",
      mcp_config: {
        command: "node",
        args: ["${__dirname}/server/index.js"],
        env: { COMPANION_VAULT_URL: "${user_config.url}", COMPANION_VAULT_TOKEN: "${user_config.token}" },
      },
    },
    tools_generated: true,
    prompts_generated: true,
    user_config: {
      url: {
        type: "string",
        title: "Vault bridge URL",
        description: "Companion's vault bridge address, shown in Companion's MCP settings.",
        default: input.url,
        required: true,
      },
      token: {
        type: "string",
        title: EXTENSION_TOKEN_TITLE,
        description: "The token Companion copied when you connected Claude Desktop; it is also in Companion's MCP settings.",
        sensitive: true,
        required: true,
      },
    },
    compatibility: { platforms: ["darwin", "win32"], runtimes: { node: ">=18.0.0" } },
  };
}

/** The .mcpb bundle: a zip with manifest.json and server/index.js at its root. */
export function buildExtensionBundle(input: ExtensionInput, mtime = new Date("2026-01-01T00:00:00Z")): Uint8Array {
  return zipSync({
    "manifest.json": strToU8(`${JSON.stringify(extensionManifest(input), null, 2)}\n`),
    "server/index.js": strToU8(PROXY_SOURCE),
  }, { level: 6, mtime });
}

/**
 * claude_desktop_config.json without the `obsidian-vault` entry earlier Companion
 * versions wrote (npx mcp-remote to the loopback bridge, token in its args).
 * Null when there is no such entry or the file is not a JSON object: a config
 * Companion did not write is never touched.
 */
export function withoutLegacyBridgeEntry(source: string | null): string | null {
  if (!source?.trim()) return null;
  let root: unknown;
  try {
    root = JSON.parse(source) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(root) || !isRecord(root.mcpServers)) return null;
  const entry = root.mcpServers["obsidian-vault"];
  if (!isRecord(entry) || entry.command !== "npx" || !Array.isArray(entry.args)) return null;
  const args = entry.args.filter((arg): arg is string => typeof arg === "string");
  if (!args.includes("mcp-remote") || !args.some((arg) => /^http:\/\/127\.0\.0\.1:\d+\/mcp$/.test(arg))) return null;
  const { ["obsidian-vault"]: _removed, ...servers } = root.mcpServers;
  return `${JSON.stringify({ ...root, mcpServers: servers }, null, 2)}\n`;
}
