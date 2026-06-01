import { test } from "node:test";
import assert from "node:assert/strict";
import { filterTranscript } from "./parse-transcript.mjs";

const lines = [
  JSON.stringify({ type: "queue-operation", operation: "x" }),
  JSON.stringify({ type: "attachment", attachment: {} }),
  JSON.stringify({ type: "user", message: { role: "user", content: "What's the plan for Atlas?" } }),
  JSON.stringify({ type: "assistant", message: { role: "assistant", content: [
    { type: "thinking", thinking: "secret reasoning" },
    { type: "text", text: "Atlas ships in two phases." },
    { type: "tool_use", name: "Read", input: {} },
  ] } }),
  JSON.stringify({ type: "user", message: { role: "user", content: [
    { type: "tool_result", content: "file contents", tool_use_id: "t1" },
  ] } }),
  JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "[Request interrupted by user]" }] } }),
  JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "<command-name>/clear</command-name>" }] } }),
  "not json",
];

test("keeps only user/assistant text turns, drops noise", () => {
  const turns = filterTranscript(lines);
  assert.deepEqual(turns, [
    { role: "user", text: "What's the plan for Atlas?" },
    { role: "assistant", text: "Atlas ships in two phases." },
  ]);
});

test("joins multiple text blocks and drops interleaved tool/system records", () => {
  const turns = filterTranscript([
    JSON.stringify({ type: "system", content: "system event" }),
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [
      { type: "text", text: "First point." },
      { type: "server_tool_use", name: "advisor", input: {} },
      { type: "text", text: "Second point." },
    ] } }),
  ]);
  assert.deepEqual(turns, [{ role: "assistant", text: "First point.\nSecond point." }]);
});
