import { PDFDocument, StandardFonts } from 'pdf-lib';
import writeXlsxFile from 'write-excel-file/node';

/** Builds a text-layer PDF. Each line is a list of columns drawn at fixed x positions, like a bank statement. */
export async function makePdf(lines: string[][], columnX = [40, 110, 330, 420, 500]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([612, 792]);
  let y = 750;
  for (const cols of lines) {
    if (y < 40) {
      page = doc.addPage([612, 792]);
      y = 750;
    }
    cols.forEach((text, i) => page.drawText(text, { x: columnX[i] ?? 40 + i * 90, y, size: 9, font }));
    y -= 14;
  }
  return doc.save();
}

/** A real .xlsx from rows of cells (strings, numbers, Dates). */
export async function makeXlsx(rows: (string | number | Date)[][]): Promise<Uint8Array> {
  const data = rows.map((row) =>
    row.map((value) => {
      if (value instanceof Date) return { value, type: Date, format: 'yyyy-mm-dd' };
      if (typeof value === 'number') return { value, type: Number };
      return { value, type: String };
    }),
  );
  const out = await writeXlsxFile(data as never).toBuffer();
  return new Uint8Array(out);
}
