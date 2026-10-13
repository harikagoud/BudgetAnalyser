import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { importStatement, ParseError } from '@/lib/import/importStatement';
import { ImportRequestSchema } from '@/lib/validation/import';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'EMPTY_FILE', message: 'No file was uploaded.' },
        { status: 400 },
      );
    }

    const parsedFields = ImportRequestSchema.safeParse({
      accountId: formData.get('accountId'),
      accountName: formData.get('accountName') ?? undefined,
    });
    if (!parsedFields.success) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: parsedFields.error.message },
        { status: 400 },
      );
    }
    const { accountId: accountIdField, accountName } = parsedFields.data;

    let accountId = accountIdField;
    if (accountIdField === 'new') {
      if (!accountName) {
        return NextResponse.json(
          { error: 'INVALID_REQUEST', message: 'accountName is required when accountId is "new".' },
          { status: 400 },
        );
      }
      const account = await prisma.account.create({
        data: { name: accountName, type: 'MANUAL' },
      });
      accountId = account.id;
    }

    const lowerName = file.name.toLowerCase();
    const format = lowerName.endsWith('.ofx') ? 'OFX' : lowerName.endsWith('.csv') ? 'CSV' : null;
    if (!format) {
      return NextResponse.json(
        {
          error: 'UNRECOGNIZED_FORMAT',
          message: 'Only .csv and .ofx files are supported.',
        },
        { status: 400 },
      );
    }

    const fileContent = await file.text();

    const result = await importStatement({
      accountId,
      fileName: file.name,
      fileContent,
      format,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof ParseError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
    }
    logger.error({ err: (err as Error).message }, 'Unexpected error during import');
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred during import.' },
      { status: 500 },
    );
  }
}
