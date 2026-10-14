import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { RISK_TOLERANCE_VALUES } from '@/lib/investments/allocation';
import { getUserId, unauthorized } from '@/lib/auth/request';

/**
 * Generic key/value persistence for `UserSetting` (data-model.md). Only one
 * key is recognized today — `riskTolerance` (US4, T050) — but the shape is
 * deliberately generic so future settings (e.g. a persisted account filter)
 * don't need a new route.
 */
const ALLOWED_KEYS: Record<string, readonly string[]> = {
  riskTolerance: RISK_TOLERANCE_VALUES,
};

export async function PUT(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => null);
  const key = body?.key;
  const value = body?.value;

  if (typeof key !== 'string' || typeof value !== 'string') {
    return NextResponse.json(
      { error: 'INVALID_BODY', message: 'Expected JSON body { key: string, value: string }' },
      { status: 400 },
    );
  }

  const allowedValues = ALLOWED_KEYS[key];
  if (!allowedValues) {
    return NextResponse.json(
      { error: 'UNKNOWN_SETTING', message: `Unrecognized setting key: ${key}` },
      { status: 400 },
    );
  }
  if (!allowedValues.includes(value)) {
    return NextResponse.json(
      { error: 'INVALID_VALUE', message: `${key} must be one of: ${allowedValues.join(', ')}` },
      { status: 400 },
    );
  }

  await prisma.userSetting.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, value },
    update: { value },
  });

  return NextResponse.json({ key, value });
}
