// Which statement files the importer accepts. Constants only (no parser
// imports), so the upload form can use this without pulling pdf.js / xlsx
// readers into the browser or the static mobile bundle.

export type ImportFormat = 'CSV' | 'OFX' | 'QIF' | 'XLSX' | 'PDF';

const EXTENSIONS: Record<string, ImportFormat> = {
  '.csv': 'CSV',
  '.tsv': 'CSV', // delimited text: the delimiter is detected from the content
  '.txt': 'CSV',
  '.ofx': 'OFX',
  '.qfx': 'OFX', // Quicken's OFX flavour
  '.qif': 'QIF',
  '.xlsx': 'XLSX',
  '.pdf': 'PDF',
};

export const ACCEPT_ATTRIBUTE = Object.keys(EXTENSIONS).join(',');
export const FORMAT_LABEL = 'CSV, TSV, TXT, OFX, QFX, QIF, Excel (.xlsx) or PDF';

export function detectFormat(fileName: string): ImportFormat | null {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot === -1 ? null : (EXTENSIONS[lower.slice(dot)] ?? null);
}

export const BINARY_FORMATS: ReadonlySet<ImportFormat> = new Set<ImportFormat>(['XLSX', 'PDF']);
