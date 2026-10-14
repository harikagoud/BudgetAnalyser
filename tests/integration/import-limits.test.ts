import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb, createTestUser } from './setup';
import { importStatement } from '@/lib/import/importStatement';
import { ParseError } from '@/lib/parsers/csv';
import { MAX_IMPORT_ROWS, MAX_UPLOAD_BYTES } from '@/lib/import/limits';

function csvWithRows(n: number): string {
  const lines = ['Date,Description,Amount'];
  for (let i = 0; i < n; i++) lines.push(`2026-03-${String((i % 28) + 1).padStart(2, '0')},SHOP ${i},1.00`);
  return lines.join('\n');
}

describe('import limits', () => {
  let client: PrismaClient;
  let cleanup: () => Promise<void>;
  let userId: string;
  let accountId: string;

  beforeAll(async () => {
    const db = await createTestDb();
    client = db.client;
    cleanup = db.cleanup;
    userId = (await createTestUser(client)).id;
    accountId = (await client.account.create({ data: { name: 'L', type: 'MANUAL', userId } })).id;
  });
  afterAll(async () => {
    await cleanup(); // drops the schema and disconnects
  });

  it('exposes sane limits', () => {
    expect(MAX_UPLOAD_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_IMPORT_ROWS).toBe(20_000);
  });

  it('rejects a statement with more than MAX_IMPORT_ROWS rows, atomically (nothing persisted)', async () => {
    const err = await importStatement(
      { userId, accountId, fileName: 'big.csv', fileContent: csvWithRows(MAX_IMPORT_ROWS + 1), format: 'CSV' },
      client,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ParseError);
    expect((err as ParseError).code).toBe('TOO_MANY_ROWS');
    expect(await client.transaction.count({ where: { accountId } })).toBe(0);
    expect(await client.importBatch.count({ where: { accountId } })).toBe(0);
  });

  it('accepts a statement exactly at the cap', async () => {
    const result = await importStatement(
      { userId, accountId, fileName: 'ok.csv', fileContent: csvWithRows(MAX_IMPORT_ROWS), format: 'CSV' },
      client,
    );
    expect(result.transactionCount + result.duplicateCount).toBe(MAX_IMPORT_ROWS);
  }, 60_000);
});
