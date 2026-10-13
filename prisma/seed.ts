import { PrismaClient } from '@prisma/client';
import { seedDefaults } from '../lib/db/seed-defaults';
import { DEFAULT_CATEGORIES, SEED_MERCHANT_RULES } from '../lib/categorization/rules';

const prisma = new PrismaClient();

async function main() {
  await seedDefaults(prisma);
  console.log(
    `Seeded ${DEFAULT_CATEGORIES.length} categories and ${SEED_MERCHANT_RULES.length} merchant rules.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
