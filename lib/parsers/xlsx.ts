import readXlsxFile from 'read-excel-file/node';
import { mapTable } from './tabular';
import { ParseError, type ParseOutput } from './types';

const MAX_ENTRIES = 500;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_SHEETS_TRIED = 5;

/**
 * A .xlsx is a zip. Before decompressing anything, read the zip's central
 * directory and refuse archives that declare an absurd expansion (zip bombs
 * would otherwise exhaust a serverless function's memory). Declared sizes
 * can be forged, so the library's own limits remain the second line of defence.
 */
export function assertSaneZip(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22 || view.getUint32(0, true) !== 0x04034b50) {
    throw new ParseError('PARSE_ERROR', 'This is not a valid .xlsx file.');
  }
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new ParseError('PARSE_ERROR', 'This .xlsx file is damaged (no zip directory).');

  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || offset === 0xffffffff) {
    throw new ParseError('PARSE_ERROR', 'ZIP64 spreadsheets are not supported.');
  }
  if (entries > MAX_ENTRIES) throw new ParseError('PARSE_ERROR', 'This spreadsheet has too many internal parts.');

  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new ParseError('PARSE_ERROR', 'This .xlsx file is damaged (bad zip directory).');
    }
    total += view.getUint32(offset + 24, true);
    if (total > MAX_UNCOMPRESSED_BYTES) {
      throw new ParseError('PARSE_ERROR', 'This spreadsheet expands to too much data to import safely.');
    }
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
}

/** First worksheet (of the first few) that looks like a statement. */
export async function parseXlsx(bytes: Uint8Array): Promise<ParseOutput> {
  assertSaneZip(bytes);
  let sheets: { sheet: string; data: unknown[][] }[];
  try {
    sheets = (await readXlsxFile(Buffer.from(bytes))) as unknown as { sheet: string; data: unknown[][] }[];
  } catch (err) {
    throw new ParseError('PARSE_ERROR', `Could not read the spreadsheet: ${(err as Error).message}`);
  }
  if (sheets.length === 0) throw new ParseError('EMPTY_FILE', 'The spreadsheet has no sheets.');

  let lastError: ParseError | null = null;
  for (const { data } of sheets.slice(0, MAX_SHEETS_TRIED)) {
    if (!data || data.length === 0) continue;
    try {
      return mapTable(data);
    } catch (err) {
      if (!(err instanceof ParseError)) throw err;
      lastError = err;
    }
  }
  throw lastError ?? new ParseError('EMPTY_FILE', 'The spreadsheet is empty.');
}
