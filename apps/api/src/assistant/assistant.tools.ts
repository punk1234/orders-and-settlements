import Anthropic from '@anthropic-ai/sdk';
import { ORDER_STATUSES, OrderStatus } from '@orders/shared';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { toOrderResponse, OrderResponse } from '../orders/order.mapper';
import { toPaymentResponse } from '../payments/payment.mapper';

/**
 * A deliberately small, fixed set of read-only tools. The model can only ever
 * read this user's own orders/payments — there is no tool that writes data,
 * and every tool implementation takes userId from the authenticated request,
 * never from the model's output, so the assistant can't be tricked into
 * touching another user's data no matter what it's asked.
 */
export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_orders',
    description:
      "List the current user's orders with computed status (pending, partially_paid, paid, overdue), " +
      'subtotal/total, amount paid, amount due, and due date. Optionally filter by status.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: [...ORDER_STATUSES],
          description: 'Optional status filter.',
        },
      },
    },
  },
  {
    name: 'get_order_payments',
    description:
      'Get the full payment history (amount, date, note) for one specific order, ' +
      'identified by the order id returned from list_orders.',
    input_schema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'The order id, as returned by list_orders.' },
      },
      required: ['orderId'],
    },
  },
];

export interface ToolExecutionResult {
  output: unknown;
  matchedOrders?: OrderResponse[];
}

export async function executeAssistantTool(
  ordersService: OrdersService,
  paymentsService: PaymentsService,
  userId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  switch (name) {
    case 'list_orders': {
      const status = input.status as OrderStatus | undefined;
      const orders = await ordersService.findAllForUser(userId, status);
      const mapped = orders.map((o) => toOrderResponse(o));
      return { output: mapped, matchedOrders: mapped };
    }
    case 'get_order_payments': {
      const orderId = String(input.orderId ?? '');
      const payments = await paymentsService.listForOrder(userId, orderId);
      return { output: payments.map(toPaymentResponse) };
    }
    default:
      return { output: { error: `Unknown tool: ${name}` } };
  }
}
