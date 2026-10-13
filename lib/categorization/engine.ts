import { prisma as defaultPrisma } from '@/lib/db/client';
import type { PrismaClient } from '@prisma/client';

export interface MerchantRuleLike {
  pattern: string;
  categoryId: string;
  source: 'SEED' | 'USER';
}

export interface CategorizeResult {
  categoryId: string;
  source: 'RULE' | 'DEFAULT';
}

/** Lowercases and trims a raw merchant description for rule matching. */
export function normalizeMerchant(merchantRaw: string): string {
  return merchantRaw.trim().toLowerCase();
}

/**
 * Pure categorization logic, independent of persistence, so it is directly
 * unit-testable (Constitution Principle II). USER rules always take
 * precedence over SEED rules for the same merchant.
 */
export function categorizeFromRules(
  merchantNormalized: string,
  rules: MerchantRuleLike[],
  uncategorizedCategoryId: string,
): CategorizeResult {
  const userMatch = rules.find(
    (r) => r.source === 'USER' && merchantNormalized.includes(r.pattern),
  );
  if (userMatch) {
    return { categoryId: userMatch.categoryId, source: 'RULE' };
  }
  const seedMatch = rules.find(
    (r) => r.source === 'SEED' && merchantNormalized.includes(r.pattern),
  );
  if (seedMatch) {
    return { categoryId: seedMatch.categoryId, source: 'RULE' };
  }
  return { categoryId: uncategorizedCategoryId, source: 'DEFAULT' };
}

async function getUncategorizedCategoryId(client: PrismaClient): Promise<string> {
  const category = await client.category.upsert({
    where: { name: 'Uncategorized' },
    update: {},
    create: { name: 'Uncategorized', isDiscretionary: false, isDefault: true },
  });
  return category.id;
}

/** DB-backed categorize: loads all merchant rules and applies the pure logic above. */
export async function categorize(
  merchantRaw: string,
  client: PrismaClient = defaultPrisma,
): Promise<CategorizeResult> {
  const merchantNormalized = normalizeMerchant(merchantRaw);
  const [rules, uncategorizedId] = await Promise.all([
    client.merchantRule.findMany(),
    getUncategorizedCategoryId(client),
  ]);
  return categorizeFromRules(merchantNormalized, rules as MerchantRuleLike[], uncategorizedId);
}

/**
 * Records a manual recategorization as a USER rule for this merchant, so
 * future imports of the same merchant auto-categorize the same way (FR-004).
 */
export async function upsertUserRule(
  merchantRaw: string,
  categoryId: string,
  client: PrismaClient = defaultPrisma,
): Promise<void> {
  const pattern = normalizeMerchant(merchantRaw);
  await client.merchantRule.upsert({
    where: { pattern_source: { pattern, source: 'USER' } },
    update: { categoryId },
    create: { pattern, categoryId, source: 'USER' },
  });
}
