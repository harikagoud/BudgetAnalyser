import { NextRequest, NextResponse } from 'next/server';
import { getUserId, unauthorized } from '@/lib/auth/request';
import { deleteImportBatch } from '@/lib/import/manage';

export const dynamic = 'force-dynamic';

/** Delete one uploaded statement and the transactions it added. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();
  const result = await deleteImportBatch(userId, params.id);
  if (!result) {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'Upload not found.' }, { status: 404 });
  }
  return NextResponse.json(result);
}
