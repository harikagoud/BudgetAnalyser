import { describe, expect, it } from 'vitest';
import { createThrottle } from '@/lib/auth/throttle';

// Registration reuses the same throttle with a stricter, per-IP policy; this
// pins that the helper supports counting *attempts* (not only failures) by
// recording one per request and never resetting on success.
describe('registration throttle policy', () => {
  it('blocks the (N+1)th registration from one IP within the window, not other IPs', () => {
    const now = 0;
    const t = createThrottle({ maxFailures: 3, windowMs: 60_000, now: () => now });
    for (let i = 0; i < 3; i++) {
      expect(t.isBlocked('1.1.1.1')).toBe(false);
      t.recordFailure('1.1.1.1');
    }
    expect(t.isBlocked('1.1.1.1')).toBe(true);
    expect(t.isBlocked('2.2.2.2')).toBe(false);
  });
});
