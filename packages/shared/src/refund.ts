import { z } from 'zod';

// Deliberately its own schema (not a reuse of createPaymentSchema) even
// though the shape is identical today — refunds and payments are different
// business events (see README) and keeping them separate lets one evolve
// (e.g. requiring a reason) without touching the other.
export const createRefundSchema = z.object({
  amount: z.number().min(0.01, 'Amount must be at least 0.01'),
  date: z.coerce.date(),
  note: z.string().trim().max(500).optional(),
});

export type CreateRefundInput = z.infer<typeof createRefundSchema>;
