import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parseCsv, parseDelimited } from '@/lib/parsers/csv';
import { parseQif } from '@/lib/parsers/qif';
import { parseOfx } from '@/lib/parsers/ofx';
import { detectDateOrder, parseAmount, parseDate } from '@/lib/parsers/values';
import { ParseError } from '@/lib/parsers/types';
import { detectFormat } from '@/lib/import/formats';

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, '../fixtures', `${name}.csv`), 'utf8');
const snapshot = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/snapshots', `${name}.rows.json`), 'utf8'));

describe('regression: existing fixtures parse exactly as before (keeps dedupe keys stable)', () => {
  for (const name of ['sample-statement', 'sample-statement-month2']) {
    it(`${name}.csv`, () => {
      const out = parseDelimited(fixture(name));
      expect(out.rows).toEqual(snapshot(name));
      expect(out.notes).toEqual([]); // no automatic sign flip
    });
  }
});

describe('parseAmount', () => {
  it.each([
    ['12.34', 12.34],
    ['$1,234.56', 1234.56],
    ['-45.00', -45],
    ['(12.34)', -12.34],
    ['12.34-', -12.34],
    ['12,50', 12.5],
    ['45.00 CR', -45],
    ['45.00DR', 45],
    ['-$3.10', -3.1],
    [7, 7],
  ])('%s -> %s', (input, expected) => expect(parseAmount(input)).toBe(expected));
  it.each(['', 'abc', '--', '1.2.3', null, undefined])('rejects %s', (input) => expect(parseAmount(input)).toBeNull());
});

describe('parseDate', () => {
  it.each([
    ['2026-09-03', '2026-09-03'],
    ['2026-09-03T14:00:00Z', '2026-09-03'],
    ['09/03/2026', '2026-09-03'],
    ['9/3/26', '2026-09-03'],
    ['3-Sep-2026', '2026-09-03'],
    ['Sep 3, 2026', '2026-09-03'],
    ['3 September 2026', '2026-09-03'],
    ['20260903', '2026-09-03'],
    ['46268', '2026-09-03'], // Excel serial
  ])('%s -> %s', (input, expected) => expect(parseDate(input)).toBe(expected));
  it('is not shifted by the server time zone', () => {
    expect(parseDate('01/01/2026')).toBe('2026-01-01');
    expect(parseDate('12/31/2026')).toBe('2026-12-31');
  });
  it('rejects impossible dates', () => {
    expect(parseDate('02/30/2026')).toBeNull();
    expect(parseDate('13/45/2026')).toBeNull();
    expect(parseDate('hello')).toBeNull();
  });
  it('day-first only when a value proves it', () => {
    expect(detectDateOrder(['03/09/2026', '25/09/2026'])).toBe('DMY');
    expect(detectDateOrder(['03/09/2026', '09/25/2026'])).toBe('MDY');
    expect(detectDateOrder(['03/09/2026'])).toBe('MDY');
    expect(parseDate('25/09/2026', 'DMY')).toBe('2026-09-25');
  });
});

