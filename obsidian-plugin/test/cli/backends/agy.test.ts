import { describe, expect, it, vi } from "vitest";
import { agyBackend, buildAgyArgv, buildAgyCompletionArgv, parseAgyLine } from "../../../src/cli/backends/agy";
import { parseAgyModels } from "../../../src/cli/modelDiscovery";
import type { CliArgvInput } from "../../../src/cli/backends/types";

const baseInput: CliArgvInput = {
  model: "gemini-2.5-pro",
  systemPromptFile: "",
  mcpConfigJson: "",
  allowedTools: [],
  maxTurns: 10,
  cwd: "/tmp/vault",
};

describe("buildAgyArgv and buildAgyCompletionArgv", () => {
  it("builds per-turn stream-json sandbox argv and attaches --print=<prompt> with =", () => {
    const argv = buildAgyArgv({
      ...baseInput,
      systemPromptText: "SYSTEM",
      message: "-dash prefixed message",
    });
    expect(argv).toEqual([
      "--output-format",
      "stream-json",
      "--disable-slash-commands",
      "--sandbox",
      "--model",
      "gemini-2.5-pro",
      "--print=SYSTEM\n\n-dash prefixed message",
    ]);
  });

  it("omits --model when empty and passes --conversation when resuming", () => {
    const argv = buildAgyArgv({
      ...baseInput,
      model: "",
      resumeSessionId: "conv-123",
      message: "follow up",
    });
    expect(argv).toEqual([
      "--output-format",
      "stream-json",
      "--disable-slash-commands",
      "--sandbox",
      "--conversation",
      "conv-123",
      "--print=follow up",
    ]);
  });

  it("builds completion argv without --conversation", () => {
    expect(
      buildAgyCompletionArgv({
        model: "gemini-2.5-flash",
        cwd: "/tmp/vault",
        systemPromptText: "SYS",
        message: "hello",
      }),
    ).toEqual([
      "--output-format",
      "stream-json",
      "--disable-slash-commands",
      "--sandbox",
      "--model",
      "gemini-2.5-flash",
      "--print=SYS\n\nhello",
    ]);
    expect(
      buildAgyCompletionArgv({
        model: "",
        cwd: "/tmp/vault",
      }),
    ).toEqual([
      "--output-format",
      "stream-json",
      "--disable-slash-commands",
      "--sandbox",
      "--print=",
    ]);
  });
});

describe("parseAgyLine", () => {
  it("parses init events with conversation_id, model, and string or object tools", () => {
    const line = JSON.stringify({
      event: "init",
      conversation_id: "conv-abc",
      init: {
        model: "gemini-2.5-pro",
        tools: ["read_file", { name: "grep_search" }],
      },
    });
    expect(parseAgyLine(line)).toEqual([
      {
        kind: "init",
        sessionId: "conv-abc",
        model: "gemini-2.5-pro",
        tools: ["read_file", "grep_search"],
        mcp: [],
      },
    ]);
  });

  it("parses step_update thinking and agent_response deltas and ignores empty deltas", () => {
    expect(
      parseAgyLine(
        JSON.stringify({
          event: "step_update",
          step_update: { step_type: "thinking", state: "ACTIVE", text_delta: "let me check" },
        }),
      ),
    ).toEqual([{ kind: "thinking", delta: "let me check" }]);
    expect(
      parseAgyLine(
        JSON.stringify({
          event: "step_update",
          step_update: { step_type: "thinking", state: "ACTIVE", text_delta: "" },
        }),
      ),
    ).toEqual([]);
    expect(
      parseAgyLine(
        JSON.stringify({
          event: "step_update",
          step_update: { step_type: "agent_response", state: "ACTIVE", text_delta: "Hello!" },
        }),
      ),
    ).toEqual([{ kind: "text", delta: "Hello!" }]);
  });

  it("parses tool step_update across ACTIVE, DONE, and ERROR terminal states", () => {
    const active = parseAgyLine(
      JSON.stringify({
        event: "step_update",
        step_update: {
          step_type: "tool",
          step_index: 2,
          state: "ACTIVE",
          tool_info: { name: "view_file", parameters: { path: "Note.md" } },
        },
      }),
    );
    expect(active).toEqual([
      {
        kind: "toolUse",
        block: { type: "tool_use", id: "step_2", name: "view_file", input: { path: "Note.md" } },
      },
    ]);

    const done = parseAgyLine(
      JSON.stringify({
        event: "step_update",
        step_update: {
          step_type: "tool",
          step_index: 2,
          state: "DONE",
          tool_info: { name: "view_file", parameters: { path: "Note.md" }, output: "file contents" },
        },
      }),
    );
    expect(done).toEqual([
      {
        kind: "toolUse",
        block: { type: "tool_use", id: "step_2", name: "view_file", input: { path: "Note.md" } },
      },
      {
        kind: "toolResult",
        id: "step_2",
        content: "file contents",
        isError: false,
      },
    ]);

    const failed = parseAgyLine(
      JSON.stringify({
        event: "step_update",
        step_update: {
          step_type: "tool",
          step_index: 3,
          state: "ERROR",
          tool_name: "run_cmd",
          tool_info: { error: { message: "permission denied" } },
        },
      }),
    );
    expect(failed).toEqual([
      {
        kind: "toolUse",
        block: { type: "tool_use", id: "step_3", name: "run_cmd", input: {} },
      },
      {
        kind: "toolResult",
        id: "step_3",
        content: "permission denied",
        isError: true,
      },
    ]);
  });

  it("parses result events with usage and maps cache_read_tokens to cache_read_input_tokens", () => {
    const okLine = JSON.stringify({
      event: "result",
      result: {
        status: "SUCCESS",
        finished_reason: "stop",
        response: "All done.",
        conversation_id: "conv-abc",
        usage: { input_tokens: 120, output_tokens: 45, cache_read_tokens: 80 },
      },
    });
    expect(parseAgyLine(okLine)).toEqual([
      {
        kind: "result",
        subtype: "success",
        text: "All done.",
        sessionId: "conv-abc",
        isError: false,
        usage: { input_tokens: 120, output_tokens: 45, cache_read_input_tokens: 80 },
      },
    ]);

    const errLine = JSON.stringify({
      event: "result",
      result: {
        status: "FAILED",
        finished_reason: "quota_exceeded",
        error: "Quota exceeded for model",
        conversation_id: "conv-abc",
      },
    });
    expect(parseAgyLine(errLine)).toEqual([
      {
        kind: "result",
        subtype: "quota_exceeded",
        text: "Quota exceeded for model",
        sessionId: "conv-abc",
        isError: true,
      },
    ]);
  });

  it("parses top-level error events and drops malformed JSON", () => {
    expect(
      parseAgyLine(JSON.stringify({ event: "error", conversation_id: "c1", error: { message: "Session expired" } })),
    ).toEqual([
      {
        kind: "result",
        subtype: "error",
        text: "Session expired",
        sessionId: "c1",
        isError: true,
      },
    ]);
    expect(parseAgyLine("not valid json")).toEqual([]);
    expect(parseAgyLine(JSON.stringify({ event: "unknown" }))).toEqual([]);
  });
});

