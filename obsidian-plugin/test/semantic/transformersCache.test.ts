import { describe, expect, it } from "vitest";
import { hasCachedModel, TRANSFORMERS_CACHE_NAME, type CachesLike } from "../../src/semantic/transformers/cache";
import { BUILTIN_EMBEDDING_MODEL } from "../../src/semantic/transformers/model";

const repo = BUILTIN_EMBEDDING_MODEL.hfRepo;

function fakeCaches(urls: string[], opened: string[] = []): CachesLike {
  return {
    open: (name: string) => {
      opened.push(name);
      return Promise.resolve({ keys: () => Promise.resolve(urls.map((url) => ({ url }))) });
    },
  };
}

describe("hasCachedModel", () => {
  it("true when the repo's onnx weights are cached", async () => {
    const opened: string[] = [];
    const caches = fakeCaches(
      [
        `https://huggingface.co/${repo}/resolve/main/config.json`,
        `https://huggingface.co/${repo}/resolve/main/onnx/model_quantized.onnx`,
      ],
      opened,
    );
    await expect(hasCachedModel(caches)).resolves.toBe(true);
    expect(opened).toEqual([TRANSFORMERS_CACHE_NAME]);
  });

  it("false for unrelated cached entries", async () => {
    const caches = fakeCaches([
      "https://huggingface.co/other/model/resolve/main/onnx/model.onnx",
      "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm",
    ]);
    await expect(hasCachedModel(caches)).resolves.toBe(false);
  });

  it("false when only non-weight repo files are cached (aborted download)", async () => {
    const caches = fakeCaches([`https://huggingface.co/${repo}/resolve/main/config.json`]);
    await expect(hasCachedModel(caches)).resolves.toBe(false);
  });

  it("false when the Cache API is unavailable", async () => {
    await expect(hasCachedModel(undefined)).resolves.toBe(false);
  });

  it("false when opening the cache throws", async () => {
    const caches: CachesLike = { open: () => Promise.reject(new Error("denied")) };
    await expect(hasCachedModel(caches)).resolves.toBe(false);
  });
});
