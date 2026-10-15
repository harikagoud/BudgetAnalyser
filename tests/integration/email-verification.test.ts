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
import { signToken } from '@/lib/auth/token';
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
    const token = await signVerificationToken(u.id);
    expect(await verifyEmailToken(client, token, 'a-long-password')).toBe('OK');
    const first = await client.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(first.emailVerifiedAt).not.toBeNull();
    expect(await verifyEmailToken(client, token, 'a-long-password')).toBe('OK');
    const second = await client.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(second.emailVerifiedAt?.getTime()).toBe(first.emailVerifiedAt?.getTime());
    const auth = await authenticateUser(client, { email: 'v1@example.com', password: 'a-long-password' });
    expect(auth?.emailVerified).toBe(true);
  });

  it('rejects expired, garbage, session and unknown-user tokens without verifying anyone', async () => {
    const u = await registerUser(client, { email: 'v2@example.com', password: 'a-long-password' });
    expect(await verifyEmailToken(client, await signVerificationToken(u.id, -1000), 'a-long-password')).toBe('INVALID_TOKEN');
    expect(await verifyEmailToken(client, 'garbage', 'a-long-password')).toBe('INVALID_TOKEN');
    expect(await verifyEmailToken(client, await signToken(u.id), 'a-long-password')).toBe('INVALID_TOKEN'); // a session token
    expect(await verifyEmailToken(client, await signVerificationToken('no-such-user'), 'a-long-password')).toBe('INVALID_TOKEN');
    const row = await client.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.emailVerifiedAt).toBeNull();
  });

  it('a correct token with the WRONG password does not verify (squatter cannot get the victim to verify)', async () => {
    // Victim signs up with V and receives link L1; a squatter then re-registers the
    // same address with password A (replacing V), and the victim gets link L2.
    const victim = await registerUser(client, { email: 'victim@example.com', password: 'victim-password-1' });
    const l1 = await signVerificationToken(victim.id);
    await registerUser(client, { email: 'victim@example.com', password: 'attacker-password-1' });
    const l2 = await signVerificationToken(victim.id);

    expect(await verifyEmailToken(client, l1, 'victim-password-1')).toBe('BAD_PASSWORD');
    expect(await verifyEmailToken(client, l2, 'victim-password-1')).toBe('BAD_PASSWORD');
    const row = await client.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(row.emailVerifiedAt).toBeNull(); // the victim clicking a link never activates the attacker's account

    // The victim recovers by signing up again with their own password: only that account can be verified.
    await registerUser(client, { email: 'victim@example.com', password: 'victim-password-1' });
    expect(await verifyEmailToken(client, await signVerificationToken(victim.id), 'victim-password-1')).toBe('OK');
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
    await verifyEmailToken(client, await signVerificationToken(u.id), 'a-long-password');
    await expect(
      registerUser(client, { email: 'taken@example.com', password: 'other-password-1' }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  it('findUnverifiedUser: only existing, unverified accounts (case-insensitive)', async () => {
    const u = await registerUser(client, { email: 'resend@example.com', password: 'a-long-password' });
    expect(await findUnverifiedUser(client, 'RESEND@example.com')).toEqual({ id: u.id, email: 'resend@example.com' });
    expect(await findUnverifiedUser(client, 'nobody@example.com')).toBeNull();
    await verifyEmailToken(client, await signVerificationToken(u.id), 'a-long-password');
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
