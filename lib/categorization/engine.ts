import { prisma as defaultPrisma } from '@/lib/db/client';
import type { PrismaClient } from '@prisma/client';

export interface MerchantRuleLike {
  pattern: string;
  categoryId: string;
  source: 'SEED' | 'USER';
  /**
   * SEED rules of non-spending categories (payments/transfers) are a last resort: they
   * only apply when no spending rule matches, so "GEICO AUTOPAY" stays Car Insurance
   * instead of losing to the longer generic phrase "autopay".
   */
  fallback?: boolean;
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
 * Bank/card statements wrap the real merchant in noise: processor prefixes
 * ("SQ *", "TST*", "POS DEBIT"), store numbers, cities, reference numbers.
 * This is used ONLY for rule matching. `normalizeMerchant` above must stay
 * exactly as it is: dedupe keys are built from it, and changing it would make
 * every already-imported transaction look new on re-upload.
 */
const PREFIX_NOISE =
  /^(?:(?:sq|tst|pp|sp|pos|dd)\s+|paypal\s+|checkcard\s+|debit card purchase\s+|debit purchase\s+|purchase authorized on \d{1,2} \d{1,2}\s+|card purchase\s+)+/;

export function cleanForMatching(text: string): string {
  const spaced = text
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
  return spaced.replace(PREFIX_NOISE, '').trim();
}

/** Short/ambiguous single words must match a whole word ("shell" must not match "shelly's", "gap" not "gapped"). */
const WHOLE_WORD_ONLY = new Set(['shell', 'pilot', 'mobil', 'uber', 'deli', 'thai', 'cafe', 'tire', 'toll', 'fuel', 'grill', 'hotel', 'motel', 'h m', 'at t']);
const MIN_PATTERN_LENGTH = 2;

interface CompiledRule {
  rule: MerchantRuleLike;
  cleaned: string;
  wholeWord: boolean;
}

const compiledCache = new WeakMap<MerchantRuleLike[], { user: CompiledRule[]; seed: CompiledRule[] }>();

function compileRules(rules: MerchantRuleLike[]) {
  const hit = compiledCache.get(rules);
  if (hit) return hit;
  const user: CompiledRule[] = [];
  const seed: CompiledRule[] = [];
  for (const rule of rules) {
    const cleaned = cleanForMatching(rule.pattern);
    // An empty/1-char pattern would match every merchant ('abc'.includes('') is true).
    if (cleaned.length < MIN_PATTERN_LENGTH || !/[a-z0-9]/.test(cleaned)) continue;
    const single = !cleaned.includes(' ');
    const compiled = { rule, cleaned, wholeWord: WHOLE_WORD_ONLY.has(cleaned) || (single && cleaned.length <= 3) };
    (rule.source === 'USER' ? user : seed).push(compiled);
  }
  // Longest (most specific) pattern first, so "amazon prime" beats "amazon".
  const byLength = (a: CompiledRule, b: CompiledRule) => b.cleaned.length - a.cleaned.length;
  user.sort(byLength);
  // Spending rules first, then the fallback (non-spending) ones; each group longest-first.
  seed.sort((a, b) => Number(!!a.rule.fallback) - Number(!!b.rule.fallback) || byLength(a, b));
  const out = { user, seed };
  compiledCache.set(rules, out);
  return out;
}

function matches(c: CompiledRule, cleanedText: string, rawNormalized: string): boolean {
  const padded = ` ${cleanedText} `;
  if (c.wholeWord ? padded.includes(` ${c.cleaned} `) : padded.includes(` ${c.cleaned}`)) return true;
  // Rules learned before cleaning existed hold the whole raw description.
  return c.rule.source === 'USER' && rawNormalized.length >= MIN_PATTERN_LENGTH && rawNormalized.includes(c.rule.pattern);
}

/**
 * The key stored when the user recategorizes a merchant: the cleaned name up
 * to the first number/store id, so next month's "STARBUCKS 53377 SILOAM" and
 * "STARBUCKS #1204 ROGERS" both hit the same rule. Returns null when nothing
 * safe can be extracted (callers then keep the exact description).
 */
export function deriveMerchantKey(merchantRaw: string): string | null {
  const tokens = cleanForMatching(merchantRaw).split(' ');
  const keep: string[] = [];
  for (const t of tokens) {
    if (/\d/.test(t) && !t.endsWith('+')) break; // store numbers, refs, phone numbers, dates
    keep.push(t);
  }
  while (keep.length > 1 && /^[a-z]{2}$/.test(keep[keep.length - 1])) keep.pop(); // trailing state code
  const key = keep.slice(0, 4).join(' ').trim();
  return key.length >= 3 && /[a-z]/.test(key) ? key : null;
}

/**
 * Pure categorization logic, independent of persistence, so it is directly
 * unit-testable (Constitution Principle II). USER rules always take
 * precedence over SEED rules; within each, the longest matching pattern wins.
 */
export function categorizeFromRules(
  merchantNormalized: string,
  rules: MerchantRuleLike[],
  uncategorizedCategoryId: string,
): CategorizeResult {
  const { user, seed } = compileRules(rules);
  const cleaned = cleanForMatching(merchantNormalized);
  const userMatch = user.find((c) => matches(c, cleaned, merchantNormalized));
  if (userMatch) return { categoryId: userMatch.rule.categoryId, source: 'RULE' };
  const seedMatch = seed.find((c) => matches(c, cleaned, merchantNormalized));
  if (seedMatch) return { categoryId: seedMatch.rule.categoryId, source: 'RULE' };
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

/**
 * Global SEED rules plus this user's own USER rules — never another user's.
 * Every rule load in the app must go through here.
 */
export async function loadRulesForUser(
  userId: string,
  client: PrismaClient = defaultPrisma,
): Promise<MerchantRuleLike[]> {
  const rules = await client.merchantRule.findMany({
    where: { OR: [{ source: 'SEED', userId: null }, { source: 'USER', userId }] },
    include: { category: { select: { excludeFromSpending: true } } },
  });
  return rules.map((r) => ({
    pattern: r.pattern,
    categoryId: r.categoryId,
    source: r.source as 'SEED' | 'USER',
    fallback: r.source === 'SEED' && r.category.excludeFromSpending,
  }));
}

/** DB-backed categorize: loads all merchant rules and applies the pure logic above. */
export async function categorize(
  merchantRaw: string,
  userId: string,
  client: PrismaClient = defaultPrisma,
): Promise<CategorizeResult> {
  const merchantNormalized = normalizeMerchant(merchantRaw);
  const [rules, uncategorizedId] = await Promise.all([
    loadRulesForUser(userId, client),
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
  userId: string,
  client: PrismaClient = defaultPrisma,
): Promise<void> {
  // Prefer a store-number-free key (see deriveMerchantKey); fall back to the exact description.
  const pattern = deriveMerchantKey(merchantRaw) ?? normalizeMerchant(merchantRaw);
  const existing = await client.merchantRule.findFirst({
    where: { pattern, source: 'USER', userId },
  });
  if (existing) {
    await client.merchantRule.update({ where: { id: existing.id }, data: { categoryId } });
  } else {
    await client.merchantRule.create({ data: { pattern, categoryId, source: 'USER', userId } });
  }
}
