import { z } from 'zod';

export const ImportRequestSchema = z.object({
  accountId: z.string().min(1),
  accountName: z.string().min(1).optional(),
});

export type ImportRequest = z.infer<typeof ImportRequestSchema>;
