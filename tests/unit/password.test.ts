import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { validateCredentials } from '@/lib/validation/auth';

describe('password hashing (scrypt)', () => {
  it('never stores the plaintext and verifies the right password', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).not.toContain('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('wrong password!!', hash)).toBe(false);
  });

  it('uses a per-hash random salt (same password -> different hash)', async () => {
    const a = await hashPassword('same-password-1');
    const b = await hashPassword('same-password-1');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same-password-1', a)).toBe(true);
    expect(await verifyPassword('same-password-1', b)).toBe(true);
  });

  it('returns false (does not throw) for a malformed stored hash', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', '')).toBe(false);
  });
});

describe('credential validation', () => {
  it('normalizes the email (trim + lowercase)', () => {
    const r = validateCredentials({ email: '  Hari@Example.COM ', password: 'longenough1' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('hari@example.com');
  });

  it('rejects an invalid email', () => {
    expect(validateCredentials({ email: 'not-an-email', password: 'longenough1' }).success).toBe(false);
  });

  it('rejects passwords shorter than 8 characters', () => {
    expect(validateCredentials({ email: 'a@b.co', password: 'short' }).success).toBe(false);
  });

  it('rejects absurdly long passwords (hashing-DoS guard)', () => {
    expect(validateCredentials({ email: 'a@b.co', password: 'x'.repeat(129) }).success).toBe(false);
  });
});
