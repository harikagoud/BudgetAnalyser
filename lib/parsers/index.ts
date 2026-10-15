import type { ImportFormat } from '@/lib/import/formats';
import { parseDelimited } from './csv';
import { parseOfx } from './ofx';
import { parsePdf } from './pdf';
import { parseQif } from './qif';
import { ParseError, type ParseOutput } from './types';
import { parseXlsx } from './xlsx';

export interface StatementInput {
  format: ImportFormat;
  /** Already-decoded text, for the text formats. */
  text?: string;
  /** Raw bytes; required for XLSX/PDF, and decoded as UTF-8 for text formats when `text` is absent. */
  bytes?: Uint8Array;
}

/** Dispatches to the parser for `format`. Heavy parsers (pdf.js) load only when used, server-side. */
export async function parseStatementFile(input: StatementInput): Promise<ParseOutput> {
  const text = () => input.text ?? new TextDecoder('utf-8').decode(input.bytes ?? new Uint8Array());
  switch (input.format) {
    case 'CSV':
      return parseDelimited(text());
    case 'OFX':
      return { rows: parseOfx(text()), notes: [], skipped: 0 };
    case 'QIF':
      return parseQif(text());
    case 'XLSX':
      if (!input.bytes) throw new ParseError('PARSE_ERROR', 'Spreadsheet data was not provided.');
      return parseXlsx(input.bytes);
    case 'PDF':
      if (!input.bytes) throw new ParseError('PARSE_ERROR', 'PDF data was not provided.');
      return parsePdf(input.bytes);
  }
}
