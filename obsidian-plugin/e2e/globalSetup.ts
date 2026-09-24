// Runs once before the whole `playwright test` invocation. Local iteration
// starts the rig by hand (`pnpm run e2e:rig start`) and reuses it across many
// runs; CI has none yet, so this starts one and globalTeardown stops it.

import { spawn } from "node:child_process";
import { DAEMON_PATH, PLUGIN_ROOT, liveState, readState, waitForHealth } from "./rig/client.ts";

export default async function globalSetup(): Promise<void> {
  const live = await liveState();
  if (live) return;

  const child = spawn(process.execPath, [DAEMON_PATH], { cwd: PLUGIN_ROOT, detached: true, stdio: "ignore" });
  child.unref();
  const deadline = Date.now() + 60_000;
  let state = await readState();
  while (!state && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    state = await readState();
  }
  if (!state) throw new Error("rig did not write state.json within 60s");
  await waitForHealth(state);
  // Told apart from a rig the developer started by hand: only a run that had to
  // start one itself is responsible for stopping it again.
  process.env.CC_E2E_RIG_OWNED_BY_RUN = "1";
}
