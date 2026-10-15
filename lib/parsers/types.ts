export interface ParsedRow {
  date: string; // YYYY-MM-DD
  merchantRaw: string;
  amount: number; // positive = expense, negative = refund/credit
}

export type ParseErrorCode = 'EMPTY_FILE' | 'PARSE_ERROR' | 'TOO_MANY_ROWS' | 'FILE_TOO_LARGE';

export class ParseError extends Error {
  code: ParseErrorCode;
  constructor(code: ParseErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'ParseError';
  }
}

/** What every parser returns. */
export interface ParseOutput {
  rows: ParsedRow[];
  /** Human-readable things the user should know about how the file was interpreted. */
  notes: string[];
  /** Lines that looked like transactions but could not be read (best-effort formats only). */
  skipped: number;
}
