import { PrismaClient } from '@prisma/client';

// Prisma client singleton. In Next.js dev mode, modules can be re-evaluated
// on every hot reload, which would otherwise exhaust database connections by
// creating a new PrismaClient each time. Caching the instance on `globalThis`
// (dev only) avoids that.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
