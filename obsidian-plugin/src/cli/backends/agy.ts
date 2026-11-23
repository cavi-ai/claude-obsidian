// Antigravity (agy) CLI backend: one `agy` process per turn in stream-json sandbox mode.

import type { TokenUsage } from "../../claude/sse";
import { parseAgyModels } from "../modelDiscovery";
import type { CliEvent } from "../streamJson";
import type { CliArgvInput, CliBackend, CliCompletionArgvInput } from "./types";

type Json = Record<string, unknown>;
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

function agyPrompt(systemPromptText: string | undefined, message: string | undefined): string {
  const msg = message ?? "";
  return systemPromptText ? `${systemPromptText}\n\n${msg}` : msg;
}

export function buildAgyArgv(input: CliArgvInput): string[] {
  const argv = ["--output-format", "stream-json", "--disable-slash-commands", "--sandbox"];
  if (input.model) argv.push("--model", input.model);
  if (input.resumeSessionId) argv.push("--conversation", input.resumeSessionId);
  if (input.message !== undefined) argv.push(`--print=${agyPrompt(input.systemPromptText, input.message)}`);
  return argv;
}

export function buildAgyCompletionArgv(input: CliCompletionArgvInput): string[] {
  const prompt = agyPrompt(input.systemPromptText, input.message);
  return [
    "--output-format",
    "stream-json",
    "--disable-slash-commands",
    "--sandbox",
    ...(input.model ? ["--model", input.model] : []),
    `--print=${prompt}`,
  ];
}

export function parseAgyLine(line: string): CliEvent[] {
  let o: Json;
  try {
    o = obj(JSON.parse(line));
  } catch (e) {
    console.debug("Claude Companion: Antigravity event JSON parse failed", e);
    return [];
  }
  switch (o.event) {
    case "init": {
      const initObj = obj(o.init);
      const rawTools = Array.isArray(initObj.tools) ? initObj.tools : [];
      const tools = rawTools
        .map((t) => (typeof t === "string" ? t : str(obj(t).name)))
        .filter((t) => t.length > 0);
      return [{ kind: "init", sessionId: str(o.conversation_id), model: str(initObj.model), tools, mcp: [] }];
    }
    case "step_update": {
      const step = obj(o.step_update);
      const stepType = str(step.step_type);
      const state = str(step.state);
      if (stepType === "thinking") {
        const delta = str(step.text_delta);
        return delta ? [{ kind: "thinking", delta }] : [];
      }
      if (stepType === "agent_response") {
        const delta = str(step.text_delta);
        return delta ? [{ kind: "text", delta }] : [];
      }
      if (stepType === "tool") {
        const id = `step_${num(step.step_index) ?? 0}`;
        const info = obj(step.tool_info);
        const name = str(info.name, str(step.tool_name, "tool"));
        const input = obj(info.parameters);
        const terminal = state === "DONE" || state === "ERROR" || state === "FAILED" || state === "CANCELED" || state === "CANCELLED";
        const events: CliEvent[] = [];
        if (state === "ACTIVE" || terminal) {
          events.push({ kind: "toolUse", block: { type: "tool_use", id, name, input } });
        }
        if (terminal) {
          const errMsg = str(obj(info.error).message, typeof info.error === "string" ? info.error : "");
          const isError = state !== "DONE" || Boolean(errMsg);
          const content = errMsg || str(info.output);
          events.push({ kind: "toolResult", id, content, isError });
        }
        return events;
      }
      return [];
    }
    case "result": {
      const res = obj(o.result);
      const status = str(res.status);
      const finishedReason = str(res.finished_reason);
      const errText = str(obj(res.error).message, typeof res.error === "string" ? res.error : "");
      const isError = status !== "SUCCESS" || Boolean(res.error) || (finishedReason !== "" && finishedReason !== "stop");
      const u = obj(res.usage);
      const inputTokens = num(u.input_tokens);
      const outputTokens = num(u.output_tokens);
      const cacheReadTokens = num(u.cache_read_tokens) ?? num(u.cache_read_input_tokens);
      const usage: TokenUsage = {
        ...(inputTokens !== undefined ? { input_tokens: inputTokens } : {}),
        ...(outputTokens !== undefined ? { output_tokens: outputTokens } : {}),
        ...(cacheReadTokens !== undefined ? { cache_read_input_tokens: cacheReadTokens } : {}),
      };
      return [{
        kind: "result",
        subtype: isError ? (finishedReason || "error") : "success",
        text: isError ? (errText || str(res.response, "Antigravity run failed")) : str(res.response),
        sessionId: str(res.conversation_id, str(o.conversation_id)),
        isError,
        ...(Object.keys(usage).length > 0 ? { usage } : {}),
      }];
    }
    case "error": {
      const errText = str(obj(o.error).message, typeof o.error === "string" ? o.error : str(o.message, "Antigravity run failed"));
      return [{ kind: "result", subtype: "error", text: errText, sessionId: str(o.conversation_id), isError: true }];
    }
    default:
      return [];
  }
}

export const agyBackend: CliBackend = {
  id: "agy-cli",
  label: "Antigravity",
  binary: "agy",
  processModel: "per-turn",
  supportsPermissionPrompt: false,
  supportsMcp: false,
  signInHint: "run `agy` and sign in",
  async probe(run) {
    const first = await run(["--output-format", "json", "models"]);
    const combinedFirst = `${first.stdout}\n${first.stderr ?? ""}`;
    const res = first.code !== 0 && /flags provided but not defined|unknown flag/i.test(combinedFirst)
      ? await run(["models"])
      : first;
    const combined = `${res.stdout}\n${res.stderr ?? ""}`;
    if (res.code !== 0 || /not signed in|not logged in|authentication required/i.test(combined)) {
      return { loggedIn: false, method: "" };
    }
    const models = parseAgyModels(res.stdout);
    return { loggedIn: models.length > 0, method: models.length > 0 ? "Antigravity" : "" };
  },
  buildArgv: buildAgyArgv,
  buildCompletionArgv: buildAgyCompletionArgv,
  parseLine: parseAgyLine,
};
