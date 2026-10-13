import { parseSync, type LooselyTypedOFX } from 'ofx-js';
import { ParseError, type ParsedRow } from './csv';

/**
 * Best-effort OFX parser (research.md: OFX dialects vary by institution,
 * so this is supported but CSV remains the guaranteed default path).
 * Handles both bank (BANKMSGSRSV1) and credit-card (CREDITCARDMSGSRSV1)
 * statement shapes, since both are common OFX exports.
 */
export function parseOfx(fileContent: string): ParsedRow[] {
  const trimmed = fileContent.trim();
  if (trimmed.length === 0) {
    throw new ParseError('EMPTY_FILE', 'The uploaded OFX file is empty.');
  }

  let parsed: LooselyTypedOFX;
  try {
    parsed = parseSync(trimmed);
  } catch (err) {
    throw new ParseError('PARSE_ERROR', `Could not parse OFX: ${(err as Error).message}`);
  }

  const transactions = extractTransactions(parsed);
  if (transactions.length === 0) {
    throw new ParseError(
      'PARSE_ERROR',
      'No recognizable transactions found in this OFX file (unsupported dialect or empty statement).',
    );
  }

  return transactions.map((t) => ({
    date: normalizeOfxDate(t.DTPOSTED),
    merchantRaw: t.NAME ?? t.MEMO ?? 'UNKNOWN',
    amount: -Number(t.TRNAMT), // OFX: negative = debit/expense; we use positive = expense
  }));
}

function extractTransactions(parsed: LooselyTypedOFX): Record<string, string>[] {
  const ofx = parsed.OFX ?? {};
  const candidates = [
    ofx?.BANKMSGSRSV1?.STMTTRNRS?.STMTRS?.BANKTRANLIST?.STMTTRN,
    ofx?.CREDITCARDMSGSRSV1?.CCSTMTTRNRS?.CCSTMTRS?.BANKTRANLIST?.STMTTRN,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    return Array.isArray(candidate) ? candidate : [candidate];
  }
  return [];
}

function normalizeOfxDate(raw: string | undefined): string {
  if (!raw) return '';
  // OFX dates look like YYYYMMDD or YYYYMMDDHHMMSS[.xxx][tz]
  const digits = raw.slice(0, 8);
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  return `${year}-${month}-${day}`;
}
