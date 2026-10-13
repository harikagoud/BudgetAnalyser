import { describe, expect, it } from 'vitest';
import { categorizeFromRules, normalizeMerchant, type MerchantRuleLike } from '@/lib/categorization/engine';

const GROCERIES_ID = 'cat_groceries';
const UNCATEGORIZED_ID = 'cat_uncategorized';
const DINING_ID = 'cat_dining';

const SEED_RULES: MerchantRuleLike[] = [
  { pattern: 'costco', categoryId: GROCERIES_ID, source: 'SEED' },
  { pattern: 'wal-mart', categoryId: GROCERIES_ID, source: 'SEED' },
];

describe('categorization engine', () => {
  it('matches "COSTCO WHSE #123" to Groceries via SEED rules', () => {
    const result = categorizeFromRules(
      normalizeMerchant('COSTCO WHSE #123'),
      SEED_RULES,
      UNCATEGORIZED_ID,
    );
    expect(result.categoryId).toBe(GROCERIES_ID);
    expect(result.source).toBe('RULE');
  });

  it('matches "WAL-MART #456" to Groceries via SEED rules', () => {
    const result = categorizeFromRules(
      normalizeMerchant('WAL-MART #456'),
      SEED_RULES,
      UNCATEGORIZED_ID,
    );
    expect(result.categoryId).toBe(GROCERIES_ID);
    expect(result.source).toBe('RULE');
  });

  it('falls back to Uncategorized for an unmatched merchant', () => {
    const result = categorizeFromRules(
      normalizeMerchant('SOME RANDOM MERCHANT LLC'),
      SEED_RULES,
      UNCATEGORIZED_ID,
    );
    expect(result.categoryId).toBe(UNCATEGORIZED_ID);
    expect(result.source).toBe('DEFAULT');
  });

  it('prefers a USER override over a matching SEED rule for the same merchant', () => {
    const rulesWithOverride: MerchantRuleLike[] = [
      ...SEED_RULES,
      { pattern: 'costco', categoryId: DINING_ID, source: 'USER' },
    ];
    const result = categorizeFromRules(
      normalizeMerchant('COSTCO WHSE #123'),
      rulesWithOverride,
      UNCATEGORIZED_ID,
    );
    expect(result.categoryId).toBe(DINING_ID);
    expect(result.source).toBe('RULE');
  });
});