describe("parseAgyModels and agyBackend.probe", () => {
  it("parses JSON command.data.models envelope and TSV output, stripping ANSI and banners", () => {
    const jsonOut = JSON.stringify({
      command: {
        data: {
          models: [
            { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
            { model: "claude-sonnet-4-5", displayName: "Claude Sonnet 4.5" },
            { id: "gemini-2.5-pro", label: "Duplicate" },
          ],
        },
      },
    });
    expect(parseAgyModels(jsonOut)).toEqual([
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    ]);

    const tsvOut = [
      "\u001b[36mFetching available models...\u001b[0m",
      "ID\tNAME",
      "gemini-2.5-pro\tGemini 2.5 Pro",
      "gemini-2.5-flash\tGemini 2.5 Flash",
      "gemini-2.5-pro\tGemini 2.5 Pro",
    ].join("\n");
    expect(parseAgyModels(tsvOut)).toEqual([
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ]);
  });

  it("probes via --output-format json models and falls back to models when flag is unsupported", async () => {
    const runJson = vi.fn(async () => ({
      stdout: JSON.stringify({ command: { data: { models: [{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" }] } } }),
      code: 0,
    }));
    expect(await agyBackend.probe(runJson)).toEqual({ loggedIn: true, method: "Antigravity" });
    expect(runJson).toHaveBeenCalledWith(["--output-format", "json", "models"]);

    const runFallback = vi.fn(async (argv: string[]) => {
      if (argv.includes("--output-format")) {
        return { stdout: "", stderr: "flags provided but not defined: -output-format", code: 2 };
      }
      return { stdout: "Fetching available models...\ngemini-2.5-pro\tGemini 2.5 Pro\n", code: 0 };
    });
    expect(await agyBackend.probe(runFallback)).toEqual({ loggedIn: true, method: "Antigravity" });
    expect(runFallback).toHaveBeenCalledTimes(2);

    const runSignedOut = vi.fn(async () => ({ stdout: "Not signed in. Run agy to sign in.", code: 1 }));
    expect(await agyBackend.probe(runSignedOut)).toEqual({ loggedIn: false, method: "" });
  });

  it("declares per-turn, chat-only metadata without MCP bridge spawn", () => {
    expect(agyBackend.id).toBe("agy-cli");
    expect(agyBackend.binary).toBe("agy");
    expect(agyBackend.processModel).toBe("per-turn");
    expect(agyBackend.supportsMcp).toBe(false);
    expect(agyBackend.supportsPermissionPrompt).toBe(false);
  });
});
