import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/client';
import { signPurposeToken, verifyPurposeToken } from '@/lib/auth/token';
import { sendEmail } from '@/lib/email/send';
import { verifyPassword } from '@/lib/auth/password';
import { logger } from '@/lib/logger';

const PURPOSE = 'verify-email';
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

export function signVerificationToken(userId: string, ttlMs: number = VERIFY_TTL_MS): Promise<string> {
  return signPurposeToken(PURPOSE, userId, ttlMs);
}

export async function sendVerificationEmail(user: { id: string; email: string }): Promise<void> {
  const url = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(await signVerificationToken(user.id))}`;
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

export type VerifyOutcome = 'OK' | 'INVALID_TOKEN' | 'BAD_PASSWORD';

/**
 * Verifies the account when the token is valid AND the caller proves they know
 * the account's current password. The password check is what stops a squatter:
 * someone who registers a victim's address with their own password cannot get
 * the victim to "verify" it, because the victim doesn't know that password
 * (and the squatter can't read the victim's mailbox to use the link).
 * Idempotent for an already-verified account.
 */
export async function verifyEmailToken(
  client: PrismaClient = defaultPrisma,
  token: string,
  password: string,
): Promise<VerifyOutcome> {
  const decoded = await verifyPurposeToken(PURPOSE, token);
  if (!decoded) return 'INVALID_TOKEN';
  const user = await client.user.findUnique({ where: { id: decoded.userId } });
  if (!user) return 'INVALID_TOKEN';
  if (!(await verifyPassword(password, user.passwordHash))) return 'BAD_PASSWORD';
  if (!user.emailVerifiedAt) {
    await client.user.updateMany({
      where: { id: user.id, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }
  return 'OK';
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
