import { deriveOrderStatus, OrderStatus } from '@orders/shared';
import { OrderDocument } from './schemas/order.schema';

export interface OrderResponse {
  id: string;
  customer: string;
  dueDate: Date;
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  status: OrderStatus;
  editable: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export function toOrderResponse(order: OrderDocument, now = new Date()): OrderResponse {
  const status = deriveOrderStatus({
    total: order.total,
    amountPaid: order.amountPaid,
    dueDate: order.dueDate,
    now,
  });

  return {
    id: order.id,
    customer: order.customer,
    dueDate: order.dueDate,
    lineItems: order.lineItems.map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
    })),
    subtotal: order.subtotal,
    total: order.total,
    amountPaid: order.amountPaid,
    amountDue: Math.round((order.total - order.amountPaid) * 100) / 100,
    status,
    // Orders become read-only once the first payment lands (documented in README).
    editable: order.amountPaid === 0,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
