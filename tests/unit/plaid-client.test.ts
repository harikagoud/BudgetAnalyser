import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeDedupeKey } from '@/lib/dedupe';
import {
  applyPlaidTransactions,
  createLinkToken,
  exchangePublicToken,
  fetchAllTransactions,
  isPlaidEnabled,
} from '@/lib/plaid/client';

describe('Plaid client wrapper — disabled path (US5, T051)', () => {
  const original = process.env.ENABLE_PLAID;

  beforeEach(() => {
    process.env.ENABLE_PLAID = 'false';
  });

  afterEach(() => {
    process.env.ENABLE_PLAID = original;
  });

  it('isPlaidEnabled() is false when ENABLE_PLAID=false', () => {
    expect(isPlaidEnabled()).toBe(false);
  });

  it('isPlaidEnabled() requires the exact string "true" (case-sensitive, no truthy coercion)', () => {
    process.env.ENABLE_PLAID = 'TRUE';
    expect(isPlaidEnabled()).toBe(false);
    process.env.ENABLE_PLAID = '1';
    expect(isPlaidEnabled()).toBe(false);
    process.env.ENABLE_PLAID = 'true';
    expect(isPlaidEnabled()).toBe(true);
  });

  it('createLinkToken is a safe no-op: no throw, clear disabled result, never touches the network', async () => {
    const result = await createLinkToken('local-user');
    expect(result).toEqual({ enabled: false });
  });

  it('exchangePublicToken is a safe no-op when disabled', async () => {
    const result = await exchangePublicToken('public-sandbox-xyz');
    expect(result).toEqual({ enabled: false });
  });

  it('fetchAllTransactions is a safe no-op when disabled', async () => {
    const result = await fetchAllTransactions('access-sandbox-xyz');
    expect(result).toEqual({ enabled: false });
  });

  it('none of the disabled-path calls require PLAID_CLIENT_ID/PLAID_SECRET to be set', async () => {
    delete process.env.PLAID_CLIENT_ID;
    delete process.env.PLAID_SECRET;
    await expect(createLinkToken('local-user')).resolves.toEqual({ enabled: false });
    await expect(exchangePublicToken('x')).resolves.toEqual({ enabled: false });
    await expect(fetchAllTransactions('x')).resolves.toEqual({ enabled: false });
  });
});

describe('applyPlaidTransactions — pure categorize/dedupe core (US5 Acceptance Scenario 2)', () => {
  const categories = [
    { id: 'cat_dining', name: 'Dining' },
    { id: 'cat_unc', name: 'Uncategorized' },
  ];
  const rules = [{ pattern: 'starbucks', categoryId: 'cat_dining', source: 'SEED' as const }];
  const accountId = 'acct_1';

  it('categorizes a fresh transaction and produces no duplicates', () => {
    const result = applyPlaidTransactions(
      [{ date: '2026-09-01', amount: 5.5, merchantRaw: 'STARBUCKS #123' }],
      accountId,
      rules,
      categories,
      'cat_unc',
      new Set(),
    );
    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0].categoryId).toBe('cat_dining');
    expect(result.toCreate[0].categorySource).toBe('RULE');
    expect(result.duplicateCount).toBe(0);
  });

  it('falls back to the uncategorized bucket when no rule matches', () => {
    const result = applyPlaidTransactions(
      [{ date: '2026-09-01', amount: 9.99, merchantRaw: 'SOME RANDOM SHOP' }],
      accountId,
      rules,
      categories,
      'cat_unc',
      new Set(),
    );
    expect(result.toCreate[0].categoryId).toBe('cat_unc');
    expect(result.toCreate[0].categorySource).toBe('DEFAULT');
  });

  it('treats a transaction whose dedupeKey is already known (existingKeys) as a duplicate, not a new row', () => {
    const tx = { date: '2026-09-01', amount: 5.5, merchantRaw: 'STARBUCKS #123' };
    const key = computeDedupeKey({
      date: tx.date,
      amount: tx.amount,
      accountId,
      merchantRaw: tx.merchantRaw,
    });
    const result = applyPlaidTransactions([tx], accountId, rules, categories, 'cat_unc', new Set([key]));
    expect(result.toCreate).toHaveLength(0);
    expect(result.duplicateCount).toBe(1);
  });

  it('a second call seeded with the first call\'s output keys produces zero new rows (simulates a repeated sync)', () => {
    const batch = [{ date: '2026-09-01', amount: 5.5, merchantRaw: 'STARBUCKS #123' }];
    const first = applyPlaidTransactions(batch, accountId, rules, categories, 'cat_unc', new Set());
    const keysAfterFirst = new Set(first.toCreate.map((row) => row.dedupeKey));

    const second = applyPlaidTransactions(batch, accountId, rules, categories, 'cat_unc', keysAfterFirst);
    expect(second.toCreate).toHaveLength(0);
    expect(second.duplicateCount).toBe(1);
  });

  it('dedupes two identical rows returned within the same fetch page', () => {
    const tx = { date: '2026-09-01', amount: 5.5, merchantRaw: 'STARBUCKS #123' };
    const result = applyPlaidTransactions([tx, tx], accountId, rules, categories, 'cat_unc', new Set());
    expect(result.toCreate).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
  });

  it('counts categories by name for the summary, same shape as the CSV/OFX import path', () => {
    const result = applyPlaidTransactions(
      [
        { date: '2026-09-01', amount: 5.5, merchantRaw: 'STARBUCKS #1' },
        { date: '2026-09-02', amount: 6.5, merchantRaw: 'STARBUCKS #2' },
        { date: '2026-09-03', amount: 9.99, merchantRaw: 'SOME RANDOM SHOP' },
      ],
      accountId,
      rules,
      categories,
      'cat_unc',
      new Set(),
    );
    expect(result.categoryCounts).toEqual({ Dining: 2, Uncategorized: 1 });
  });
});

