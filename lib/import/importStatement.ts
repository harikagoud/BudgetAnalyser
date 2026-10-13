import { prisma as defaultPrisma } from '@/lib/db/client';
import type { PrismaClient } from '@prisma/client';
import { parseCsv, ParseError } from '@/lib/parsers/csv';
import { parseOfx } from '@/lib/parsers/ofx';
import {
  categorizeFromRules,
  normalizeMerchant,
  type MerchantRuleLike,
} from '@/lib/categorization/engine';
import { computeDedupeKey } from '@/lib/dedupe';
import { logger } from '@/lib/logger';

export { ParseError };

export interface ImportParams {
  accountId: string;
  fileName: string;
  fileContent: string;
  format: 'CSV' | 'OFX';
}

export interface ImportResult {
  importBatchId: string;
  transactionCount: number;
  duplicateCount: number;
  errorCount: number;
  categories: Record<string, number>;
}

/**
 * Core import pipeline shared by the POST /api/import route and tests:
 * parse -> dedupe check -> categorize -> persist Transaction+ImportBatch
 * atomically (single Prisma transaction, no partial writes on failure).
 */
export async function importStatement(
  params: ImportParams,
  client: PrismaClient = defaultPrisma,
): Promise<ImportResult> {
  const rows =
    params.format === 'CSV' ? parseCsv(params.fileContent) : parseOfx(params.fileContent);

  const [rules, categories] = await Promise.all([
    client.merchantRule.findMany(),
    client.category.findMany(),
  ]);
  const uncategorized = categories.find((c) => c.name === 'Uncategorized');
  if (!uncategorized) {
    throw new Error('Uncategorized category not seeded. Run `npm run db:seed` first.');
  }
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const existingKeys = new Set(
    (
      await client.transaction.findMany({
        where: { accountId: params.accountId },
        select: { dedupeKey: true },
      })
    ).map((t) => t.dedupeKey),
  );

  const seenInFile = new Set<string>();
  const toCreate: Array<{
    date: Date;
    amount: number;
    merchantRaw: string;
    merchantNormalized: string;
    categoryId: string;
    categorySource: string;
    dedupeKey: string;
  }> = [];
  let duplicateCount = 0;
  const categoryCounts: Record<string, number> = {};

  for (const row of rows) {
    const dedupeKey = computeDedupeKey({
      date: row.date,
      amount: row.amount,
      accountId: params.accountId,
      merchantRaw: row.merchantRaw,
    });
    if (existingKeys.has(dedupeKey) || seenInFile.has(dedupeKey)) {
      duplicateCount += 1;
      continue;
    }
    seenInFile.add(dedupeKey);

    const merchantNormalized = normalizeMerchant(row.merchantRaw);
    const { categoryId, source } = categorizeFromRules(
      merchantNormalized,
      rules as MerchantRuleLike[],
      uncategorized.id,
    );
    const categoryName = categoryNameById.get(categoryId) ?? 'Uncategorized';
    categoryCounts[categoryName] = (categoryCounts[categoryName] ?? 0) + 1;

    toCreate.push({
      date: new Date(row.date),
      amount: row.amount,
      merchantRaw: row.merchantRaw,
      merchantNormalized,
      categoryId,
      categorySource: source === 'RULE' ? 'RULE' : 'DEFAULT',
      dedupeKey,
    });
  }

  const batch = await client.$transaction(async (tx) => {
    const created = await tx.importBatch.create({
      data: {
        accountId: params.accountId,
        fileName: params.fileName,
        format: params.format,
        transactionCount: toCreate.length,
        duplicateCount,
        errorCount: 0,
      },
    });
    if (toCreate.length > 0) {
      await tx.transaction.createMany({
        data: toCreate.map((row) => ({
          ...row,
          accountId: params.accountId,
          importBatchId: created.id,
        })),
      });
    }
    return created;
  });

  logger.info(
    {
      importBatchId: batch.id,
      accountId: params.accountId,
      transactionCount: toCreate.length,
      duplicateCount,
      categories: categoryCounts,
    },
    'Import completed',
  );

  return {
    importBatchId: batch.id,
    transactionCount: toCreate.length,
    duplicateCount,
    errorCount: 0,
    categories: categoryCounts,
  };
}
