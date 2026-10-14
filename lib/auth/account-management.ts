import { prisma as defaultPrisma } from '@/lib/db/client';
import type { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

export class InvalidPasswordError extends Error {
  constructor() {
    super('The password is incorrect.');
    this.name = 'InvalidPasswordError';
  }
}

async function requireCurrentPassword(
  client: PrismaClient,
  userId: string,
  password: string,
): Promise<void> {
  const user = await client.user.findUnique({ where: { id: userId } });
  // A missing user (already deleted) is reported the same as a wrong password.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new InvalidPasswordError();
  }
}

/**
 * Callers validate `newPassword` length (lib/validation/auth.ts). NOTE: tokens
 * are stateless, so sessions issued before the change stay valid until they
 * expire (7 days) or AUTH_SECRET is rotated — this cannot revoke them.
 */
export async function changePassword(
  client: PrismaClient = defaultPrisma,
  userId: string,
  { currentPassword, newPassword }: { currentPassword: string; newPassword: string },
): Promise<void> {
  await requireCurrentPassword(client, userId, currentPassword);
  const passwordHash = await hashPassword(newPassword);
  await client.user.update({ where: { id: userId }, data: { passwordHash } });
}

/**
 * Permanently deletes the user and everything they own, in one transaction.
 * Transactions/ImportBatches reference Account without ON DELETE CASCADE, so
 * they are removed explicitly first; UserSetting and USER MerchantRules go
 * with the User via cascade. Global Categories and SEED rules are untouched.
 */
export async function deleteAccount(
  client: PrismaClient = defaultPrisma,
  userId: string,
  { password }: { password: string },
): Promise<void> {
  await requireCurrentPassword(client, userId, password);
  await client.$transaction([
    client.transaction.deleteMany({ where: { account: { userId } } }),
    client.importBatch.deleteMany({ where: { account: { userId } } }),
    client.account.deleteMany({ where: { userId } }),
    client.user.delete({ where: { id: userId } }),
  ]);
}
