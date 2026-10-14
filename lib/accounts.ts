import { prisma as defaultPrisma } from '@/lib/db/client';
import type { PrismaClient } from '@prisma/client';

/**
 * Returns the account only if it belongs to `userId`; null otherwise (missing
 * OR someone else's — callers must treat both as 404 so account ids can't be
 * probed across users).
 */
export async function getOwnedAccount(
  client: PrismaClient = defaultPrisma,
  userId: string,
  accountId: string,
) {
  return client.account.findFirst({ where: { id: accountId, userId } });
}
