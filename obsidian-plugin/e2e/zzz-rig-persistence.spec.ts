import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { STATE_PATH } from "./rig/client.ts";
import type { RigState } from "./rig/types.ts";

// Sorts last: the final proof that the one rig this run attached to (rig.processId,
// captured once when the worker-scoped fixture first connected) is still the same
// Obsidian process now that every other spec in the suite has run against it.
test("the rig is still the same Obsidian process at the end of the suite", async ({ rig }) => {
  const state = JSON.parse(await readFile(STATE_PATH, "utf8")) as RigState;
  expect(state.obsidianPid).toBe(rig.processId);
  expect(() => process.kill(state.obsidianPid, 0)).not.toThrow();
});
