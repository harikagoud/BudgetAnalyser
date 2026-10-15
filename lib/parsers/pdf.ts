import { extractTextItems, getDocumentProxy } from 'unpdf';
import { applySignHeuristic } from './tabular';
import { ParseError, type ParseOutput, type ParsedRow } from './types';
import { parseAmount, parseDate } from './values';

const MAX_PAGES = 60;
const LINE_TOLERANCE = 3; // PDF points: items this close in y are one line
const WORD_GAP = 1; // PDF points: a bigger gap between fragments becomes a space

/**
 * BEST-EFFORT. Reads the text layer of a statement PDF and pulls out lines
 * shaped like "<date> [<date>] <description> <amount> [<balance>]". Scanned
 * (image) PDFs have no text layer and are not supported (no OCR). Layouts vary
 * by bank; anything line-shaped that cannot be read is counted in `skipped`.
 */
export async function parsePdf(bytes: Uint8Array): Promise<ParseOutput> {
  if (bytes.length < 5 || Array.from(bytes.slice(0, 5)).map((b) => String.fromCharCode(b)).join('') !== '%PDF-') {
    throw new ParseError('PARSE_ERROR', 'This is not a valid PDF file.');
  }
  let pages: Awaited<ReturnType<typeof extractTextItems>>['items'];
  try {
    const doc = await getDocumentProxy(new Uint8Array(bytes));
    if (doc.numPages > MAX_PAGES) {
      throw new ParseError('PARSE_ERROR', `This PDF has ${doc.numPages} pages; the limit is ${MAX_PAGES}.`);
    }
    ({ items: pages } = await extractTextItems(doc));
  } catch (err) {
    if (err instanceof ParseError) throw err;
    throw new ParseError(
      'PARSE_ERROR',
      `Could not read this PDF (it may be encrypted or damaged): ${(err as Error).message}`,
    );
  }

  const lines = pages.flatMap(buildLines);
  if (lines.join('').trim() === '') {
    throw new ParseError(
      'PARSE_ERROR',
      'This PDF has no selectable text (it looks scanned). Scanned statements are not supported; download CSV/OFX/Excel from your bank instead.',
    );
  }
  const out = extractTransactions(lines);
  if (out.rows.length === 0) {
    throw new ParseError(
      'PARSE_ERROR',
      'No transactions were recognized in this PDF. Its layout is not supported; try your bank\'s CSV, OFX or Excel download.',
    );
  }
  out.notes.unshift(
    'PDF import is best-effort: layouts differ by bank. Please check the imported transactions against your statement.',
  );
  return out;
}

interface Item {
  str: string;
  x: number;
  y: number;
  width: number;
}

/** Groups positioned text fragments into visual lines, left-to-right. */
export function buildLines(items: Item[]): string[] {
  const sorted = items.filter((i) => i.str.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: Item[][] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last[0].y - item.y) <= LINE_TOLERANCE) last.push(item);
    else groups.push([item]);
  }
  return groups.map((g) => {
    g.sort((a, b) => a.x - b.x);
    let line = '';
    let prevEnd = -Infinity;
    for (const item of g) {
      if (line && item.x - prevEnd > WORD_GAP && !/^\s/.test(item.str) && !/\s$/.test(line)) line += ' ';
      line += item.str;
      prevEnd = item.x + item.width;
    }
    return line.replace(/\s+/g, ' ').trim();
  });
}

const MONEY = String.raw`[-(]?\$?\d{1,3}(?:,\d{3})*\.\d{2}\)?(?:-|CR|DR)?`;
const TRAILING_MONEY = new RegExp(String.raw`\s+(${MONEY})\s*$`, 'i');
const DATE_AT_START = new RegExp(
  String.raw`^(?:(\d{1,2}/\d{1,2}(?:/\d{2,4})?)|(\d{4}-\d{2}-\d{2})|((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}(?:,? \d{4})?)|(\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?: \d{4})?))(?=\s)`,
  'i',
);
const NOT_A_TRANSACTION =
  /\b(?:beginning|opening|ending|closing|previous|new|statement|starting) balance\b|\bbalance (?:forward|brought forward|carried forward)\b|^total\b|\bsubtotal\b|\bminimum payment\b|\bcredit limit\b/i;
const CREDIT_WORDS = /deposit|payroll|direct dep|refund|interest paid|transfer from|payment received|credit|reversal|cashback|cash back/i;

function normalizeLine(line: string): string {
  return line
    .replace(/(\d)\s+(CR|DR)\b/gi, '$1$2')
    .replace(/-\s+\$/g, '-$')
    .replace(/\$\s+(\d)/g, '$$$1');
}

interface YearContext {
  startYear: number;
  startMonth: number;
  endYear: number;
}

