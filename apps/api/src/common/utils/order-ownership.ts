import { HttpStatus } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { AppException } from '../exceptions/app.exception';
import { OrderDocument } from '../../orders/schemas/order.schema';

/**
 * Shared by PaymentsService and RefundsService, both of which need to
 * confirm a caller owns an order before touching its payment/refund
 * history via their own standalone endpoints (GET /orders/:id/payments,
 * GET /orders/:id/refunds). Kept as a free function rather than a shared
 * base class since these services otherwise have nothing else in common.
 *
 * Deliberately 404s (not 403) on a not-owned or malformed id, matching the
 * rest of the API's pattern of not confirming an id's existence to a
 * non-owner.
 */
export async function ensureOrderOwnership(
  orderModel: Model<OrderDocument>,
  userId: string,
  orderId: string,
): Promise<void> {
  if (!Types.ObjectId.isValid(orderId)) {
    throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found.');
  }
  const order = await orderModel.findOne({ _id: orderId, userId: new Types.ObjectId(userId) }).exec();
  if (!order) {
    throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found.');
  }
}
