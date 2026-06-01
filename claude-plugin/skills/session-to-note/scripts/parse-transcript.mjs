#!/usr/bin/env node
// Read a Claude Code session transcript (.jsonl) and emit clean conversational
// turns — user/assistant prose only, with thinking, tool calls/results, and
// harness noise stripped. Dependency-free (Node stdlib).

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const NOISE_PREFIXES = ["<command-", "<local-command", "<system-reminder", "Caveat:"];

function blockText(role, content) {
  // content may be a raw string (user) or an array of typed blocks.
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
}

function isNoise(text) {
  const t = text.trim();
  if (t === "" || t === "[Request interrupted by user]") return true;
  return NOISE_PREFIXES.some((p) => t.startsWith(p));
}

/** Filter raw .jsonl lines to [{ role, text }] conversational turns. */
export function filterTranscript(lines) {
  const turns = [];
  for (const line of lines) {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (rec.type !== "user" && rec.type !== "assistant") continue;
    const msg = rec.message ?? {};
    const text = blockText(rec.type, msg.content).trim();
    if (!text || isNoise(text)) continue;
    turns.push({ role: rec.type, text });
  }
  return turns;
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: parse-transcript.mjs <transcript.jsonl>");
    process.exit(1);
  }
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  const turns = filterTranscript(lines);
  for (const t of turns) {
    console.log(`## ${t.role === "user" ? "User" : "Claude"}\n\n${t.text}\n`);
  }
}

// Run main only when invoked directly, not when imported by the test.
// pathToFileURL handles paths with spaces/symlinks (e.g. "Application Support").
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
