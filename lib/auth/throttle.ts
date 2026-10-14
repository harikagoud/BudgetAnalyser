export interface Throttle {
  isBlocked(key: string): boolean;
  recordFailure(key: string): void;
  reset(key: string): void;
}

/**
 * In-memory failed-login throttle. Per-process only (resets on restart and is
 * not shared across server instances) — a speed bump against online password
 * guessing, not a substitute for a shared limiter once the backend is scaled
 * out.
 */
export function createThrottle(
  opts: { maxFailures?: number; windowMs?: number; now?: () => number } = {},
): Throttle {
  const maxFailures = opts.maxFailures ?? 5;
  const windowMs = opts.windowMs ?? 15 * 60 * 1000;
  const now = opts.now ?? Date.now;
  const failures = new Map<string, { count: number; firstAt: number }>();

  function current(key: string) {
    const entry = failures.get(key);
    if (entry && now() - entry.firstAt >= windowMs) {
      failures.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    isBlocked(key) {
      const entry = current(key);
      return !!entry && entry.count >= maxFailures;
    },
    recordFailure(key) {
      const entry = current(key);
      if (entry) entry.count += 1;
      else failures.set(key, { count: 1, firstAt: now() });
    },
    reset(key) {
      failures.delete(key);
    },
  };
}
