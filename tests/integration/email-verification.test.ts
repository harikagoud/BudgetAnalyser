import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb } from './setup';
import { authenticateUser, EmailTakenError, registerUser } from '@/lib/auth/service';
import {
  findUnverifiedUser,
  appBaseUrl,
  signVerificationToken,
  verifyEmailToken,
} from '@/lib/auth/verification';
import { signPurposeToken, signToken } from '@/lib/auth/token';
import { EmailNotConfiguredError, sendEmail } from '@/lib/email/send';

describe('email verification', () => {
  let client: PrismaClient;
  let cleanup: () => Promise<void>;
  const env = { ...process.env };

  beforeAll(async () => {
    process.env.AUTH_SECRET = Buffer.alloc(32, 9).toString('base64');
    const db = await createTestDb();
    client = db.client;
    cleanup = db.cleanup;
  });
  afterAll(async () => {
    process.env = env;
    await cleanup();
  });
  beforeEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  it('new accounts start unverified, and login reports it (so the route can refuse a session)', async () => {
    const u = await registerUser(client, { email: 'new@example.com', password: 'a-long-password' });
    const row = await client.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.emailVerifiedAt).toBeNull();
    const auth = await authenticateUser(client, { email: 'new@example.com', password: 'a-long-password' });
    expect(auth?.emailVerified).toBe(false);
  });

  it('a valid token verifies the account; login then reports verified; repeating is harmless', async () => {
    const u = await registerUser(client, { email: 'v1@example.com', password: 'a-long-password' });
    const token = await signVerificationToken(u.id, undefined, client);
    expect(await verifyEmailToken(client, token)).toBe(true);
    const first = await client.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(first.emailVerifiedAt).not.toBeNull();
    expect(await verifyEmailToken(client, token)).toBe(true);
    const second = await client.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(second.emailVerifiedAt?.getTime()).toBe(first.emailVerifiedAt?.getTime());
    const auth = await authenticateUser(client, { email: 'v1@example.com', password: 'a-long-password' });
    expect(auth?.emailVerified).toBe(true);
  });

  it('rejects expired, garbage, session and unknown-user tokens without verifying anyone', async () => {
    const u = await registerUser(client, { email: 'v2@example.com', password: 'a-long-password' });
    expect(await verifyEmailToken(client, await signVerificationToken(u.id, -1000, client))).toBe(false);
    expect(await verifyEmailToken(client, 'garbage')).toBe(false);
    expect(await verifyEmailToken(client, await signToken(u.id))).toBe(false); // a session token
    // a well-formed, correctly signed token for a user that does not exist
    expect(await verifyEmailToken(client, await signPurposeToken('verify-email:0000000000000000', 'no-such-user', 60_000))).toBe(false);
    const row = await client.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.emailVerifiedAt).toBeNull();
  });

  it('re-registering an unverified address kills every earlier link; only the newest works', async () => {
    const first = await registerUser(client, { email: 'stale@example.com', password: 'first-password-1' });
    const l1 = await signVerificationToken(first.id, undefined, client);
    expect(await verifyEmailToken(client, l1)).toBe(true); // valid now (idempotent re-check below)
    await client.user.update({ where: { id: first.id }, data: { emailVerifiedAt: null } });

    await registerUser(client, { email: 'stale@example.com', password: 'second-password-1' });
    const l2 = await signVerificationToken(first.id, undefined, client);

    expect(await verifyEmailToken(client, l1)).toBe(false); // L1 predates the password change
    expect((await client.user.findUniqueOrThrow({ where: { id: first.id } })).emailVerifiedAt).toBeNull();
    expect(await verifyEmailToken(client, l2)).toBe(true);
    expect((await client.user.findUniqueOrThrow({ where: { id: first.id } })).emailVerifiedAt).not.toBeNull();
  });

  it('a link for one user cannot verify another, even with the uid swapped in the payload', async () => {
    const a = await registerUser(client, { email: 'ua@example.com', password: 'a-long-password' });
    const b = await registerUser(client, { email: 'ub@example.com', password: 'b-long-password' });
    const tokenA = await signVerificationToken(a.id, undefined, client);
    const [, sig] = tokenA.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ uid: b.id, exp: Date.now() + 1e6 })).toString('base64url');
    expect(await verifyEmailToken(client, `${forgedPayload}.${sig}`)).toBe(false);
    expect((await client.user.findUniqueOrThrow({ where: { id: b.id } })).emailVerifiedAt).toBeNull();
  });

  it('re-registering an UNVERIFIED email replaces the password (no squatting)', async () => {
    await registerUser(client, { email: 'squat@example.com', password: 'attacker-password' });
    await registerUser(client, { email: 'squat@example.com', password: 'owner-password-1' });
    expect(await authenticateUser(client, { email: 'squat@example.com', password: 'attacker-password' })).toBeNull();
    expect(await authenticateUser(client, { email: 'squat@example.com', password: 'owner-password-1' })).not.toBeNull();
    expect(await client.user.count({ where: { email: 'squat@example.com' } })).toBe(1);
  });

  it('re-registering a VERIFIED email is refused', async () => {
    const u = await registerUser(client, { email: 'taken@example.com', password: 'a-long-password' });
    await verifyEmailToken(client, await signVerificationToken(u.id, undefined, client));
    await expect(
      registerUser(client, { email: 'taken@example.com', password: 'other-password-1' }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  it('findUnverifiedUser: only existing, unverified accounts (case-insensitive)', async () => {
    const u = await registerUser(client, { email: 'resend@example.com', password: 'a-long-password' });
    expect(await findUnverifiedUser(client, 'RESEND@example.com')).toEqual({ id: u.id, email: 'resend@example.com' });
    expect(await findUnverifiedUser(client, 'nobody@example.com')).toBeNull();
    await verifyEmailToken(client, await signVerificationToken(u.id, undefined, client));
    expect(await findUnverifiedUser(client, 'resend@example.com')).toBeNull();
  });

  it('sending with no SMTP config is a no-op in dev but throws in production', async () => {
    const mail = { to: 'a@example.com', subject: 's', text: 't', html: '<p>t</p>' };
    await expect(sendEmail(mail)).resolves.toBeUndefined();
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    try {
      await expect(sendEmail(mail)).rejects.toBeInstanceOf(EmailNotConfiguredError);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev ?? 'test';
    }
  });

  it('link base comes from APP_URL (trailing slash trimmed); production without it is an error', () => {
    process.env.APP_URL = 'https://example.test/';
    expect(appBaseUrl()).toBe('https://example.test');
    delete process.env.APP_URL;
    expect(appBaseUrl()).toBe('http://127.0.0.1:3000'); // dev fallback
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    try {
      expect(() => appBaseUrl()).toThrow(/APP_URL/);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev ?? 'test';
    }
  });
});
