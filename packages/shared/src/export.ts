import { z } from 'zod';

// Filters on dueDate (not createdAt) — see README for the reasoning: due
// date is the business-meaningful date already surfaced everywhere else in
// the UI (dashboard, orders table), whereas createdAt is an implementation
// detail. Both bounds are optional; omitting either exports an open-ended
// range.
export const exportOrdersQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: '"from" must be on or before "to"',
    path: ['from'],
  });

export type ExportOrdersQuery = z.infer<typeof exportOrdersQuerySchema>;
