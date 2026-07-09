// The embedding worker: hosts transformers.js so tokenization + inference
// never block Obsidian's UI thread. Self-contained — esbuild bundles this
// file (transformers.js included) into a text artifact that main.ts turns
// into a Blob-URL worker. NOTHING here fetches the network until the first
// "load" request, which only ever arrives from an explicit user action —
// importing @huggingface/transformers just sets config defaults (verified
// against the 4.2.0 source: env.js / backends/onnx.js fetch nothing at
// import; they only write the default wasmPaths URLs into ORT's env).
//
// Network + caching (verified against @huggingface/transformers@4.2.0):
// - Model weights/tokenizer download from huggingface.co on the first "load"
//   and are cached in the Cache API ("transformers-cache", env.useBrowserCache).
// - ONNX-runtime's sidecar binaries (ort-wasm-simd-threaded.asyncify.{mjs,wasm})
//   resolve to cdn.jsdelivr.net by default; env.useWasmCache makes the library
//   fetch them once during the same consented load and cache them in the same
//   Cache API bucket, so every later load is fully offline. Inlining them into
//   this bundle instead was rejected: the .wasm alone is ~23 MB (~31 MB as
//   base64), which would balloon main.js for every user, downloaded or not.

import { pipeline, env } from "@huggingface/transformers";
import { BUILTIN_EMBEDDING_MODEL } from "./model";
import type { WorkerRequest, WorkerResponse } from "./protocol";

// The dedicated-worker global, narrowed to what this file uses. (A plain
// `declare const self` would collide with lib.dom's declaration.)
const ctx = self as unknown as {
  onmessage: ((e: { data: WorkerRequest }) => void) | null;
  postMessage(msg: WorkerResponse): void;
};

env.allowLocalModels = false; // hub + cache only; never probe local /models/ paths
if (typeof caches !== "undefined") {
  env.useBrowserCache = true; // weights cached in the Cache API
  env.useWasmCache = true; // ORT wasm binary + mjs factory cached alongside them
}
// Single-threaded WASM: ORT's multithreaded path spawns nested workers from
// import.meta.url, which doesn't exist inside this Blob-URL iife bundle.
const onnxEnv = env.backends.onnx as { wasm?: { numThreads?: number } };
if (onnxEnv.wasm) onnxEnv.wasm.numThreads = 1;

/** The feature-extraction pipeline: callable, plus dispose to free ORT sessions. */
interface Extractor {
  (texts: string[], opts: { pooling: "cls" | "mean"; normalize: boolean }): Promise<{
    tolist(): number[][];
  }>;
  dispose?: () => Promise<void>;
}

let extractor: Extractor | null = null;
let backend = "wasm";

const POOLING_OPTS = { pooling: BUILTIN_EMBEDDING_MODEL.pooling, normalize: true } as const;

function makeExtractor(device: "webgpu" | "wasm", id: number): Promise<Extractor> {
  // Hub progress events carry {status:"progress", file, progress: 0-100};
  // other statuses (initiate/download/done/ready) have no progress field.
  const progress = (p: unknown) => {
    const info = p as { progress?: number; file?: string };
    if (typeof info.progress === "number") {
      ctx.postMessage({ id, type: "progress", percent: Math.round(info.progress), file: info.file ?? "" });
    }
  };
  // q8 → onnx/model_quantized.onnx (verified present in the pinned repo).
  return pipeline("feature-extraction", BUILTIN_EMBEDDING_MODEL.hfRepo, {
    device,
    dtype: "q8",
    progress_callback: progress,
  });
}

async function load(id: number): Promise<void> {
  if (extractor) {
    ctx.postMessage({ id, type: "result", vectors: [], backend });
    return;
  }
  // pipeline() throws synchronously-via-rejection when navigator.gpu is
  // missing ("Unsupported device"), but some WebGPU failures only surface at
  // session creation or first inference — probe the API up front, then verify
  // with a warm-up inference before committing to the backend. Weights are
  // already cached by then, so the wasm fallback re-load is offline.
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    let candidate: Extractor | null = null;
    try {
      candidate = await makeExtractor("webgpu", id);
      await candidate(["warm-up"], POOLING_OPTS);
      extractor = candidate;
      backend = "webgpu";
    } catch {
      void candidate?.dispose?.()?.catch(() => {});
    }
  }
  if (!extractor) {
    extractor = await makeExtractor("wasm", id);
    backend = "wasm";
  }
  ctx.postMessage({ id, type: "result", vectors: [], backend });
}

async function embed(id: number, texts: string[]): Promise<void> {
  if (!extractor) {
    ctx.postMessage({ id, type: "error", message: "model not loaded" });
    return;
  }
  const out = await extractor(texts, POOLING_OPTS);
  ctx.postMessage({ id, type: "result", vectors: out.tolist() });
}

ctx.onmessage = (e) => {
  const msg = e.data;
  const fail = (err: unknown) =>
    ctx.postMessage({
      id: msg.id,
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  if (msg.type === "load") void load(msg.id).catch(fail);
  else if (msg.type === "embed") void embed(msg.id, msg.texts).catch(fail);
  else if (msg.type === "dispose") {
    void extractor?.dispose?.()?.catch(() => {});
    extractor = null;
  }
};
