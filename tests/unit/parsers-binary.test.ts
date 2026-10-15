import { describe, expect, it } from 'vitest';
import { parseXlsx, assertSaneZip } from '@/lib/parsers/xlsx';
import { parsePdf, extractTransactions } from '@/lib/parsers/pdf';
import { ParseError } from '@/lib/parsers/types';
import { makePdf, makeXlsx } from '../helpers/make-files';

describe('XLSX', () => {
  it('reads date cells, numeric amounts and text', async () => {
    const bytes = await makeXlsx([
      ['Date', 'Description', 'Amount'],
      [new Date(Date.UTC(2026, 8, 3)), 'KROGER', 38.9],
      ['2026-09-04', 'TRADER JOES', 61.15],
    ]);
    const out = await parseXlsx(bytes);
    expect(out.rows).toEqual([
      { date: '2026-09-03', merchantRaw: 'KROGER', amount: 38.9 },
      { date: '2026-09-04', merchantRaw: 'TRADER JOES', amount: 61.15 },
    ]);
  });

  it('finds the header below a title block and handles Debit/Credit', async () => {
    const bytes = await makeXlsx([
      ['My Bank'],
      ['Account 1234'],
      ['Posting Date', 'Details', 'Debit', 'Credit'],
      ['2026-09-01', 'GROCERY', 50, ''],
      ['2026-09-02', 'PAYROLL', '', 2000],
    ]);
    expect((await parseXlsx(bytes)).rows.map((r) => r.amount)).toEqual([50, -2000]);
  });

  it('rejects a file that is not a zip, without throwing a raw error', async () => {
    await expect(parseXlsx(new TextEncoder().encode('Date,Description,Amount\n'))).rejects.toBeInstanceOf(ParseError);
  });

  it('rejects a zip that declares an absurd expansion (zip bomb guard)', () => {
    // One central-directory entry declaring 200 MB uncompressed.
    const name = 'a.xml';
    const local = new Uint8Array(30);
    local.set([0x50, 0x4b, 0x03, 0x04], 0);
    const cd = new Uint8Array(46 + name.length);
    const cdv = new DataView(cd.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint32(24, 200 * 1024 * 1024, true);
    cdv.setUint16(28, name.length, true);
    cd.set(new TextEncoder().encode(name), 46);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, 1, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(12, cd.length, true);
    ev.setUint32(16, local.length, true);
    const bomb = new Uint8Array(local.length + cd.length + eocd.length);
    bomb.set(local, 0);
    bomb.set(cd, local.length);
    bomb.set(eocd, local.length + cd.length);
    expect(() => assertSaneZip(bomb)).toThrow(/too much data/);
  });
});

describe('PDF', () => {
  it('credit-card layout: two dates, amounts as printed, year from the statement period', async () => {
    const pdf = await makePdf(
      [
        ['Statement Period 12/15/2025 - 01/14/2026'],
        ['Trans Date', 'Post Date', 'Description', 'Amount'],
        ['12/20', '12/21', 'WHOLE FOODS MARKET', '$72.40'],
        ['01/03', '01/04', 'NETFLIX.COM', '$15.49'],
        ['01/05', '01/06', 'PAYMENT THANK YOU', '-$500.00'],
        ['Total fees this period', '$0.00'],
      ],
      [40, 110, 180, 420],
    );
    const out = await parsePdf(pdf);
    expect(out.rows).toEqual([
      { date: '2025-12-20', merchantRaw: 'WHOLE FOODS MARKET', amount: 72.4 },
      { date: '2026-01-03', merchantRaw: 'NETFLIX.COM', amount: 15.49 },
      { date: '2026-01-05', merchantRaw: 'PAYMENT THANK YOU', amount: -500 },
    ]);
    expect(out.notes[0]).toMatch(/best-effort/i);
  });

  it('checking layout with running balance: sign comes from the balance change', async () => {
    const pdf = await makePdf(
      [
        ['Statement Period 09/01/2026 - 09/30/2026'],
        ['09/01/2026', 'Beginning Balance', '1,000.00'],
        ['09/02/2026', 'GROCERY OUTLET', '50.00', '950.00'],
        ['09/03/2026', 'ACME PAYROLL', '2,000.00', '2,950.00'],
        ['09/04/2026', 'RENT', '1,200.00', '1,750.00'],
      ],
      [40, 110, 330, 420],
    );
    const out = await parsePdf(pdf);
    expect(out.rows.map((r) => [r.merchantRaw, r.amount])).toEqual([
      ['GROCERY OUTLET', 50],
      ['ACME PAYROLL', -2000],
      ['RENT', 1200],
    ]);
  });

  it('counts lines that look like transactions but cannot be read', () => {
    const out = extractTransactions(['09/02/2026 COFFEE SHOP 4.50', '09/03/2026 MYSTERY LINE WITH NO MONEY', '09/04/2026 LUNCH 12.00']);
    expect(out.rows).toHaveLength(2);
    expect(out.skipped).toBe(1);
  });

  it('a PDF with no text layer is refused with a clear message', async () => {
    const empty = await makePdf([]);
    await expect(parsePdf(empty)).rejects.toThrow(/no selectable text/i);
  });

  it('not a PDF / garbage', async () => {
    await expect(parsePdf(new TextEncoder().encode('hello'))).rejects.toBeInstanceOf(ParseError);
    await expect(parsePdf(new TextEncoder().encode('%PDF-1.4 garbage'))).rejects.toBeInstanceOf(ParseError);
  });
});
