import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb } from './setup';
import { authenticateUser, EmailTakenError, registerUser } from '@/lib/auth/service';

describe('auth service (register / authenticate)', () => {
  let client: PrismaClient;
  let cleanup: () => void;

  beforeAll(async () => {
    const db = await createTestDb();
    client = db.client;
    cleanup = db.cleanup;
  });
  afterAll(async () => {
    await client.$disconnect();
    cleanup();
  });

  it('registers a user: stores a hash (never the plaintext) and lowercases the email', async () => {
    const user = await registerUser(client, { email: 'Hari@Example.com', password: 'a-long-password' });
    expect(user.email).toBe('hari@example.com');
    expect(user).not.toHaveProperty('passwordHash');

    const row = await client.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordHash).not.toContain('a-long-password');
    expect(row.passwordHash.startsWith('scrypt$')).toBe(true);
  });

  it('rejects a duplicate email (case-insensitively)', async () => {
    await registerUser(client, { email: 'dup@example.com', password: 'a-long-password' });
    await expect(
      registerUser(client, { email: 'DUP@example.com', password: 'another-password' }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  it('authenticates the right password and returns the public user', async () => {
    const created = await registerUser(client, { email: 'login@example.com', password: 'right-password' });
    const user = await authenticateUser(client, { email: 'LOGIN@example.com', password: 'right-password' });
    expect(user).toEqual({ id: created.id, email: 'login@example.com' });
  });

  it('returns null for a wrong password and for an unknown email (indistinguishable)', async () => {
    await registerUser(client, { email: 'who@example.com', password: 'right-password' });
    expect(await authenticateUser(client, { email: 'who@example.com', password: 'wrong-password' })).toBeNull();
    expect(await authenticateUser(client, { email: 'nobody@example.com', password: 'right-password' })).toBeNull();
  });
});
