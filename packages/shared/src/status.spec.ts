import { deriveOrderStatus } from './status';
import { computeOrderTotals } from './order';

describe('deriveOrderStatus', () => {
  const dueDate = new Date('2026-08-18T00:00:00Z');
  const before = new Date('2026-08-17T00:00:00Z'); // before due date
  const after = new Date('2026-08-19T00:00:00Z'); // after due date

  it('is pending when no payments and not past due', () => {
    expect(
      deriveOrderStatus({ total: 1000, amountPaid: 0, dueDate, now: before }),
    ).toBe('pending');
  });

  it('is partially_paid when some payment recorded and not past due', () => {
    expect(
      deriveOrderStatus({ total: 1000, amountPaid: 400, dueDate, now: before }),
    ).toBe('partially_paid');
  });

  it('is paid when amountPaid equals total', () => {
    expect(
      deriveOrderStatus({ total: 1000, amountPaid: 1000, dueDate, now: before }),
    ).toBe('paid');
  });

  it('is overdue when past due date and not fully paid (no payments)', () => {
    expect(
      deriveOrderStatus({ total: 1000, amountPaid: 0, dueDate, now: after }),
    ).toBe('overdue');
  });

  it('is overdue when past due date and partially paid', () => {
    expect(
      deriveOrderStatus({ total: 1000, amountPaid: 400, dueDate, now: after }),
    ).toBe('overdue');
  });

  it('is paid, not overdue, when fully paid even after the due date has passed', () => {
    // The documented edge case: paid takes precedence over overdue.
    expect(
      deriveOrderStatus({ total: 1000, amountPaid: 1000, dueDate, now: after }),
    ).toBe('paid');
  });
});

describe('computeOrderTotals', () => {
  it('sums quantity * unitPrice across all lines', () => {
    const { subtotal, total } = computeOrderTotals([
      { description: 'Widget', quantity: 2, unitPrice: 500 },
    ]);
    expect(subtotal).toBe(1000);
    expect(total).toBe(1000);
  });

  it('handles multiple line items', () => {
    const { subtotal } = computeOrderTotals([
      { description: 'A', quantity: 3, unitPrice: 10.5 },
      { description: 'B', quantity: 1, unitPrice: 99.99 },
    ]);
    expect(subtotal).toBe(131.49);
  });
});
