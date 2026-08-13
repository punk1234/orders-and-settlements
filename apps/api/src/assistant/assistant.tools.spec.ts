import { executeAssistantTool } from './assistant.tools';

describe('executeAssistantTool', () => {
  const order = {
    id: 'order-1',
    customer: 'Acme',
    dueDate: new Date('2026-08-01'),
    lineItems: [{ description: 'Widget', quantity: 1, unitPrice: 100 }],
    subtotal: 100,
    total: 100,
    amountPaid: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('dispatches list_orders with the status filter and marks the result as matchedOrders', async () => {
    const ordersService = { findAllForUser: jest.fn().mockResolvedValue([order]) };
    const paymentsService = {};

    const result = await executeAssistantTool(
      ordersService as never,
      paymentsService as never,
      'user-1',
      'list_orders',
      { status: 'pending' },
    );

    expect(ordersService.findAllForUser).toHaveBeenCalledWith('user-1', 'pending');
    expect(result.matchedOrders).toHaveLength(1);
    expect(result.output).toEqual(result.matchedOrders);
  });

  it('dispatches get_order_payments scoped to the given order', async () => {
    const ordersService = {};
    const paymentsService = {
      listForOrder: jest.fn().mockResolvedValue([{ id: 'p1', amount: 50, date: new Date() }]),
    };

    const result = await executeAssistantTool(
      ordersService as never,
      paymentsService as never,
      'user-1',
      'get_order_payments',
      { orderId: 'order-1' },
    );

    expect(paymentsService.listForOrder).toHaveBeenCalledWith('user-1', 'order-1');
    expect(result.matchedOrders).toBeUndefined();
    expect(Array.isArray(result.output)).toBe(true);
  });

  it('returns an error payload for an unknown tool name instead of throwing', async () => {
    const result = await executeAssistantTool({} as never, {} as never, 'user-1', 'delete_everything', {});
    expect(result.output).toEqual({ error: 'Unknown tool: delete_everything' });
  });
});
