import { describe, expect, it } from 'vitest';
import {
  categorizeFromRules,
  deriveMerchantKey,
  normalizeMerchant,
  type MerchantRuleLike,
} from '@/lib/categorization/engine';
import { DEFAULT_CATEGORIES, SEED_MERCHANT_RULES } from '@/lib/categorization/rules';

const id = (name: string) => `id:${name}`;
const nameOf = (categoryId: string) => categoryId.replace(/^id:/, '');
const NON_SPENDING = new Set(DEFAULT_CATEGORIES.filter((c) => c.excludeFromSpending).map((c) => c.name));
const SEED: MerchantRuleLike[] = SEED_MERCHANT_RULES.map((r) => ({
  pattern: r.pattern,
  categoryId: id(r.category),
  source: 'SEED',
  fallback: NON_SPENDING.has(r.category), // what loadRulesForUser sets from the category flag
}));

function cat(desc: string, extra: MerchantRuleLike[] = []): string {
  return nameOf(categorizeFromRules(normalizeMerchant(desc), [...SEED, ...extra], id('Uncategorized')).categoryId);
}

describe('seed rules on real bank-statement descriptions', () => {
  const cases: Array<[string, string]> = [
    ['SAMS CLUB #8112 PLANO TX', 'Groceries'],
    ['COSTCO WHSE #0123 FRISCO TX', 'Groceries'],
    ['WM SUPERCENTER #1234 ALLEN TX', 'Groceries'],
    ['WALMART.COM 8009256278 AR', 'Shopping'],
    ['COMMUNITY BUTCHER MCKINNEY TX', 'Groceries'],
    ['STARBUCKS STORE 12345 PLANO TX', 'Dining'],
    ['IHOP #4567 DALLAS TX', 'Dining'],
    ['BRAUMS 0123 FRISCO TX', 'Dining'],
    ['CASA DONER FRISCO TX', 'Dining'],
    ['ONYX COFFEE LAB SPRINGDALE AR', 'Dining'],
    ['NETFLIX.COM 866-579-7172 CA', 'Subscriptions'],
    ['OPENAI *CHATGPT SUBSCR SAN FRANCISCO CA', 'Subscriptions'],
    ['AAA TX INS 800-222-4357 TX', 'Car Insurance'],
    ["CARTER'S #1234 PLANO TX", 'Shopping'],
    ['REBTEL.COM STOCKHOLM', 'Subscriptions'],
    ['PAYMENT FROM CHK 1234', 'Payments/Transfers'],
    ['INTEREST CHARGED ON PURCHASES', 'Fees & Interest'],
    ['INTEREST CHARGED ON CASH ADVANCES', 'Fees & Interest'],
    ['SHELL OIL 12345678 PLANO TX', 'Transport/Fuel'],
  ];
  it.each(cases)('%s -> %s', (desc, expected) => {
    expect(cat(desc)).toBe(expected);
  });

  it('strips the Square "SQ *" prefix and still matches a known merchant', () => {
    expect(cat('SQ *MCGARRAGH FARMS')).toBe('Groceries');
    expect(cat('SQ *COMMUNITY BUTCHER')).toBe('Groceries');
    expect(cat('SQ *SOME UNKNOWN STAND')).toBe('Uncategorized');
  });

  it('only categories that exist are referenced by rules', () => {
    const names = new Set(DEFAULT_CATEGORIES.map((c) => c.name));
    for (const r of SEED_MERCHANT_RULES) expect(names.has(r.category)).toBe(true);
  });

  it('marks payments/transfers as not-spending and nothing else', () => {
    const flagged = DEFAULT_CATEGORIES.filter((c) => c.excludeFromSpending).map((c) => c.name);
    expect(flagged).toEqual(['Payments/Transfers']);
  });
});

