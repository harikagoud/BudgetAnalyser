import { prisma as defaultPrisma } from '@/lib/db/client';
import type { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import type { Credentials } from '@/lib/validation/auth';

export interface PublicUser {
  id: string;
  email: string;
}

/** What login learns about the account on top of the public fields. */
export interface AuthenticatedUser extends PublicUser {
  emailVerified: boolean;
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
  if (existing?.emailVerifiedAt) throw new EmailTakenError();

  const passwordHash = await hashPassword(password);
  if (existing) {
    // Still unverified: whoever registers again replaces the password. Otherwise
    // someone could squat an address with their own password and the real owner
    // would later verify an account the squatter can log into.
    const updated = await client.user.update({ where: { id: existing.id }, data: { passwordHash } });
    return { id: updated.id, email: updated.email };
  }
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

/** Returns the user on success; null for unknown email OR wrong password. */
export async function authenticateUser(
  client: PrismaClient = defaultPrisma,
  { email, password }: Credentials,
): Promise<AuthenticatedUser | null> {
  const user = await client.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) {
    await verifyPassword(password, await getDummyHash());
    return null;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? { id: user.id, email: user.email, emailVerified: user.emailVerifiedAt !== null } : null;
}
