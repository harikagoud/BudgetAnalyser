import { ParseError } from './types';

/** Parses a money cell: "$1,234.56", "(12.34)", "12.34-", "12,50", "45.00 CR". null if not a number. */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/[\s ]/g, '');
  if (s === '') return null;

  let negative = false;
  let creditMarker = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/(cr|credit)$/i.test(s)) {
    creditMarker = true;
    s = s.replace(/(cr|credit)$/i, '');
  } else if (/(dr|debit)$/i.test(s)) {
    s = s.replace(/(dr|debit)$/i, '');
  }
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  } else if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  s = s.replace(/^[$€£¥]|[$€£¥]$/g, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }

  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.'); // decimal comma
  else s = s.replace(/,/g, ''); // thousands separators
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;

  let n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (creditMarker) negative = !negative;
  if (negative) n = -n;
  return n;
}

export type DateOrder = 'MDY' | 'DMY';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function iso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/** Calendar date -> YYYY-MM-DD with no time-zone shifting. null if unrecognised or impossible. */
export function parseDate(raw: unknown, order: DateOrder = 'MDY'): string | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.toISOString().slice(0, 10);
  if (typeof raw === 'number') return excelSerialToIso(raw);
  if (typeof raw !== 'string') return null;
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(s); // 2026-09-03 / 2026/09/03T…
  if (m) return iso(+m[1], +m[2], +m[3]);

  m = /^(\d{4})(\d{2})(\d{2})(?:\d{0,6}.*)?$/.exec(s); // 20260903 (OFX-ish)
  if (m && s.length >= 8 && !s.includes('/') && !s.includes('-')) return iso(+m[1], +m[2], +m[3]);

  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[T ].*)?$/.exec(s); // 09/03/2026, 3-9-26
  if (m) {
    const [a, b, y] = [+m[1], +m[2], fullYear(+m[3])];
    return order === 'MDY' ? iso(y, a, b) : iso(y, b, a);
  }

  m = /^(\d{1,2})[ -]([A-Za-z]{3,9})[ ,.-]*(\d{2}|\d{4})$/.exec(s); // 3-Sep-2026, 3 September 2026
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    return mi === -1 ? null : iso(fullYear(+m[3]), mi + 1, +m[1]);
  }

  m = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{2}|\d{4})$/.exec(s); // Sep 3, 2026
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return mi === -1 ? null : iso(fullYear(+m[3]), mi + 1, +m[2]);
  }

  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToIso(Number(s));
  return null;
}

function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null; // ~1954..2119
  const ms = Math.round((Math.floor(serial) - 25569) * 86400 * 1000); // 25569 = 1970-01-01
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Decides whether slash dates in a file are day-first, by looking for any
 * value that can only be day-first (first number > 12). Defaults to US order.
 */
export function detectDateOrder(samples: unknown[]): DateOrder {
  let sawDayFirst = false;
  let sawMonthFirst = false;
  for (const v of samples) {
    if (typeof v !== 'string') continue;
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})/.exec(v.trim());
    if (!m) continue;
    if (+m[1] > 12) sawDayFirst = true;
    if (+m[2] > 12) sawMonthFirst = true;
  }
  return sawDayFirst && !sawMonthFirst ? 'DMY' : 'MDY';
}

export function requireRows<T>(rows: T[], what: string): T[] {
  if (rows.length === 0) throw new ParseError('EMPTY_FILE', `The uploaded ${what} has no transactions.`);
  return rows;
}
