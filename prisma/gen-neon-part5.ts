// Prints the idempotent "Part 5" SQL (categories, excludeFromSpending, SEED rules) for
// pasting into the Neon SQL Editor. Source of truth: lib/categorization/rules.ts.
//   npx tsx prisma/gen-neon-part5.ts
import { DEFAULT_CATEGORIES, SEED_MERCHANT_RULES } from '../lib/categorization/rules';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

// Same "last one wins" behaviour as seedDefaults() for a pattern listed twice.
const byPattern = new Map<string, string>();
for (const r of SEED_MERCHANT_RULES) byPattern.set(r.pattern, r.category);
const rules = Array.from(byPattern.entries());

const out: string[] = [];
out.push('-- ===== Part 5: category recognition (migration 20261016120000_category_exclude_from_spending) =====');
out.push('-- Safe to run more than once. Run it BEFORE deploying the matching app version.');
out.push('ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "excludeFromSpending" BOOLEAN NOT NULL DEFAULT false;');
out.push('');
for (const c of DEFAULT_CATEGORIES) {
  out.push(
    `INSERT INTO "Category" ("id","name","isDiscretionary","isDefault","excludeFromSpending") VALUES (${q(
      'c5_' + c.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    )},${q(c.name)},${c.isDiscretionary},true,${!!c.excludeFromSpending}) ON CONFLICT ("name") DO UPDATE SET "isDiscretionary"=EXCLUDED."isDiscretionary","isDefault"=true,"excludeFromSpending"=EXCLUDED."excludeFromSpending";`,
  );
}
out.push('');
const values = rules.map(([p, c]) => `(${q(p)},${q(c)})`).join(',\n  ');
out.push('-- Move any existing SEED rule whose category changed.');
out.push(
  `UPDATE "MerchantRule" m SET "categoryId" = c."id" FROM (VALUES\n  ${values}\n) AS v(pattern, category) JOIN "Category" c ON c."name" = v.category WHERE m."pattern" = v.pattern AND m."source" = 'SEED' AND m."userId" IS NULL AND m."categoryId" <> c."id";`,
);
out.push('');
out.push('-- Add the rules that are missing.');
out.push(
  `INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId")\nSELECT 'r5_' || md5(v.pattern), v.pattern, c."id", 'SEED', NULL FROM (VALUES\n  ${values}\n) AS v(pattern, category) JOIN "Category" c ON c."name" = v.category\nWHERE NOT EXISTS (SELECT 1 FROM "MerchantRule" m WHERE m."pattern" = v.pattern AND m."source" = 'SEED' AND m."userId" IS NULL);`,
);
console.log(out.join('\n'));
