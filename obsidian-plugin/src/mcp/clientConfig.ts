// Pure helpers for the MCP bridge: token generation and client config snippets.

/** Generate a URL-safe random token. Uses Web Crypto when available. */
export function generateToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  let s = "";
  for (const b of arr) s += b.toString(16).padStart(2, "0");
  return s;
}

export interface BridgeInfo {
  port: number;
  token: string;
}

export function bridgeUrl(port: number): string {
  return `http://127.0.0.1:${port}/mcp`;
}

function requireToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) throw new Error("MCP bridge snippets require a non-empty bearer token.");
  return trimmed;
}

/** The `claude mcp add` command for Claude Code (HTTP transport). */
export function claudeCodeCommand(info: BridgeInfo): string {
  const token = requireToken(info.token);
  return `claude mcp add --transport http obsidian-vault ${bridgeUrl(info.port)} --header "Authorization: Bearer ${token}"`;
}

/** A claude_desktop_config.json fragment (uses mcp-remote to bridge HTTP→stdio). */
export function claudeDesktopConfig(info: BridgeInfo): string {
  const token = requireToken(info.token);
  const args = ["-y", "mcp-remote", bridgeUrl(info.port), "--header", `Authorization: Bearer ${token}`];
  return JSON.stringify(
    {
      mcpServers: {
        "obsidian-vault": {
          command: "npx",
          args,
        },
      },
    },
    null,
    2,
  );
}
