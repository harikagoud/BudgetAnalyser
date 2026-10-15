import { z } from 'zod';

export const MAX_LIMIT_DOLLARS = 1_000_000;

export const SetLimitSchema = z.object({
  categoryId: z.string().min(1).max(64),
  // Whole cents only, so what the user types is what is compared.
  amount: z
    .number()
    .finite()
    .gt(0)
    .max(MAX_LIMIT_DOLLARS)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'At most 2 decimal places'),
});

export const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
