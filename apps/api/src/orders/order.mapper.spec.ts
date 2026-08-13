import { toOrderResponse } from './order.mapper';
import { OrderDocument } from './schemas/order.schema';

function fakeOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'order-1',
    customer: 'Acme',
    dueDate: new Date('2026-08-18T00:00:00Z'),
    lineItems: [{ description: 'Widget', quantity: 2, unitPrice: 500 }],
    subtotal: 1000,
    total: 1000,
    amountPaid: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as OrderDocument;
}

describe('toOrderResponse', () => {
  it('computes amountDue and marks the order editable when nothing has been paid', () => {
    const res = toOrderResponse(fakeOrder(), new Date('2026-08-17T00:00:00Z'));
    expect(res.amountDue).toBe(1000);
    expect(res.editable).toBe(true);
    expect(res.status).toBe('pending');
  });

  it('marks the order read-only once a payment has landed', () => {
    const res = toOrderResponse(
      fakeOrder({ amountPaid: 400 }),
      new Date('2026-08-17T00:00:00Z'),
    );
    expect(res.amountDue).toBe(600);
    expect(res.editable).toBe(false);
    expect(res.status).toBe('partially_paid');
  });

  it('reports paid + amountDue 0 once fully settled, even past the due date', () => {
    const res = toOrderResponse(
      fakeOrder({ amountPaid: 1000 }),
      new Date('2026-08-20T00:00:00Z'),
    );
    expect(res.amountDue).toBe(0);
    expect(res.status).toBe('paid');
  });
});
