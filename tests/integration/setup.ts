import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { seedDefaults } from '@/lib/db/seed-defaults';

/**
 * Creates a fresh, isolated SQLite database for an integration test run:
 * a temp file, schema pushed via `prisma db push`, then seeded with the
 * same default Categories/MerchantRules as dev (lib/db/seed-defaults.ts).
 * Keeps integration tests from ever touching the real dev.db.
 */
export async function createTestDb(): Promise<{ client: PrismaClient; cleanup: () => void }> {
  const dbPath = path.join(os.tmpdir(), `budget-analyser-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const url = `file:${dbPath}`;

  execSync('npx prisma db push --skip-generate', {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  const client = new PrismaClient({ datasources: { db: { url } } });
  await seedDefaults(client);

  const cleanup = () => {
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-journal`, { force: true });
  };

  return { client, cleanup };
}
