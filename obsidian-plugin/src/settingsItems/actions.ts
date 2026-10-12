// Pure settings mutations and decisions behind the settings tab's handlers.
// No Obsidian, no IO: callers save and re-render.

import type { McpServerConfig, PluginSettings } from "../types";

/** Settings holding a secret typed into a password field; stored trimmed. */
export type CredentialKey =
  | "apiKey" | "oauthToken" | "braveSearchApiKey" | "zoteroApiKey" | "cloudRoutineToken"
  | "cloudReplyToken" | "publishGithubToken" | "mcpToken";

export function setCredential(s: PluginSettings, key: CredentialKey, value: string): void {
  s[key] = value.trim();
}

export function addMcpServer(s: PluginSettings): void {
  s.mcpClientServers.push({ name: "", enabled: true, transport: "http", url: "", command: "", args: "" });
}

export function removeMcpServer(s: PluginSettings, index: number): void {
  s.mcpClientServers.splice(index, 1);
}

export type McpServerEdit =
  | { field: "enabled"; value: boolean }
  | { field: "name" | "args"; value: string }
  | { field: "transport"; value: McpServerConfig["transport"] }
  | { field: "url" | "command"; value: string };

/** Name and arguments are stored verbatim; URL and command are trimmed. */
export function editMcpServer(server: McpServerConfig, edit: McpServerEdit): void {
  switch (edit.field) {
    case "enabled":
      server.enabled = edit.value;
      return;
    case "transport":
      server.transport = edit.value;
      return;
    case "name":
    case "args":
      server[edit.field] = edit.value;
      return;
    case "url":
    case "command":
      server[edit.field] = edit.value.trim();
      return;
  }
}

/** Turning the bridge on mints a stored token only when neither the env var nor a stored token resolves. */
export function setMcpEnabled(s: PluginSettings, enabled: boolean, hasToken: () => boolean, mint: () => string): void {
  s.mcpEnabled = enabled;
  if (enabled && !hasToken()) s.mcpToken = mint();
}

export function regenerateMcpToken(s: PluginSettings, mint: () => string): void {
  s.mcpToken = mint();
}

/** A model cannot be deleted while a request or a download is using it. */
export function canDeleteDeviceModel(state: { chatBusy: boolean; downloading: boolean }): boolean {
  return !state.chatBusy && !state.downloading;
}
