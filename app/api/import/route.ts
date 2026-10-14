import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { importStatement, ParseError } from '@/lib/import/importStatement';
import { ImportRequestSchema } from '@/lib/validation/import';
import { logger } from '@/lib/logger';
import { getUserId, unauthorized } from '@/lib/auth/request';
import { getOwnedAccount } from '@/lib/accounts';
import { MAX_UPLOAD_BYTES } from '@/lib/import/limits';

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  // Set only when THIS request created the account, so a failed import can
  // remove the empty account instead of leaving it behind.
  let createdAccountId: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'EMPTY_FILE', message: 'No file was uploaded.' },
        { status: 400 },
      );
    }

    // Reject before reading the file into memory (and before creating any account).
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: 'FILE_TOO_LARGE',
          message: `Statements are limited to ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
        },
        { status: 413 },
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

    let accountId = accountIdField;
    if (accountIdField === 'new') {
      if (!accountName) {
        return NextResponse.json(
          { error: 'INVALID_REQUEST', message: 'accountName is required when accountId is "new".' },
          { status: 400 },
        );
      }
      const account = await prisma.account.create({
        data: { name: accountName, type: 'MANUAL', userId },
      });
      accountId = account.id;
      createdAccountId = account.id;
    } else if (!(await getOwnedAccount(undefined, userId, accountIdField))) {
      // Missing OR someone else's: same answer, so ids can't be probed.
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Account not found.' },
        { status: 404 },
      );
    }

    const fileContent = await file.text();

    const result = await importStatement({
      userId,
      accountId,
      fileName: file.name,
      fileContent,
      format,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (createdAccountId) {
      // importStatement is atomic, so a new account here has no transactions.
      await prisma.account.delete({ where: { id: createdAccountId } }).catch(() => undefined);
    }
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
