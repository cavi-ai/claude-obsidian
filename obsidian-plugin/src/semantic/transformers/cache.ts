// Cache-awareness for the consent gate: has the built-in model already been
// downloaded? transformers.js stores browser downloads in the Cache API bucket
// `env.cacheKey` ("transformers-cache" — verified against
// @huggingface/transformers@4.2.0 src/env.js + src/utils/cache.js), keyed by
// the remote URL (https://huggingface.co/<repo>/resolve/<rev>/<file>). The
// CacheStorage is injected so this stays pure and unit-testable.

import { BUILTIN_EMBEDDING_MODEL } from "./model";

/** transformers.js's default Cache API bucket (env.cacheKey). */
export const TRANSFORMERS_CACHE_NAME = "transformers-cache";

/** The slice of CacheStorage this module needs (window.caches satisfies it). */
export interface CachesLike {
  open(name: string): Promise<{ keys(): Promise<ReadonlyArray<{ url: string }>> }>;
}

/**
 * Whether the built-in model's weights are already in the local cache — i.e.
 * embedding can proceed fully offline, no new download. Requires the .onnx
 * weights entry specifically (a stray config.json from an aborted download
 * must not pass the consent gate). False when the Cache API is unavailable
 * or unreadable.
 */
export async function hasCachedModel(cachesLike: CachesLike | undefined): Promise<boolean> {
  if (!cachesLike) return false;
  try {
    const cache = await cachesLike.open(TRANSFORMERS_CACHE_NAME);
    const keys = await cache.keys();
    return keys.some((k) => k.url.includes(`/${BUILTIN_EMBEDDING_MODEL.hfRepo}/`) && k.url.endsWith(".onnx"));
  } catch {
    return false;
  }
}
