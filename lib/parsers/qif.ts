import { ParseError, type ParseOutput, type ParsedRow } from './types';
import { detectDateOrder, parseAmount, parseDate } from './values';

interface RawRecord {
  date?: string;
  amount?: string;
  payee?: string;
  memo?: string;
}

/** Quicken dates look like 12/31'25 or 12/31/2025 (sometimes with spaces: "1/ 5'25"). */
function cleanQifDate(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/'(\d{2})$/, '/$1');
}

/**
 * QIF (Quicken Interchange Format). Sign is defined: T is the signed amount
 * with negative = money out, so expense = -T (same as OFX). Investment
 * sections (!Type:Invst) and account headers are skipped.
 */
export function parseQif(fileContent: string): ParseOutput {
  const text = fileContent.replace(/^﻿/, '').trim();
  if (text.length === 0) throw new ParseError('EMPTY_FILE', 'The uploaded QIF file is empty.');

  const records: RawRecord[] = [];
  let current: RawRecord = {};
  let skipSection = false;
  let sawType = false;

  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith('!')) {
      const header = line.toLowerCase();
      if (header.startsWith('!type:')) {
        sawType = true;
        skipSection = /!type:(invst|prices|security|payee|cat|class|tag|memorized)/.test(header);
      } else if (header.startsWith('!account')) {
        skipSection = true; // account list block, not transactions
      }
      current = {};
      continue;
    }
    if (skipSection) continue;
    const code = line[0];
    const value = line.slice(1).trim();
    if (code === '^') {
      if (current.date !== undefined && current.amount !== undefined) records.push(current);
      current = {};
    } else if (code === 'D') current.date = value;
    else if (code === 'T' || code === 'U') current.amount = value;
    else if (code === 'P') current.payee = value;
    else if (code === 'M') current.memo = value;
  }
  if (current.date !== undefined && current.amount !== undefined) records.push(current); // missing final ^

  if (!sawType && records.length === 0) {
    throw new ParseError('PARSE_ERROR', 'This does not look like a QIF file (no !Type header found).');
  }
  if (records.length === 0) {
    throw new ParseError('EMPTY_FILE', 'No bank/card transactions found in this QIF file.');
  }

  const cleaned = records.map((r) => cleanQifDate(r.date ?? ''));
  const order = detectDateOrder(cleaned);
  const rows: ParsedRow[] = records.map((r, i) => {
    const date = parseDate(cleaned[i], order);
    const signed = parseAmount(r.amount);
    const merchantRaw = (r.payee || r.memo || '').trim();
    if (!date || signed === null || !merchantRaw) {
      throw new ParseError('PARSE_ERROR', `QIF transaction ${i + 1} is missing or has an invalid date/payee/amount.`);
    }
    return { date, merchantRaw, amount: -signed };
  });
  return { rows, notes: [], skipped: 0 };
}
