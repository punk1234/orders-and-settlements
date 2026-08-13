export const ORDER_STATUSES = [
  'pending',
  'partially_paid',
  'paid',
  'overdue',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Precedence rule (documented in README):
 * 1. paid       - amountPaid >= total (a settled order is never "overdue")
 * 2. overdue    - now > dueDate and not fully paid
 * 3. partially_paid - amountPaid > 0, not past due
 * 4. pending    - no payments, not past due
 *
 * Status is always derived fresh from current time + current amountPaid,
 * never cached as a fact about the past.
 */
export function deriveOrderStatus(params: {
  total: number;
  amountPaid: number;
  dueDate: Date;
  now?: Date;
}): OrderStatus {
  const { total, amountPaid, dueDate } = params;
  const now = params.now ?? new Date();

  if (amountPaid >= total) return 'paid';
  if (now.getTime() > dueDate.getTime()) return 'overdue';
  if (amountPaid > 0) return 'partially_paid';
  return 'pending';
}
