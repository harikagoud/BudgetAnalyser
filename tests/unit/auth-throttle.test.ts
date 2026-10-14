import { describe, expect, it } from 'vitest';
import { createThrottle } from '@/lib/auth/throttle';

describe('login throttle', () => {
  it('allows up to the limit of failures, then blocks', () => {
    const now = 0;
    const t = createThrottle({ maxFailures: 3, windowMs: 1000, now: () => now });
    for (let i = 0; i < 3; i++) {
      expect(t.isBlocked('k')).toBe(false);
      t.recordFailure('k');
    }
    expect(t.isBlocked('k')).toBe(true);
  });

  it('is keyed: one key being blocked does not block another', () => {
    const t = createThrottle({ maxFailures: 1, windowMs: 1000, now: () => 0 });
    t.recordFailure('a');
    expect(t.isBlocked('a')).toBe(true);
    expect(t.isBlocked('b')).toBe(false);
  });

  it('unblocks after the window elapses', () => {
    let now = 0;
    const t = createThrottle({ maxFailures: 1, windowMs: 1000, now: () => now });
    t.recordFailure('k');
    expect(t.isBlocked('k')).toBe(true);
    now = 1001;
    expect(t.isBlocked('k')).toBe(false);
  });

  it('a success clears the failure count', () => {
    const t = createThrottle({ maxFailures: 2, windowMs: 1000, now: () => 0 });
    t.recordFailure('k');
    t.reset('k');
    t.recordFailure('k');
    expect(t.isBlocked('k')).toBe(false);
  });
});
