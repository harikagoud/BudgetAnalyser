import { prisma as defaultPrisma } from '@/lib/db/client';
import type { PrismaClient } from '@prisma/client';
import { ParseError } from '@/lib/parsers/csv';
import { MAX_IMPORT_ROWS } from '@/lib/import/limits';
import type { ImportFormat } from '@/lib/import/formats';
import { parseStatementFile } from '@/lib/parsers';
import {
  categorizeFromRules,
  loadRulesForUser,
  normalizeMerchant,
} from '@/lib/categorization/engine';
import { computeDedupeKey } from '@/lib/dedupe';
import { logger } from '@/lib/logger';

export { ParseError };

export interface ImportParams {
  userId: string;
  accountId: string;
  fileName: string;
  /** Decoded text (text formats). Alternatively pass `fileBytes`. */
  fileContent?: string;
  /** Raw file bytes; required for XLSX and PDF. */
  fileBytes?: Uint8Array;
  format: ImportFormat;
}

export interface ImportResult {
  importBatchId: string;
  transactionCount: number;
  duplicateCount: number;
  /** Lines that looked like transactions but could not be read (PDF only). */
  errorCount: number;
  categories: Record<string, number>;
  /** How the file was interpreted, e.g. an automatic sign flip or a best-effort warning. */
  notes: string[];
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
  const { rows, notes, skipped } = await parseStatementFile({
    format: params.format,
    text: params.fileContent,
    bytes: params.fileBytes,
  });

  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ParseError(
      'TOO_MANY_ROWS',
      `This statement has ${rows.length} rows; the limit is ${MAX_IMPORT_ROWS}. Split it into smaller files.`,
    );
  }

  const [rules, categories] = await Promise.all([
    loadRulesForUser(params.userId, client),
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
      rules,
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
        errorCount: skipped,
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
  }, { timeout: 20_000 }); // default 5 s is tight for 20k rows over a hosted-DB network hop

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
    errorCount: skipped,
    categories: categoryCounts,
    notes,
  };
}
