type DailyReportCacheEntry = {
  expiresAt: number;
  value: unknown;
};

declare global {
  var __infinitumDailyReportCache__: Map<string, DailyReportCacheEntry> | undefined;
  var __infinitumDailyReportCacheInFlight__: Map<string, Promise<unknown>> | undefined;
}

const DAILY_REPORT_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_DAILY_REPORT_CACHE_ENTRIES = 100;

function getDailyReportCacheStore() {
  globalThis.__infinitumDailyReportCache__ ??= new Map<string, DailyReportCacheEntry>();
  return globalThis.__infinitumDailyReportCache__;
}

function getDailyReportInFlightStore() {
  globalThis.__infinitumDailyReportCacheInFlight__ ??= new Map<string, Promise<unknown>>();
  return globalThis.__infinitumDailyReportCacheInFlight__;
}

function isDailyReportCacheEnabled() {
  return process.env.NODE_ENV !== "test";
}

function pruneDailyReportCacheEntries(store: Map<string, DailyReportCacheEntry>) {
  while (store.size > MAX_DAILY_REPORT_CACHE_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (!oldestKey) return;
    store.delete(oldestKey);
  }
}

export async function withDailyReportCache<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = DAILY_REPORT_CACHE_TTL_MS,
): Promise<T> {
  if (!isDailyReportCacheEnabled()) {
    return loader();
  }

  const cacheStore = getDailyReportCacheStore();
  const inFlightStore = getDailyReportInFlightStore();
  const cachedEntry = cacheStore.get(key);

  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    cacheStore.delete(key);
    cacheStore.set(key, cachedEntry);
    return cachedEntry.value as T;
  }

  if (cachedEntry) {
    cacheStore.delete(key);
  }

  const inFlight = inFlightStore.get(key);
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  const nextValue = loader()
    .then((value) => {
      cacheStore.set(key, {
        expiresAt: Date.now() + ttlMs,
        value,
      });
      pruneDailyReportCacheEntries(cacheStore);
      return value;
    })
    .finally(() => {
      inFlightStore.delete(key);
    });

  inFlightStore.set(key, nextValue as Promise<unknown>);
  return nextValue;
}

export function invalidateDailyReportCache() {
  getDailyReportCacheStore().clear();
  getDailyReportInFlightStore().clear();
}
