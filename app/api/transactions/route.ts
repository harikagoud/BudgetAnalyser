import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month'); // YYYY-MM
  const accountId = searchParams.get('accountId') ?? undefined;

  const where: Record<string, unknown> = {};
  if (accountId) where.accountId = accountId;
  if (month) {
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    where.date = { gte: start, lt: end };
  }

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { date: 'desc' },
    include: { category: { select: { id: true, name: true } } },
  });

  return NextResponse.json({
    transactions: transactions.map((t) => ({
      id: t.id,
      date: t.date.toISOString().slice(0, 10),
      amount: t.amount,
      merchantRaw: t.merchantRaw,
      category: t.category,
      categorySource: t.categorySource,
    })),
  });
}
