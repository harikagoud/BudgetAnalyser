import { describe, expect, it } from 'vitest';
import { isCronAuthorized } from '@/lib/plaid/cron-auth';

const SECRET = 'a-long-enough-cron-secret-123';

describe('isCronAuthorized', () => {
  it('accepts the exact bearer secret', () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });
  it('rejects missing, wrong, partial and differently-cased headers', () => {
    expect(isCronAuthorized(null, SECRET)).toBe(false);
    expect(isCronAuthorized('Bearer nope', SECRET)).toBe(false);
    expect(isCronAuthorized(SECRET, SECRET)).toBe(false);
    expect(isCronAuthorized(`bearer ${SECRET}`, SECRET)).toBe(false);
    expect(isCronAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
  });
  it('fails closed when the secret is unset or too short', () => {
    expect(isCronAuthorized('Bearer ', '')).toBe(false);
    expect(isCronAuthorized('Bearer short', 'short')).toBe(false);
    expect(isCronAuthorized(`Bearer ${SECRET}`, undefined)).toBe(false);
  });
});
