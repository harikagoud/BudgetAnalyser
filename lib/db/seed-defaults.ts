import type { PrismaClient } from '@prisma/client';
import { DEFAULT_CATEGORIES, SEED_MERCHANT_RULES } from '@/lib/categorization/rules';

/**
 * Seeds default Categories and SEED MerchantRules into the given Prisma
 * client. Shared by prisma/seed.ts (dev DB) and integration test setup
 * (ephemeral test DB), so both stay in sync with the single source of
 * truth in lib/categorization/rules.ts.
 */
export async function seedDefaults(client: PrismaClient): Promise<void> {
  const categoryIdByName = new Map<string, string>();

  for (const cat of DEFAULT_CATEGORIES) {
    const created = await client.category.upsert({
      where: { name: cat.name },
      update: {
        isDiscretionary: cat.isDiscretionary,
        isDefault: true,
        excludeFromSpending: cat.excludeFromSpending ?? false,
      },
      create: {
        name: cat.name,
        isDiscretionary: cat.isDiscretionary,
        isDefault: true,
        excludeFromSpending: cat.excludeFromSpending ?? false,
      },
    });
    categoryIdByName.set(cat.name, created.id);
  }

  for (const rule of SEED_MERCHANT_RULES) {
    const categoryId = categoryIdByName.get(rule.category);
    if (!categoryId) continue;
    // SEED rules are global (userId = null). SQL treats NULLs as distinct
    // in unique indexes, so uniqueness is enforced here instead of by the DB.
    const existing = await client.merchantRule.findFirst({
      where: { pattern: rule.pattern, source: 'SEED', userId: null },
    });
    if (existing) {
      await client.merchantRule.update({ where: { id: existing.id }, data: { categoryId } });
    } else {
      await client.merchantRule.create({
        data: { pattern: rule.pattern, categoryId, source: 'SEED' },
      });
    }
  }
}
