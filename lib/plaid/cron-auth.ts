import crypto from 'crypto';

/**
 * The cron endpoint is public to the middleware (Vercel Cron has no user session) and
 * protected by a shared secret instead. Fails closed: no/short CRON_SECRET = nobody gets in.
 */
export function isCronAuthorized(authorizationHeader: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || secret.length < 16) return false;
  if (!authorizationHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorizationHeader);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
