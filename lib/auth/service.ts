import { prisma as defaultPrisma } from '@/lib/db/client';
import type { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import type { Credentials } from '@/lib/validation/auth';

export interface PublicUser {
  id: string;
  email: string;
}

export class EmailTakenError extends Error {
  constructor() {
    super('An account with that email already exists.');
    this.name = 'EmailTakenError';
  }
}

/** Callers pass already-validated/normalized credentials (see lib/validation/auth.ts). */
export async function registerUser(
  client: PrismaClient = defaultPrisma,
  { email, password }: Credentials,
): Promise<PublicUser> {
  const normalized = email.trim().toLowerCase();
  const existing = await client.user.findUnique({ where: { email: normalized } });
  if (existing) throw new EmailTakenError();

  const passwordHash = await hashPassword(password);
  try {
    const user = await client.user.create({ data: { email: normalized, passwordHash } });
    return { id: user.id, email: user.email };
  } catch (err) {
    // Lost a race with a concurrent registration for the same email.
    if ((err as { code?: string }).code === 'P2002') throw new EmailTakenError();
    throw err;
  }
}

// Verified against when the email is unknown so "no such user" and "wrong
// password" cost the same scrypt time (no user-enumeration timing signal).
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('dummy-password-for-timing');
  return dummyHashPromise;
}

/** Returns the public user on success; null for unknown email OR wrong password. */
export async function authenticateUser(
  client: PrismaClient = defaultPrisma,
  { email, password }: Credentials,
): Promise<PublicUser | null> {
  const user = await client.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) {
    await verifyPassword(password, await getDummyHash());
    return null;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? { id: user.id, email: user.email } : null;
}
