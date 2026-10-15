import crypto from 'crypto';
import { normalizeMerchant } from '@/lib/categorization/engine';

/**
 * Generates a stable dedupe key from (date, amount, accountId, merchant),
 * shared by CSV/OFX import and Plaid sync (FR-013). Enforced as a unique
 * constraint on Transaction.dedupeKey at the DB level (prisma/schema.prisma)
 * and checked explicitly here so duplicates can be reported, not just
 * silently rejected by a DB error.
 */
export function computeDedupeKey(params: {
  date: string;
  amount: number;
  accountId: string;
  merchantRaw: string;
}): string {
  const merchantNormalized = normalizeMerchant(params.merchantRaw);
  const raw = `${params.date}|${params.amount.toFixed(2)}|${params.accountId}|${merchantNormalized}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Plaid rows are keyed by Plaid's own transaction id (stable and unique), so two identical
 * same-day purchases are both kept and a pending→posted change cannot create a duplicate.
 */
export function computePlaidDedupeKey(accountId: string, plaidTransactionId: string): string {
  return crypto.createHash('sha256').update(`plaid|${accountId}|${plaidTransactionId}`).digest('hex');
}
