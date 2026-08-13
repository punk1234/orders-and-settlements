import { z } from 'zod';

export const createPaymentSchema = z.object({
  amount: z.number().min(0.01, 'Amount must be at least 0.01'),
  date: z.coerce.date(),
  note: z.string().trim().max(500).optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
