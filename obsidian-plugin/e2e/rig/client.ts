// HTTP client for the rig's control API, plus state.json plumbing. Shared by
// the CLI (start/stop/status/reload) and the Playwright `rig` fixture.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RigState, ScenarioOptions } from "./types.ts";

export const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RIG_ROOT = join(PLUGIN_ROOT, ".tmp", "e2e-rig");
export const STATE_PATH = join(RIG_ROOT, "state.json");
export const DAEMON_PATH = join(dirname(fileURLToPath(import.meta.url)), "daemon.ts");

export async function readState(): Promise<RigState | null> {
  return readFile(STATE_PATH, "utf8").then((raw) => JSON.parse(raw) as RigState).catch(() => null);
}

export async function isPidAlive(pid: number): Promise<boolean> {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** A rig is "live" only when state.json names a pid that is still running. */
export async function liveState(): Promise<RigState | null> {
  const state = await readState();
  if (!state) return null;
  return await isPidAlive(state.pid) ? state : null;
}

export class ControlClient {
  private readonly state: RigState;

  constructor(state: RigState) {
    this.state = state;
  }

  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`http://127.0.0.1:${this.state.controlPort}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.state.token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`rig control ${path} -> ${response.status}: ${JSON.stringify(payload)}`);
    return payload;
  }

  health(): Promise<{ ok: boolean }> { return this.call("GET", "/health") as Promise<{ ok: boolean }>; }
  ports(): Promise<{ providerPort: number; endpointPort: number; embedPort: number }> { return this.call("GET", "/ports") as Promise<{ providerPort: number; endpointPort: number; embedPort: number }>; }
  providerRequests(): Promise<number> { return this.call("GET", "/providerRequests").then((r) => (r as { count: number }).count); }
  setStubs(scenario: ScenarioOptions): Promise<void> { return this.call("POST", "/stubs", scenario).then(() => undefined); }
  shutdown(): Promise<void> { return this.call("POST", "/shutdown").then(() => undefined); }
}

export async function waitForHealth(state: RigState, timeoutMs = 30_000): Promise<void> {
  const client = new ControlClient(state);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { await client.health(); return; } catch { /* still starting */ }
    if (Date.now() > deadline) throw new Error("rig control API did not become healthy");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