function yearContext(lines: string[]): YearContext {
  const text = lines.slice(0, 80).join('\n');
  const range = /(\d{1,2})\/\d{1,2}\/(\d{2,4})\s*(?:-|–|to|through)\s*\d{1,2}\/\d{1,2}\/(\d{2,4})/i.exec(text);
  if (range) {
    const fy = (y: string) => (y.length === 2 ? 2000 + +y : +y);
    return { startYear: fy(range[2]), startMonth: +range[1], endYear: fy(range[3]) };
  }
  const years = Array.from(lines.join('\n').matchAll(/\b(20\d{2})\b/g)).map((m) => +m[1]);
  const counts = new Map<number, number>();
  for (const y of years) counts.set(y, (counts.get(y) ?? 0) + 1);
  const common = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? new Date().getUTCFullYear();
  return { startYear: common, startMonth: 1, endYear: common };
}

function resolveDate(raw: string, ctx: YearContext): string | null {
  const dayMonth = /^(\d{1,2})\/(\d{1,2})$/.exec(raw);
  if (dayMonth) {
    const month = +dayMonth[1];
    const year = ctx.startYear !== ctx.endYear && month < ctx.startMonth ? ctx.endYear : ctx.startYear;
    return parseDate(`${dayMonth[1]}/${dayMonth[2]}/${year}`, 'MDY');
  }
  const named = /^([A-Za-z]+)\.? (\d{1,2})$/.exec(raw) ?? /^(\d{1,2}) ([A-Za-z]+)$/.exec(raw);
  if (named) {
    const [a, b] = [named[1], named[2]];
    const month = /^\d/.test(a) ? b : a;
    const day = /^\d/.test(a) ? a : b;
    const mi = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(month.slice(0, 3).toLowerCase());
    if (mi === -1) return null;
    const year = ctx.startYear !== ctx.endYear && mi + 1 < ctx.startMonth ? ctx.endYear : ctx.startYear;
    return parseDate(`${month.slice(0, 3)} ${day}, ${year}`);
  }
  return parseDate(raw, 'MDY');
}

interface Candidate {
  date: string;
  description: string;
  tokens: number[];
}

export function extractTransactions(rawLines: string[]): ParseOutput {
  const lines = rawLines.map(normalizeLine);
  const ctx = yearContext(lines);
  const candidates: Candidate[] = [];
  let skipped = 0;

  for (const line of lines) {
    const dm = DATE_AT_START.exec(line);
    if (!dm) continue;
    let rest = line.slice(dm[0].length).trim();
    const date = resolveDate(dm[0].trim(), ctx);
    // Card statements often show a transaction date AND a posting date.
    const second = DATE_AT_START.exec(rest);
    if (second) rest = rest.slice(second[0].length).trim();

    const tokens: number[] = [];
    for (let i = 0; i < 3; i++) {
      const m = TRAILING_MONEY.exec(rest);
      if (!m) break;
      const n = parseAmount(m[1]);
      if (n === null) break;
      tokens.unshift(n);
      rest = rest.slice(0, m.index);
    }
    const description = rest.trim();
    if (NOT_A_TRANSACTION.test(description)) continue;
    if (!date || tokens.length === 0 || !/[A-Za-z]/.test(description)) {
      skipped++;
      continue;
    }
    candidates.push({ date, description, tokens });
  }

  // Layout A: "... <amount> <running balance>": the balance change tells us the sign.
  // Layout B: "... <amount>": sign as printed (purchases positive, credits negative/CR).
  const rows: ParsedRow[] = [];
  const notes: string[] = [];
  const withBalance = candidates.filter((c) => c.tokens.length >= 2).length;
  const balanceMode = withBalance * 2 >= candidates.length && candidates.length > 0;
  let prevBalance: number | null = null;

  for (const c of candidates) {
    if (balanceMode && c.tokens.length >= 2) {
      const amountPrinted = c.tokens[c.tokens.length - 2];
      const balance = c.tokens[c.tokens.length - 1];
      const magnitude = Math.abs(amountPrinted);
      let isExpense: boolean;
      if (prevBalance !== null && Math.abs(Math.abs(balance - prevBalance) - magnitude) < 0.011) {
        isExpense = balance < prevBalance;
      } else if (amountPrinted < 0) {
        isExpense = true;
      } else {
        isExpense = !CREDIT_WORDS.test(c.description);
      }
      prevBalance = balance;
      rows.push({ date: c.date, merchantRaw: c.description, amount: isExpense ? magnitude : -magnitude });
    } else {
      rows.push({ date: c.date, merchantRaw: c.description, amount: c.tokens[c.tokens.length - 1] });
    }
  }
  if (!balanceMode) applySignHeuristic(rows, notes);
  return { rows, notes, skipped };
}