describe('false positives', () => {
  it('a longer, more specific pattern beats a general one', () => {
    expect(cat('AMAZON PRIME*2K4 AMZN.COM/BILL WA')).toBe('Subscriptions');
    expect(cat('AMAZON.COM*2K4 AMZN.COM/BILL WA')).toBe('Shopping');
    expect(cat('WALMART.COM 800')).toBe('Shopping');
    expect(cat('WALMART #123')).toBe('Groceries');
  });
  it('disney+ is a subscription, Disneyland is entertainment', () => {
    expect(cat('DISNEY PLUS 888-905-7888')).toBe('Subscriptions');
    expect(cat('DISNEYLAND ANAHEIM CA')).toBe('Entertainment');
  });
  it('short/ambiguous words match whole words only', () => {
    expect(cat("SHELLY'S SALON")).toBe('Uncategorized');
    expect(cat('PILOTE CONSULTING')).toBe('Uncategorized');
    expect(cat('UBERTECH LLC')).toBe('Uncategorized');
    expect(cat('UBER TRIP HELP.UBER.COM')).toBe('Transport/Fuel');
  });
  it('a pattern in the middle of a word does not match', () => {
    expect(cat('MYAMAZONIA SHOP')).toBe('Uncategorized');
  });
  it('empty / one-character USER patterns never match everything', () => {
    const rules: MerchantRuleLike[] = [
      { pattern: '', categoryId: id('Health'), source: 'USER' },
      { pattern: ' ', categoryId: id('Health'), source: 'USER' },
      { pattern: 'x', categoryId: id('Health'), source: 'USER' },
    ];
    expect(cat('SOME RANDOM MERCHANT', rules)).toBe('Uncategorized');
  });
  it('USER rules beat SEED rules even when the SEED pattern is longer', () => {
    const rules: MerchantRuleLike[] = [{ pattern: 'costco', categoryId: id('Shopping'), source: 'USER' }];
    expect(cat('COSTCO WHSE #123', rules)).toBe('Shopping');
  });
});

describe('payment phrases never steal a real merchant', () => {
  it.each([
    ['STATE FARM ONLINE PAYMENT', 'Car Insurance'],
    ['GEICO AUTOPAY', 'Car Insurance'],
    ['VERIZON WIRELESS AUTOPAY', 'Utilities'],
    ['ROCKET MORTGAGE ONLINE PAYMENT', 'Home/EMI'],
    ['ONLINE PAYMENT THANK YOU', 'Payments/Transfers'],
    ['AUTOPAY', 'Payments/Transfers'],
    ['ZELLE PAYMENT TO JOHN', 'Payments/Transfers'],
  ])('%s -> %s', (desc, expected) => {
    expect(cat(desc)).toBe(expected);
  });
});

describe('short multi-word patterns are whole-word', () => {
  it.each([
    ['H&M 1234 PLANO TX', 'Shopping'],
    ['H MART PLANO TX', 'Groceries'],
    ['AT&T *BILL PAYMENT', 'Utilities'],
    ['EAT AT TONYS', 'Uncategorized'],
    ['SOME CHAT TALK CAFE', 'Dining'],
  ])('%s -> %s', (desc, expected) => {
    expect(cat(desc)).toBe(expected);
  });
});

describe('deriveMerchantKey', () => {
  it('drops store numbers, city and state so next month matches', () => {
    expect(deriveMerchantKey('SAMS CLUB #8112 PLANO TX')).toBe('sams club');
    expect(deriveMerchantKey('SQ *MCGARRAGH FARMS')).toBe('mcgarragh farms');
  });
  it('returns null when nothing usable is left', () => {
    expect(deriveMerchantKey('1234 5678')).toBeNull();
    expect(deriveMerchantKey('')).toBeNull();
  });
  it('a learned key matches the next month\'s different store number', () => {
    const key = deriveMerchantKey('JOES UNKNOWN STAND #55 PLANO TX')!;
    const learned: MerchantRuleLike[] = [{ pattern: key, categoryId: id('Groceries'), source: 'USER' }];
    expect(cat('SQ *JOES UNKNOWN STAND 0912', learned)).toBe('Groceries');
  });
});
