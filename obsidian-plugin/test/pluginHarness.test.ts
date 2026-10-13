import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { App } from "obsidian";
import { describe, expect, it } from "vitest";
import ClaudeCompanionPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/types";
import { buildPlugin } from "./fakes/plugin";

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return testFiles(path);
    return name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("plugin test harness", () => {
  it("no test builds the plugin from its prototype", () => {
    const hack = ["Object.create(", "ClaudeCompanionPlugin", ".prototype)"].join("");
    const offenders = testFiles(resolve(__dirname)).filter((file) => readFileSync(file, "utf8").includes(hack));
    expect(offenders).toEqual([]);
  });

  it("builds the real class with fresh settings, manifest and app", () => {
    const app = new App();
    const plugin = buildPlugin({}, app);
    expect(plugin).toBeInstanceOf(ClaudeCompanionPlugin);
    expect(plugin.settings).not.toBe(DEFAULT_SETTINGS);
    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    expect(plugin.manifest.id).toBe("claude-companion");
    expect(plugin.app).toBe(app);
  });

  it("makes private field overrides visible to the plugin's methods", () => {
    const plugin = buildPlugin({
      convState: {
        conversations: [{ id: "c1", title: "One", createdAt: 1, updatedAt: 1, messages: [] }],
        activeId: null,
      },
    });
    expect(plugin.conversations().list().map((c) => c.id)).toEqual(["c1"]);
  });
});