describe('real-world delimited layouts', () => {
  it('Chase card style (negative = spending): flips, and says so', () => {
    const csv = [
      'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
      '09/03/2026,09/04/2026,WHOLE FOODS,Groceries,Sale,-72.40,',
      '09/05/2026,09/06/2026,NETFLIX.COM,Entertainment,Sale,-15.49,',
      '09/07/2026,09/08/2026,SHELL OIL,Gas,Sale,-41.10,',
      '09/09/2026,09/10/2026,PAYMENT THANK YOU,,Payment,200.00,',
    ].join('\n');
    const out = parseDelimited(csv);
    expect(out.rows.map((r) => r.amount)).toEqual([72.4, 15.49, 41.1, -200]);
    expect(out.rows[0].date).toBe('2026-09-03'); // Transaction Date, not Post Date
    expect(out.notes).toHaveLength(1);
  });

  it('Amex style (positive = spending): left as is, no note', () => {
    const csv = ['Date,Description,Amount', '09/03/2026,UBER EATS,23.10', '09/04/2026,SAFEWAY,54.00', '09/05/2026,REFUND,-10.00'].join('\n');
    const out = parseDelimited(csv);
    expect(out.rows.map((r) => r.amount)).toEqual([23.1, 54, -10]);
    expect(out.notes).toEqual([]);
  });

  it('separate Debit/Credit columns: sign is defined, never flipped', () => {
    const csv = [
      'Date,Description,Debit,Credit,Balance',
      '2026-09-01,GROCERY,50.00,,950.00',
      '2026-09-02,PAYROLL,,2000.00,2950.00',
      '2026-09-03,RENT,1200.00,,1750.00',
      '2026-09-04,GAS,30.00,,1720.00',
    ].join('\n');
    const out = parseDelimited(csv);
    expect(out.rows.map((r) => r.amount)).toEqual([50, -2000, 1200, 30]);
    expect(out.notes).toEqual([]);
  });

  it('skips account-info lines above the header and footer/total rows', () => {
    const csv = [
      'Account: Everyday Checking',
      'Statement for September 2026',
      '',
      'Date,Description,Amount',
      '2026-09-01,COFFEE,4.50',
      '2026-09-02,LUNCH,12.00',
      ',Total,16.50',
    ].join('\n');
    expect(parseDelimited(csv).rows).toHaveLength(2);
  });

  it('tab-, semicolon- and pipe-separated text', () => {
    const rows = [['Date', 'Description', 'Amount'], ['2026-09-01', 'COFFEE', '4.50'], ['2026-09-02', 'LUNCH', '12.00']];
    for (const sep of ['\t', ';', '|']) {
      const out = parseDelimited(rows.map((r) => r.join(sep)).join('\n'));
      expect(out.rows).toHaveLength(2);
      expect(out.rows[1]).toEqual({ date: '2026-09-02', merchantRaw: 'LUNCH', amount: 12 });
    }
  });

  it('UTF-8 BOM and quoted commas', () => {
    const csv = '﻿Date,Description,Amount\n2026-09-01,"ACME, INC. #12",4.50\n';
    expect(parseCsv(csv)).toEqual([{ date: '2026-09-01', merchantRaw: 'ACME, INC. #12', amount: 4.5 }]);
  });

  it('day-first dates are read correctly when the file proves it', () => {
    const csv = ['Date,Description,Amount', '25/09/2026,A,1.00', '03/10/2026,B,2.00'].join('\n');
    expect(parseCsv(csv).map((r) => r.date)).toEqual(['2026-09-25', '2026-10-03']);
  });

  it('still rejects genuinely bad rows and unknown headers (typed errors)', () => {
    expect(() => parseCsv('Date,Description,Amount\nnot-a-date,X,abc\n2026-09-01,Y,3.00')).toThrow(ParseError);
    expect(() => parseCsv('foo,bar,baz\n1,2,3')).toThrow(/recognizable/);
    expect(() => parseCsv('   ')).toThrow(/empty/i);
    expect(() => parseCsv('Date,Description,Amount\n')).toThrow(ParseError);
  });
});

describe('QIF', () => {
  const qif = [
    '!Type:CCard',
    "D9/3'26", 'T-72.40', 'PWHOLE FOODS', 'MGroceries', '^',
    "D9/ 5'26", 'T-15.49', 'PNETFLIX', '^',
    'D09/09/2026', 'T200.00', 'PPAYMENT THANK YOU', '^',
  ].join('\n');

  it('negative T = spending (sign is defined, so no flip)', () => {
    expect(parseQif(qif).rows).toEqual([
      { date: '2026-09-03', merchantRaw: 'WHOLE FOODS', amount: 72.4 },
      { date: '2026-09-05', merchantRaw: 'NETFLIX', amount: 15.49 },
      { date: '2026-09-09', merchantRaw: 'PAYMENT THANK YOU', amount: -200 },
    ]);
  });
  it('skips investment sections and the account list', () => {
    const text = ['!Account', 'NChecking', '^', '!Type:Invst', 'D1/1/2026', 'NBuy', 'T100', '^', qif].join('\n');
    expect(parseQif(text).rows).toHaveLength(3);
  });
  it('rejects non-QIF text', () => {
    expect(() => parseQif('hello world')).toThrow(ParseError);
  });
});

describe('OFX / QFX', () => {
  it('QFX uses the OFX parser; negative TRNAMT = spending', () => {
    const ofx = [
      'OFXHEADER:100', 'DATA:OFXSGML', 'VERSION:102', 'SECURITY:NONE', 'ENCODING:USASCII', 'CHARSET:1252', 'COMPRESSION:NONE', 'OLDFILEUID:NONE', 'NEWFILEUID:NONE', '',
      '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>',
      '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260903120000<TRNAMT>-72.40<FITID>1<NAME>WHOLE FOODS</STMTTRN>',
      '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
    ].join('\n');
    expect(parseOfx(ofx)).toEqual([{ date: '2026-09-03', merchantRaw: 'WHOLE FOODS', amount: 72.4 }]);
  });
});

describe('detectFormat', () => {
  it.each([
    ['a.csv', 'CSV'], ['A.TSV', 'CSV'], ['x.txt', 'CSV'], ['s.ofx', 'OFX'], ['s.QFX', 'OFX'],
    ['s.qif', 'QIF'], ['b.xlsx', 'XLSX'], ['b.PDF', 'PDF'],
  ])('%s -> %s', (name, fmt) => expect(detectFormat(name)).toBe(fmt));
  it.each(['a.xls', 'a.exe', 'noext', 'a.csv.exe'])('rejects %s', (name) => expect(detectFormat(name)).toBeNull());
});
