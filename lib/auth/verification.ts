import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/client';
import { peekTokenUserId, signPurposeToken, verifyPurposeToken } from '@/lib/auth/token';
import { sendEmail } from '@/lib/email/send';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

const PURPOSE = 'verify-email';

/**
 * The link's signing purpose includes a fingerprint of the account's current
 * password hash. Registering again for a still-unverified address replaces the
 * password, which makes every link sent before that stop working.
 */
function purposeFor(passwordHash: string): string {
  return `${PURPOSE}:${crypto.createHash('sha256').update(passwordHash).digest('hex').slice(0, 16)}`;
}
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

/** Base URL for links in emails. Never derived from request headers (Host-header spoofing). */
export function appBaseUrl(): string {
  const configured = process.env.APP_URL?.replace(/\/+$/, '');
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('APP_URL is not set (e.g. https://your-app.vercel.app).');
  }
  return 'http://127.0.0.1:3000';
}

export async function signVerificationToken(
  userId: string,
  ttlMs: number = VERIFY_TTL_MS,
  client: PrismaClient = defaultPrisma,
): Promise<string> {
  const user = await client.user.findUniqueOrThrow({ where: { id: userId } });
  return signPurposeToken(purposeFor(user.passwordHash), userId, ttlMs);
}

export async function sendVerificationEmail(
  user: { id: string; email: string },
  client: PrismaClient = defaultPrisma,
): Promise<void> {
  const token = await signVerificationToken(user.id, VERIFY_TTL_MS, client);
  const url = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_HOST) {
    logger.info({ to: user.email, verifyUrl: url }, 'DEV ONLY: verification link');
  }
  await sendEmail({
    to: user.email,
    subject: 'Verify your Budget Analyser email',
    text: `Confirm your email to finish creating your account:\n\n${url}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this email.`,
    html: `<p>Confirm your email to finish creating your Budget Analyser account:</p><p><a href="${url}">Verify my email</a></p><p>This link expires in 24 hours. If you didn't sign up, ignore this email.</p>`,
  });
}

/**
 * True when the token is valid for this account's CURRENT password and the
 * account is (now or already) verified. Idempotent. Links sent before the
 * password was replaced (by a later sign-up for the same address) are rejected.
 */
export async function verifyEmailToken(
  client: PrismaClient = defaultPrisma,
  token: string,
): Promise<boolean> {
  const uid = peekTokenUserId(token);
  if (!uid) return false;
  const user = await client.user.findUnique({ where: { id: uid } });
  if (!user) return false;
  const decoded = await verifyPurposeToken(purposeFor(user.passwordHash), token);
  if (!decoded || decoded.userId !== user.id) return false;
  if (!user.emailVerifiedAt) {
    await client.user.updateMany({
      where: { id: user.id, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }
  return true;
}

/** The user to (re)send a verification email to: exists AND not yet verified; else null. */
export async function findUnverifiedUser(
  client: PrismaClient = defaultPrisma,
  email: string,
): Promise<{ id: string; email: string } | null> {
  const user = await client.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || user.emailVerifiedAt) return null;
  return { id: user.id, email: user.email };
}
