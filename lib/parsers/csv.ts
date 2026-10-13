import { parse } from 'csv-parse/sync';

export interface ParsedRow {
  date: string; // YYYY-MM-DD
  merchantRaw: string;
  amount: number;
}

export class ParseError extends Error {
  code: 'EMPTY_FILE' | 'PARSE_ERROR';
  constructor(code: 'EMPTY_FILE' | 'PARSE_ERROR', message: string) {
    super(message);
    this.code = code;
    this.name = 'ParseError';
  }
}

const DATE_KEYS = ['date', 'transaction date', 'posted date'];
const DESCRIPTION_KEYS = ['description', 'merchant', 'payee', 'details'];
const AMOUNT_KEYS = ['amount', 'debit', 'transaction amount'];

function findKey(row: Record<string, string>, candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const match = keys.find((k) => k.trim().toLowerCase() === candidate);
    if (match) return match;
  }
  return undefined;
}

/**
 * Parses a CSV bank/card statement into a normalized row shape. Accepts
 * common header variants (Date/Transaction Date, Description/Merchant,
 * Amount/Debit). Throws a typed ParseError on empty input or rows missing
 * required fields, per contracts/api.md's EMPTY_FILE/PARSE_ERROR codes.
 */
export function parseCsv(fileContent: string): ParsedRow[] {
  const trimmed = fileContent.trim();
  if (trimmed.length === 0) {
    throw new ParseError('EMPTY_FILE', 'The uploaded CSV file is empty.');
  }

  let records: Record<string, string>[];
  try {
    records = parse(trimmed, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    throw new ParseError('PARSE_ERROR', `Could not parse CSV: ${(err as Error).message}`);
  }

  if (records.length === 0) {
    throw new ParseError('EMPTY_FILE', 'The uploaded CSV file has no data rows.');
  }

  const dateKey = findKey(records[0], DATE_KEYS);
  const descriptionKey = findKey(records[0], DESCRIPTION_KEYS);
  const amountKey = findKey(records[0], AMOUNT_KEYS);

  if (!dateKey || !descriptionKey || !amountKey) {
    throw new ParseError(
      'PARSE_ERROR',
      'Could not find recognizable Date/Description/Amount columns in the CSV header.',
    );
  }

  return records.map((row, index) => {
    const rawDate = row[dateKey];
    const rawAmount = row[amountKey];
    const merchantRaw = row[descriptionKey];

    const date = normalizeDate(rawDate);
    const amount = Number(rawAmount);

    if (!date || Number.isNaN(amount) || !merchantRaw) {
      throw new ParseError(
        'PARSE_ERROR',
        `Row ${index + 1} is missing or has invalid date/description/amount.`,
      );
    }

    return { date, merchantRaw, amount };
  });
}

function normalizeDate(raw: string): string | null {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
