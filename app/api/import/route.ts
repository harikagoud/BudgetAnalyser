import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { importStatement, ParseError } from '@/lib/import/importStatement';
import { ImportRequestSchema } from '@/lib/validation/import';
import { logger } from '@/lib/logger';
import { getUserId, unauthorized } from '@/lib/auth/request';
import { getOwnedAccount } from '@/lib/accounts';
import { MAX_UPLOAD_BYTES } from '@/lib/import/limits';
import { alertsForImportBatch } from '@/lib/budget/service';
import { BINARY_FORMATS, detectFormat, FORMAT_LABEL } from '@/lib/import/formats';

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

    const format = detectFormat(file.name);
    if (!format) {
      return NextResponse.json(
        {
          error: 'UNRECOGNIZED_FORMAT',
          message: `Unsupported file type. Supported: ${FORMAT_LABEL}.`,
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

    // Read bytes once (size already capped above). Binary formats are verified by
    // their signature, not just the extension, before any parser touches them.
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    if (BINARY_FORMATS.has(format) && !hasExpectedSignature(format, fileBytes)) {
      throw new ParseError('PARSE_ERROR', `This file does not look like a real ${format === 'PDF' ? 'PDF' : '.xlsx'} file.`);
    }

    const result = await importStatement({
      userId,
      accountId,
      fileName: file.name,
      fileBytes,
      format,
    });

    // Tell the user right away if this import pushed a category to/over its limit.
    // Best-effort: an alert failure must never fail an import that already succeeded.
    const budgetAlerts = await alertsForImportBatch(undefined, userId, result.importBatchId).catch((err) => {
      logger.error({ err: (err as Error).message }, 'Could not compute budget alerts after import');
      return [];
    });

    return NextResponse.json({ ...result, budgetAlerts }, { status: 200 });
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

function hasExpectedSignature(format: 'XLSX' | 'PDF' | string, bytes: Uint8Array): boolean {
  if (format === 'PDF') return bytes.length > 4 && String.fromCharCode(...Array.from(bytes.slice(0, 5))) === '%PDF-';
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04; // "PK\x03\x04"
}
