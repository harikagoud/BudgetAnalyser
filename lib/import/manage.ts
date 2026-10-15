import { prisma as defaultPrisma } from '@/lib/db/client';
import type { PrismaClient } from '@prisma/client';

export interface ImportListItem {
  id: string;
  fileName: string;
  format: string;
  accountId: string;
  accountName: string;
  createdAt: string;
  /** Transactions this upload added that are still in the database (live count). */
  transactionCount: number;
}

export async function listImportsForUser(
  userId: string,
  client: PrismaClient = defaultPrisma,
): Promise<ImportListItem[]> {
  const batches = await client.importBatch.findMany({
    where: { account: { userId } },
    orderBy: { createdAt: 'desc' },
    include: { account: { select: { name: true } }, _count: { select: { transactions: true } } },
  });
  return batches.map((b) => ({
    id: b.id,
    fileName: b.fileName,
    format: b.format,
    accountId: b.accountId,
    accountName: b.account.name,
    createdAt: b.createdAt.toISOString(),
    transactionCount: b._count.transactions,
  }));
}

/**
 * Removes one uploaded statement and the transactions it added. Rows that a later, overlapping
 * upload skipped as duplicates belong to this (earlier) batch, so they go too — the UI says so.
 * Returns null when the batch is not the caller's (reported as 404).
 */
export async function deleteImportBatch(
  userId: string,
  batchId: string,
  client: PrismaClient = defaultPrisma,
): Promise<{ deletedTransactions: number } | null> {
  const batch = await client.importBatch.findFirst({
    where: { id: batchId, account: { userId } },
    select: { id: true },
  });
  if (!batch) return null;
  // Transactions first: their importBatchId is optional, so deleting the batch alone would
  // leave the rows behind, still counted in every total.
  const [deleted] = await client.$transaction([
    client.transaction.deleteMany({ where: { importBatchId: batch.id } }),
    client.importBatch.delete({ where: { id: batch.id } }),
  ]);
  return { deletedTransactions: deleted.count };
}

export type DeleteAccountOutcome =
  | { status: 'DELETED'; deletedTransactions: number }
  | { status: 'NOT_FOUND' }
  | { status: 'IS_LINKED' };

/** Deletes an uploaded (non-linked) account with all its transactions and uploads. */
export async function deleteManualAccount(
  userId: string,
  accountId: string,
  client: PrismaClient = defaultPrisma,
): Promise<DeleteAccountOutcome> {
  const account = await client.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true, type: true },
  });
  if (!account) return { status: 'NOT_FOUND' };
  // A linked bank connection must be disconnected (revoked at Plaid) first, so that rule lives
  // in one place and a live connection can never be orphaned by a delete.
  if (account.type === 'PLAID') return { status: 'IS_LINKED' };
  const [deleted] = await client.$transaction([
    client.transaction.deleteMany({ where: { accountId: account.id } }),
    client.importBatch.deleteMany({ where: { accountId: account.id } }),
    client.account.delete({ where: { id: account.id } }),
  ]);
  return { status: 'DELETED', deletedTransactions: deleted.count };
}
