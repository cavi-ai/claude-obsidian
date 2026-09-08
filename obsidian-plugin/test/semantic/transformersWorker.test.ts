import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerRequest, WorkerResponse } from "../../src/semantic/transformers/protocol";

const transformers = vi.hoisted(() => ({
  pipeline: vi.fn(),
  env: {
    allowLocalModels: true,
    useBrowserCache: false,
    useWasmCache: false,
    backends: { onnx: { wasm: { numThreads: 4 } } },
  },
}));

vi.mock("@huggingface/transformers", () => transformers);

describe("built-in embedding worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("uses WASM directly when the WebGPU API has no adapter", async () => {
    let runtimePoisoned = false;
    transformers.pipeline.mockImplementation(async (_task, _repo, options) => {
      if (options.device === "webgpu") {
        runtimePoisoned = true;
        throw new Error("Failed to get GPU adapter");
      }
      if (runtimePoisoned) throw new Error("WebGPU initialization poisoned the shared runtime");
      return Object.assign(
        async () => ({ tolist: () => [] }),
        { dispose: async () => undefined },
      );
    });

    const responses: WorkerResponse[] = [];
    const workerScope: {
      onmessage: ((event: { data: WorkerRequest }) => void) | null;
      postMessage(message: WorkerResponse): void;
    } = {
      onmessage: null,
      postMessage: (message) => responses.push(message),
    };
    vi.stubGlobal("self", workerScope);
    vi.stubGlobal("navigator", {
      gpu: { requestAdapter: async () => null },
    });

    await import("../../src/semantic/transformers/worker");
    workerScope.onmessage?.({
      data: {
        id: 1,
        type: "load",
        repo: "Snowflake/snowflake-arctic-embed-xs",
        pooling: "cls",
      },
    });

    await vi.waitFor(() => {
      expect(responses).toContainEqual({ id: 1, type: "result", vectors: [], backend: "wasm" });
    });
  });
});
