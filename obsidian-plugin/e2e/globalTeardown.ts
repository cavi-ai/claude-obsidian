// Stops the rig only when this run's globalSetup was the one that started it —
// a rig the developer started by hand for local iteration is left running.

import { ControlClient, liveState } from "./rig/client.ts";

export default async function globalTeardown(): Promise<void> {
  if (process.env.CC_E2E_RIG_OWNED_BY_RUN !== "1") return;
  const live = await liveState();
  if (!live) return;
  await new ControlClient(live).shutdown();
}
