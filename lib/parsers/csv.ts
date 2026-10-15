import { parse } from 'csv-parse/sync';
import { mapTable } from './tabular';
import { ParseError, type ParseOutput, type ParsedRow } from './types';

export { ParseError };
export type { ParsedRow, ParseErrorCode } from './types';

const DELIMITERS = [',', ';', '\t', '|'];

/** Picks the delimiter that appears most consistently in the first lines. */
function sniffDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 15);
  let best = ',';
  let bestScore = -1;
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => l.split(d).length - 1);
    const min = Math.min(...counts);
    const total = counts.reduce((a, b) => a + b, 0);
    const score = min > 0 ? total + 1000 : total; // present on every line beats merely frequent
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/**
 * Delimited text (CSV, TSV, semicolon/pipe-separated, .txt exports) into
 * transactions. Header names are matched flexibly (see tabular.ts), account
 * info above the header and Debit/Credit column pairs are handled.
 */
export function parseDelimited(fileContent: string): ParseOutput {
  const trimmed = fileContent.replace(/^﻿/, '').trim();
  if (trimmed.length === 0) {
    throw new ParseError('EMPTY_FILE', 'The uploaded file is empty.');
  }

  let table: string[][];
  try {
    table = parse(trimmed, {
      delimiter: sniffDelimiter(trimmed),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    });
  } catch (err) {
    throw new ParseError('PARSE_ERROR', `Could not parse the file: ${(err as Error).message}`);
  }
  return mapTable(table);
}

/** Back-compat wrapper: rows only. */
export function parseCsv(fileContent: string): ParsedRow[] {
  return parseDelimited(fileContent).rows;
}
