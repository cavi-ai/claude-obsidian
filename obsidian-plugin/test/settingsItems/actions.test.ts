import { describe, expect, it } from "vitest";
import {
  addMcpServer, canDeleteDeviceModel, editMcpServer, regenerateMcpToken, removeMcpServer, setCredential, setMcpEnabled,
} from "../../src/settingsItems/actions";
import { DEFAULT_SETTINGS, type McpServerConfig, type PluginSettings } from "../../src/types";

const fresh = (): PluginSettings => structuredClone(DEFAULT_SETTINGS);
const server = (): McpServerConfig => ({ name: "n", enabled: true, transport: "http", url: "", command: "", args: "" });

describe("setCredential", () => {
  it("stores the value trimmed", () => {
    const s = fresh();
    setCredential(s, "apiKey", "  sk-ant-x \n");
    expect(s.apiKey).toBe("sk-ant-x");
  });
});

describe("MCP client servers", () => {
  it("adds an enabled, empty HTTP server", () => {
    const s = fresh();
    s.mcpClientServers = [];
    addMcpServer(s);
    expect(s.mcpClientServers).toEqual([{ name: "", enabled: true, transport: "http", url: "", command: "", args: "" }]);
  });

  it("removes only the server at the index", () => {
    const s = fresh();
    s.mcpClientServers = [{ ...server(), name: "a" }, { ...server(), name: "b" }, { ...server(), name: "c" }];
    removeMcpServer(s, 1);
    expect(s.mcpClientServers.map((x) => x.name)).toEqual(["a", "c"]);
  });

  it("keeps name and args verbatim and trims url and command", () => {
    const x = server();
    editMcpServer(x, { field: "name", value: " My Server " });
    editMcpServer(x, { field: "args", value: " -y  pkg " });
    editMcpServer(x, { field: "url", value: "  https://example.test/mcp " });
    editMcpServer(x, { field: "command", value: " npx " });
    expect(x).toMatchObject({ name: " My Server ", args: " -y  pkg ", url: "https://example.test/mcp", command: "npx" });
  });

  it("sets enabled and transport", () => {
    const x = server();
    editMcpServer(x, { field: "enabled", value: false });
    editMcpServer(x, { field: "transport", value: "stdio" });
    expect(x).toMatchObject({ enabled: false, transport: "stdio" });
  });
});

describe("MCP bridge token", () => {
  it("mints a token when enabling with none resolved", () => {
    const s = fresh();
    s.mcpToken = "";
    setMcpEnabled(s, true, () => false, () => "minted");
    expect(s).toMatchObject({ mcpEnabled: true, mcpToken: "minted" });
  });

  it("keeps the stored token when one already resolves", () => {
    const s = fresh();
    s.mcpToken = "existing";
    setMcpEnabled(s, true, () => true, () => "minted");
    expect(s.mcpToken).toBe("existing");
  });

  it("never mints or resolves when disabling", () => {
    const s = fresh();
    s.mcpToken = "";
    let resolved = false;
    setMcpEnabled(s, false, () => { resolved = true; return false; }, () => "minted");
    expect(s).toMatchObject({ mcpEnabled: false, mcpToken: "" });
    expect(resolved).toBe(false);
  });

  it("regenerate replaces the stored token", () => {
    const s = fresh();
    s.mcpToken = "old";
    regenerateMcpToken(s, () => "new");
    expect(s.mcpToken).toBe("new");
  });
});

describe("canDeleteDeviceModel", () => {
  it("allows deletion only when idle", () => {
    expect(canDeleteDeviceModel({ chatBusy: false, downloading: false })).toBe(true);
    expect(canDeleteDeviceModel({ chatBusy: true, downloading: false })).toBe(false);
    expect(canDeleteDeviceModel({ chatBusy: false, downloading: true })).toBe(false);
  });
});
