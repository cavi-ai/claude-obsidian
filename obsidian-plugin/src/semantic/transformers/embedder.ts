// Main-thread half of the built-in engine: lazy worker spawn, load-once
// then embed, request correlation, crash recovery. The Worker is injected
// (main.ts creates it from the inlined bundle via a Blob URL) so this file
// stays pure and unit-testable.

import type { Embedder } from "../embedder";
import { BUILTIN_EMBEDDING_MODEL } from "./model";
import { RequestTracker, type ProgressEvent, type WorkerRequest, type WorkerResponse } from "./protocol";

export interface WorkerLike {
  postMessage(msg: unknown): void;
  terminate(): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export class TransformersEmbedder implements Embedder {
  readonly id = BUILTIN_EMBEDDING_MODEL.id;

  private worker: WorkerLike | null = null;
  private tracker = new RequestTracker();
  private loaded: Promise<void> | null = null;
  private _backend: string | null = null;

  constructor(private createWorker: () => WorkerLike) {}

  /** "webgpu" | "wasm" once loaded; null before. */
  backend(): string | null {
    return this._backend;
  }

  /** Explicit download/warm-up with progress (settings button). */
  download(onProgress?: (p: ProgressEvent) => void): Promise<void> {
    return this.ensureLoaded(onProgress);
  }

  async embed(texts: string[]): Promise<number[][]> {
    await this.ensureLoaded();
    const req = this.tracker.create<number[][]>();
    this.post({ id: req.id, type: "embed", texts });
    return req.promise;
  }

  /** Kill the worker (unload / engine switch). Safe to call repeatedly. */
  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.loaded = null;
    this._backend = null;
    this.tracker.rejectAll(new Error("embedding worker terminated"));
  }

  private ensureLoaded(onProgress?: (p: ProgressEvent) => void): Promise<void> {
    if (!this.loaded) {
      const req = this.tracker.create<number[][]>(onProgress);
      this.post({ id: req.id, type: "load" });
      const loadPromise = req.promise.then(() => undefined).catch((e: unknown) => {
        if (this.loaded === loadPromise) this.loaded = null; // allow retry after a failed load
        throw e;
      });
      // Prevent vitest/node unhandled-rejection noise when a crash rejects
      // this promise but nobody is currently awaiting it (e.g. embed()'s
      // caller already got its own rejection from tracker.rejectAll()).
      loadPromise.catch(() => {});
      this.loaded = loadPromise;
    }
    return this.loaded;
  }

  private post(msg: WorkerRequest): void {
    if (!this.worker) {
      const w = this.createWorker();
      w.onmessage = (e) => {
        const data = e.data as WorkerResponse;
        if (data.type === "result" && data.backend) this._backend = data.backend;
        this.tracker.settle(data);
      };
      w.onerror = () => {
        this.worker = null;
        this.loaded = null;
        this.tracker.rejectAll(new Error("embedding worker crashed"));
      };
      this.worker = w;
    }
    this.worker.postMessage(msg);
  }
}
