import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signPurposeToken, signToken, verifyPurposeToken, verifyToken } from '@/lib/auth/token';

const SECRET_A = Buffer.alloc(32, 1).toString('base64');
const SECRET_B = Buffer.alloc(32, 2).toString('base64');

describe('signed session token', () => {
  const original = process.env.AUTH_SECRET;
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET_A;
  });
  afterEach(() => {
    process.env.AUTH_SECRET = original;
  });

  it('round-trips the user id', async () => {
    const token = await signToken('user_123');
    expect(await verifyToken(token)).toEqual({ userId: 'user_123' });
  });

  it('rejects a tampered payload', async () => {
    const token = await signToken('user_123');
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ uid: 'someone_else', exp: Date.now() + 1e6 })).toString('base64url');
    expect(payload).not.toBe(forged);
    expect(await verifyToken(`${forged}.${sig}`)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signToken('user_123');
    process.env.AUTH_SECRET = SECRET_B;
    expect(await verifyToken(token)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signToken('user_123', -1000);
    expect(await verifyToken(token)).toBeNull();
  });

  it('returns null for malformed input instead of throwing', async () => {
    expect(await verifyToken('')).toBeNull();
    expect(await verifyToken('garbage')).toBeNull();
    expect(await verifyToken('a.b.c')).toBeNull();
    expect(await verifyToken('!!!.???')).toBeNull();
  });

  it('fails loudly when AUTH_SECRET is missing or too short (never signs with a weak/empty key)', async () => {
    delete process.env.AUTH_SECRET;
    await expect(signToken('u')).rejects.toThrow(/AUTH_SECRET/);
    process.env.AUTH_SECRET = Buffer.alloc(8, 1).toString('base64');
    await expect(signToken('u')).rejects.toThrow(/AUTH_SECRET/);
  });
});

describe('purpose-bound tokens (email links)', () => {
  const original = process.env.AUTH_SECRET;
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET_A;
  });
  afterEach(() => {
    process.env.AUTH_SECRET = original;
  });

  it('round-trips for the same purpose', async () => {
    const token = await signPurposeToken('verify-email', 'user_1', 60_000);
    expect(await verifyPurposeToken('verify-email', token)).toEqual({ userId: 'user_1' });
  });

  it('an email-link token can NOT be used as a session token', async () => {
    const token = await signPurposeToken('verify-email', 'user_1', 60_000);
    expect(await verifyToken(token)).toBeNull();
  });

  it('a session token can NOT be used as an email-link token', async () => {
    const token = await signToken('user_1');
    expect(await verifyPurposeToken('verify-email', token)).toBeNull();
  });

  it('a token for one purpose is rejected for another', async () => {
    const token = await signPurposeToken('verify-email', 'user_1', 60_000);
    expect(await verifyPurposeToken('reset-password', token)).toBeNull();
  });

  it('rejects an expired purpose token', async () => {
    const token = await signPurposeToken('verify-email', 'user_1', -1000);
    expect(await verifyPurposeToken('verify-email', token)).toBeNull();
  });
});
