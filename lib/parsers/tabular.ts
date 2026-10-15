import { ParseError, type ParseOutput, type ParsedRow } from './types';
import { detectDateOrder, parseAmount, parseDate } from './values';

/** Header words (lower-cased, punctuation stripped), most preferred first. */
const DATE_HEADERS = ['transaction date', 'trans date', 'date', 'posted date', 'post date', 'posting date', 'booking date', 'value date'];
const DESCRIPTION_HEADERS = [
  'description', 'transaction description', 'merchant', 'payee', 'name', 'details',
  'memo', 'narrative', 'original description', 'particulars', 'reference',
];
const AMOUNT_HEADERS = ['amount', 'transaction amount', 'amt', 'value'];
const DEBIT_HEADERS = ['debit', 'debits', 'withdrawal', 'withdrawals', 'money out', 'paid out', 'charge', 'charges'];
const CREDIT_HEADERS = ['credit', 'credits', 'deposit', 'deposits', 'money in', 'paid in', 'payment', 'payments'];

const SUMMARY_LABEL = /^\s*(total|subtotal|balance|summary|opening|closing|ending|beginning)\b/i;
const HEADER_SCAN_ROWS = 30; // bank exports often put account info above the header
const FLIP_MIN_ROWS = 3;
const FLIP_NEGATIVE_SHARE = 0.7;

function norm(cell: unknown): string {
  return String(cell ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pick(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const i = headers.indexOf(c);
    if (i !== -1) return i;
  }
  return -1;
}

interface Layout {
  headerRow: number;
  date: number;
  description: number;
  amount: number; // -1 when using debit/credit
  debit: number;
  credit: number;
}

function findLayout(table: unknown[][]): Layout | null {
  const limit = Math.min(table.length, HEADER_SCAN_ROWS);
  for (let r = 0; r < limit; r++) {
    const headers = table[r].map(norm);
    const date = pick(headers, DATE_HEADERS);
    const description = pick(headers, DESCRIPTION_HEADERS);
    if (date === -1 || description === -1) continue;
    const amount = pick(headers, AMOUNT_HEADERS);
    const debit = pick(headers, DEBIT_HEADERS);
    const credit = pick(headers, CREDIT_HEADERS);
    if (amount !== -1 || debit !== -1) {
      return { headerRow: r, date, description, amount, debit, credit };
    }
  }
  return null;
}

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

/**
 * Turns a grid of cells (from CSV/TSV/TXT or an Excel sheet) into transactions.
 *
 * Sign: the app stores expenses as positive. A debit/credit column pair has a
 * defined sign. A single Amount column does not: card issuers (Amex, …) list
 * purchases as positive, others (Chase, most checking accounts) as negative.
 * We keep the sign as-is unless clearly most rows are negative, then flip, and
 * say so in `notes`.
 */
export function mapTable(table: unknown[][]): ParseOutput {
  const layout = findLayout(table);
  if (!layout) {
    throw new ParseError(
      'PARSE_ERROR',
      'Could not find recognizable Date/Description/Amount columns in the file header.',
    );
  }
  const body = table.slice(layout.headerRow + 1);
  const order = detectDateOrder(body.map((row) => row[layout.date]));
  const notes: string[] = [];
  const rows: ParsedRow[] = [];

  body.forEach((row, index) => {
    if (row.every(blank)) return;
    const dateCell = row[layout.date];
    // A blank date cell, or a label like "Total"/"Closing balance" there, is a
    // footer/summary line rather than a transaction. Any other unreadable date is an error.
    if (blank(dateCell) || (parseDate(dateCell, order) === null && SUMMARY_LABEL.test(String(dateCell)))) return;
    const date = parseDate(dateCell, order);
    const merchantRaw = String(row[layout.description] ?? '').trim();

    let amount: number | null;
    if (layout.amount !== -1) {
      amount = parseAmount(row[layout.amount]);
    } else {
      const noDebit = blank(row[layout.debit]);
      const noCredit = layout.credit === -1 || blank(row[layout.credit]);
      if (noDebit && noCredit) return; // e.g. a balance-only line: no money moved
      const debit = noDebit ? 0 : parseAmount(row[layout.debit]);
      const credit = noCredit ? 0 : parseAmount(row[layout.credit]);
      amount = debit === null || credit === null ? null : Math.abs(debit) - Math.abs(credit);
    }

    if (!date || amount === null || !merchantRaw) {
      throw new ParseError(
        'PARSE_ERROR',
        `Row ${index + 1} is missing or has invalid date/description/amount.`,
      );
    }
    rows.push({ date, merchantRaw, amount });
  });

  if (rows.length === 0) {
    throw new ParseError('EMPTY_FILE', 'The uploaded file has no data rows.');
  }

  if (layout.amount !== -1) applySignHeuristic(rows, notes);
  return { rows, notes, skipped: 0 };
}

/** Flips a single signed-amount column when clearly most rows are negative; records a note. */
export function applySignHeuristic(rows: ParsedRow[], notes: string[]): void {
  const nonZero = rows.filter((r) => r.amount !== 0);
  const negatives = nonZero.filter((r) => r.amount < 0).length;
  if (nonZero.length >= FLIP_MIN_ROWS && negatives / nonZero.length >= FLIP_NEGATIVE_SHARE) {
    for (const r of rows) r.amount = -r.amount;
    notes.push(
      'Most amounts in this file were negative, so negative amounts were treated as spending (and positive amounts as credits/refunds/deposits).',
    );
  }
}
