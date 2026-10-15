import { prisma as defaultPrisma } from '@/lib/db/client';
import type { PrismaClient } from '@prisma/client';
import { upsertUserRule } from '@/lib/categorization/engine';
import { recategorizeUserTransactions } from '@/lib/categorization/recategorize';

export interface LearnResult {
  transaction: {
    id: string;
    date: string;
    amount: number;
    merchantRaw: string;
    category: { id: string; name: string };
    categorySource: string;
  } | null;
  /** Other transactions (same merchant) moved by the newly learned rule. */
  alsoUpdated: number;
}

/**
 * The user picked a category for one transaction: mark it as a manual choice, remember the
 * merchant (USER rule), and move the user's other not-manually-set transactions that the
 * rule now matches. Returns null transaction when it is not the caller's.
 */
export async function applyUserCategoryChoice(
  userId: string,
  transactionId: string,
  categoryId: string,
  client: PrismaClient = defaultPrisma,
): Promise<LearnResult> {
  const existing = await client.transaction.findFirst({
    where: { id: transactionId, account: { userId } },
  });
  if (!existing) return { transaction: null, alsoUpdated: 0 };

  const updated = await client.transaction.update({
    where: { id: transactionId },
    data: { categoryId, categorySource: 'USER_OVERRIDE' },
    include: { category: { select: { id: true, name: true } } },
  });
  await upsertUserRule(existing.merchantRaw, categoryId, userId, client);
  const { changed } = await recategorizeUserTransactions(userId, client);

  return {
    transaction: {
      id: updated.id,
      date: updated.date.toISOString().slice(0, 10),
      amount: updated.amount,
      merchantRaw: updated.merchantRaw,
      category: updated.category,
      categorySource: updated.categorySource,
    },
    alsoUpdated: changed,
  };
}
