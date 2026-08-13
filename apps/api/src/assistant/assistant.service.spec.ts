import { AssistantService } from './assistant.service';

function buildService(apiKey: string | undefined, ordersServiceMock: unknown, paymentsServiceMock: unknown = {}) {
  const configService = {
    get: (key: string) => {
      if (key === 'ANTHROPIC_API_KEY') return apiKey;
      if (key === 'ANTHROPIC_MODEL') return 'test-model';
      return undefined;
    },
  };

  return new AssistantService(configService as never, ordersServiceMock as never, paymentsServiceMock as never);
}

function textResponse(text: string) {
  return { content: [{ type: 'text', text }] };
}

function toolUseResponse(name: string, input: Record<string, unknown>, id = 'tool-1') {
  return { content: [{ type: 'tool_use', id, name, input }] };
}

describe('AssistantService', () => {
  it('throws ASSISTANT_UNAVAILABLE when no API key is configured', async () => {
    const service = buildService(undefined, {});
    await expect(service.query('user-1', 'How much do I have overdue?')).rejects.toThrow(
      'The assistant is not configured on this deployment (missing ANTHROPIC_API_KEY).',
    );
  });

  it('returns the model text directly when it needs no tools', async () => {
    const service = buildService('key', {});
    const create = jest.fn().mockResolvedValue(textResponse('You have no orders yet.'));
    (service as unknown as { client: unknown }).client = { messages: { create } };

    const result = await service.query('user-1', 'Do I have any orders?');

    expect(result.answer).toBe('You have no orders yet.');
    expect(result.orders).toEqual([]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('executes list_orders, feeds the result back, and returns the final answer with matched orders', async () => {
    const fakeOrder = { id: 'order-1', customer: 'Acme', status: 'overdue' };
    const ordersServiceMock = {
      findAllForUser: jest.fn().mockResolvedValue([
        {
          id: 'order-1',
          customer: 'Acme',
          dueDate: new Date('2026-08-01'),
          lineItems: [],
          subtotal: 500,
          total: 500,
          amountPaid: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    };
    const service = buildService('key', ordersServiceMock);

    const create = jest
      .fn()
      .mockResolvedValueOnce(toolUseResponse('list_orders', { status: 'overdue' }))
      .mockResolvedValueOnce(textResponse('You have 1 overdue order: Acme, $500 due.'));
    (service as unknown as { client: unknown }).client = { messages: { create } };

    const result = await service.query('user-1', 'What is overdue?');

    expect(ordersServiceMock.findAllForUser).toHaveBeenCalledWith('user-1', 'overdue');
    expect(result.answer).toBe('You have 1 overdue order: Acme, $500 due.');
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].customer).toBe('Acme');
    expect(create).toHaveBeenCalledTimes(2);
    void fakeOrder;
  });

  it('wraps a persistent Anthropic API failure as a clean ASSISTANT_UNAVAILABLE (no retry on 4xx)', async () => {
    const service = buildService('key', {});
    const authError = Object.assign(new Error('invalid x-api-key'), { status: 401 });
    const create = jest.fn().mockRejectedValue(authError);
    (service as unknown as { client: unknown }).client = { messages: { create } };

    await expect(service.query('user-1', 'anything')).rejects.toThrow(
      'The assistant is temporarily unavailable. Please try again shortly.',
    );
    // 401 isn't retryable, so this should fail on the first attempt only.
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('gives up with ASSISTANT_ERROR if the model never stops requesting tools', async () => {
    const ordersServiceMock = { findAllForUser: jest.fn().mockResolvedValue([]) };
    const service = buildService('key', ordersServiceMock);

    const create = jest.fn().mockResolvedValue(toolUseResponse('list_orders', {}));
    (service as unknown as { client: unknown }).client = { messages: { create } };

    await expect(service.query('user-1', 'loop forever')).rejects.toThrow(
      'The assistant could not produce an answer. Please try rephrasing your question.',
    );
  });
});
