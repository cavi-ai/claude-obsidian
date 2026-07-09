import { describe, it, expect, vi } from "vitest";
import { TransformersEmbedder, type WorkerLike } from "../../src/semantic/transformers/embedder";
import { BUILTIN_EMBEDDING_MODEL } from "../../src/semantic/transformers/model";
import type { WorkerRequest } from "../../src/semantic/transformers/protocol";

class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  sent: WorkerRequest[] = [];
  terminated = false;
  postMessage(msg: unknown): void {
    this.sent.push(msg as WorkerRequest);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: unknown): void {
    this.onmessage?.({ data });
  }
}

function make(): { e: TransformersEmbedder; workers: FakeWorker[] } {
  const workers: FakeWorker[] = [];
  const e = new TransformersEmbedder(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  return { e, workers };
}

describe("TransformersEmbedder", () => {
  it("has the pinned builtin id and spawns no worker until first use", () => {
    const { e, workers } = make();
    expect(e.id).toBe(BUILTIN_EMBEDDING_MODEL.id);
    expect(workers).toHaveLength(0);
  });

  it("embed() spawns one worker, sends load then embed, resolves vectors", async () => {
    const { e, workers } = make();
    const p = e.embed(["a", "b"]);
    expect(workers).toHaveLength(1);
    const w = workers[0]!;
    expect(w.sent[0]).toMatchObject({ type: "load" });
    w.reply({ id: w.sent[0]!.id, type: "result", vectors: [], backend: "wasm" });
    await vi.waitFor(() => expect(w.sent[1]).toMatchObject({ type: "embed", texts: ["a", "b"] }));
    w.reply({ id: w.sent[1]!.id, type: "result", vectors: [[1], [2]] });
    await expect(p).resolves.toEqual([[1], [2]]);
    expect(e.backend()).toBe("wasm");
  });

  it("reuses the loaded worker for subsequent embeds (single load)", async () => {
    const { e, workers } = make();
    const p1 = e.embed(["a"]);
    const w = workers[0]!;
    w.reply({ id: w.sent[0]!.id, type: "result", vectors: [], backend: "webgpu" });
    await vi.waitFor(() => expect(w.sent).toHaveLength(2));
    w.reply({ id: w.sent[1]!.id, type: "result", vectors: [[1]] });
    await p1;
    const p2 = e.embed(["b"]);
    await vi.waitFor(() => expect(w.sent).toHaveLength(3));
    expect(w.sent.filter((m) => m.type === "load")).toHaveLength(1);
    w.reply({ id: w.sent[2]!.id, type: "result", vectors: [[2]] });
    await expect(p2).resolves.toEqual([[2]]);
    expect(workers).toHaveLength(1);
  });

  it("download() forwards progress and resolves when the load completes", async () => {
    const { e, workers } = make();
    const seen: number[] = [];
    const p = e.download((pr) => seen.push(pr.percent));
    const w = workers[0]!;
    w.reply({ id: w.sent[0]!.id, type: "progress", percent: 10, file: "model.onnx" });
    w.reply({ id: w.sent[0]!.id, type: "progress", percent: 100, file: "model.onnx" });
    w.reply({ id: w.sent[0]!.id, type: "result", vectors: [], backend: "webgpu" });
    await p;
    expect(seen).toEqual([10, 100]);
    expect(e.backend()).toBe("webgpu");
  });

  it("worker onerror rejects in-flight requests and the next call respawns", async () => {
    const { e, workers } = make();
    const p = e.embed(["a"]);
    workers[0]!.onerror?.(new Error("crash"));
    await expect(p).rejects.toThrow();
    const p2 = e.embed(["b"]);
    expect(workers).toHaveLength(2);
    const w2 = workers[1]!;
    w2.reply({ id: w2.sent[0]!.id, type: "result", vectors: [] });
    await vi.waitFor(() => expect(w2.sent).toHaveLength(2));
    w2.reply({ id: w2.sent[1]!.id, type: "result", vectors: [[3]] });
    await expect(p2).resolves.toEqual([[3]]);
  });

  it("terminate() kills the worker and rejects in-flight requests", async () => {
    const { e, workers } = make();
    const p = e.embed(["a"]);
    e.terminate();
    expect(workers[0]!.terminated).toBe(true);
    await expect(p).rejects.toThrow();
  });
});
