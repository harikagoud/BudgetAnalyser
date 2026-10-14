import { execSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { seedDefaults } from '@/lib/db/seed-defaults';

/**
 * Creates a fresh, isolated Postgres schema for an integration test run:
 * a random schema inside TEST_DATABASE_URL, tables pushed via `prisma db push`,
 * then seeded with the same default Categories/MerchantRules as dev
 * (lib/db/seed-defaults.ts). Keeps integration tests from ever touching dev data.
 * cleanup() drops the schema.
 */
export async function createTestDb(): Promise<{ client: PrismaClient; cleanup: () => Promise<void> }> {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Point it at a local Postgres (see .env.example); it is never your dev/prod DB.',
    );
  }
  const schema = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const url = `${base}${base.includes('?') ? '&' : '?'}schema=${schema}`;

  execSync('npx prisma db push --skip-generate', {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: 'pipe',
  });

  const client = new PrismaClient({ datasources: { db: { url } } });
  await seedDefaults(client);

  const cleanup = async () => {
    await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.$disconnect();
  };

  return { client, cleanup };
}

let userCounter = 0;

/** Creates a throwaway user (accounts now require an owner). Skips password hashing cost. */
export async function createTestUser(client: PrismaClient): Promise<{ id: string }> {
  userCounter += 1;
  const user = await client.user.create({
    data: { email: `test-${userCounter}-${Date.now()}@example.com`, passwordHash: 'not-a-real-hash' },
  });
  return { id: user.id };
}
