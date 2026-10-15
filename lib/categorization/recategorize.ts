import { prisma as defaultPrisma } from '@/lib/db/client';
import type { PrismaClient } from '@prisma/client';
import { categorizeFromRules, loadRulesForUser, normalizeMerchant } from '@/lib/categorization/engine';

export interface RecategorizeResult {
  scanned: number;
  changed: number;
}

/**
 * Re-runs the current rules over this user's already-imported transactions.
 * Rows the user categorized by hand (USER_OVERRIDE) are never touched, and only
 * the caller's own rows are read, so this is safe and idempotent.
 */
export async function recategorizeUserTransactions(
  userId: string,
  client: PrismaClient = defaultPrisma,
): Promise<RecategorizeResult> {
  const [rules, uncategorized, transactions] = await Promise.all([
    loadRulesForUser(userId, client),
    client.category.findUnique({ where: { name: 'Uncategorized' } }),
    client.transaction.findMany({
      where: { account: { userId }, categorySource: { not: 'USER_OVERRIDE' } },
      select: { id: true, merchantRaw: true, categoryId: true, categorySource: true },
    }),
  ]);
  if (!uncategorized) throw new Error('Uncategorized category not seeded. Run `npm run db:seed` first.');

  const updates: Array<{ id: string; categoryId: string; categorySource: string }> = [];
  for (const t of transactions) {
    const { categoryId, source } = categorizeFromRules(normalizeMerchant(t.merchantRaw), rules, uncategorized.id);
    const categorySource = source === 'RULE' ? 'RULE' : 'DEFAULT';
    if (categoryId !== t.categoryId || categorySource !== t.categorySource) {
      updates.push({ id: t.id, categoryId, categorySource });
    }
  }

  const CHUNK = 100;
  for (let i = 0; i < updates.length; i += CHUNK) {
    await client.$transaction(
      updates
        .slice(i, i + CHUNK)
        .map((u) =>
          client.transaction.update({
            where: { id: u.id },
            data: { categoryId: u.categoryId, categorySource: u.categorySource },
          }),
        ),
    );
  }

  return { scanned: transactions.length, changed: updates.length };
}
