type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

export function cachedFor<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) {
    return existing.value;
  }

  const value = loader().catch((error) => {
    const current = cache.get(key);
    if (current?.value === value) {
      cache.delete(key);
    }
    throw error;
  });

  cache.set(key, {
    expiresAt: now + ttlMs,
    value
  });

  return value;
}

export function stableCacheKey(prefix: string, input: Record<string, unknown> = {}) {
  const normalized = Object.keys(input)
    .sort()
    .map((key) => [key, input[key]]);
  return `${prefix}:${JSON.stringify(normalized)}`;
}