describe('Plaid rows with transaction ids', () => {
  const categories = [{ id: 'cat_unc', name: 'Uncategorized' }];
  const run = (txs: Parameters<typeof applyPlaidTransactions>[0], existing = new Set<string>()) =>
    applyPlaidTransactions(txs, 'acct_1', [], categories, 'cat_unc', existing);

  it('skips pending rows (the posted version arrives later under a new id)', () => {
    const out = run([
      { id: 'p1', date: '2026-10-01', amount: 20, merchantRaw: 'SHOP', pending: true },
      { id: 'p2', date: '2026-10-02', amount: 20, merchantRaw: 'SHOP', pending: false },
    ]);
    expect(out.toCreate).toHaveLength(1);
  });

  it('keeps two identical same-day purchases because their ids differ', () => {
    const out = run([
      { id: 'a', date: '2026-10-01', amount: 65, merchantRaw: 'COSTCO' },
      { id: 'b', date: '2026-10-01', amount: 65, merchantRaw: 'COSTCO' },
    ]);
    expect(out.toCreate).toHaveLength(2);
  });

  it('the same id on a later sync is a duplicate, even if the date or merchant text changed', () => {
    const first = run([{ id: 'a', date: '2026-10-01', amount: 65, merchantRaw: 'COSTCO' }]);
    const again = run(
      [{ id: 'a', date: '2026-10-02', amount: 65, merchantRaw: 'COSTCO WHSE' }],
      new Set(first.toCreate.map((r) => r.dedupeKey)),
    );
    expect(again.toCreate).toHaveLength(0);
    expect(again.duplicateCount).toBe(1);
  });

  it('skips zero-amount rows and keeps different accounts apart', () => {
    expect(run([{ id: 'z', date: '2026-10-01', amount: 0, merchantRaw: 'X' }]).toCreate).toHaveLength(0);
    const a = applyPlaidTransactions([{ id: 'a', date: '2026-10-01', amount: 5, merchantRaw: 'X' }], 'acct_1', [], categories, 'cat_unc', new Set());
    const b = applyPlaidTransactions([{ id: 'a', date: '2026-10-01', amount: 5, merchantRaw: 'X' }], 'acct_2', [], categories, 'cat_unc', new Set());
    expect(a.toCreate[0].dedupeKey).not.toBe(b.toCreate[0].dedupeKey);
  });
});

