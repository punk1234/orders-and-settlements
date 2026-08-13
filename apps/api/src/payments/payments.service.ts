import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { CreatePaymentInput, deriveOrderStatus } from '@orders/shared';
import { AppException } from '../common/exceptions/app.exception';
import { ensureOrderOwnership } from '../common/utils/order-ownership';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { AuditService } from '../audit/audit.service';

// Currency amounts are stored as rounded 2-decimal doubles. A tiny epsilon
// absorbs floating point drift (e.g. 0.1 + 0.2 !== 0.3) so an exact final
// payment isn't spuriously rejected. Documented tradeoff: production would
// use integer minor-unit (cents) arithmetic instead.
const EPSILON = 0.005;

@Injectable()
export class PaymentsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    private readonly auditService: AuditService,
  ) {}

  async recordPayment(
    userId: string,
    orderId: string,
    input: CreatePaymentInput,
  ): Promise<PaymentDocument> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found.');
    }

    const amount = Math.round(input.amount * 100) / 100;
    const userObjectId = new Types.ObjectId(userId);
    const orderObjectId = new Types.ObjectId(orderId);
    const now = new Date();

    const session = await this.connection.startSession();
    try {
      let payment: PaymentDocument | undefined;

      await session.withTransaction(async () => {
        // Atomic, single-document conditional increment: only succeeds if
        // amountPaid + amount <= total. This is what actually prevents two
        // concurrent payment requests from jointly exceeding the order total
        // — the transaction wrapper below gives us all-or-nothing rollback
        // between the Order update and the Payment insert, but the race
        // safety itself comes from this $expr guard being evaluated
        // atomically by MongoDB on a single document.
        const updatedOrder = await this.orderModel
          .findOneAndUpdate(
            {
              _id: orderObjectId,
              userId: userObjectId,
              $expr: {
                $lte: [{ $add: ['$amountPaid', amount] }, { $add: ['$total', EPSILON] }],
              },
            },
            { $inc: { amountPaid: amount } },
            { new: true, session },
          )
          .exec();

        if (!updatedOrder) {
          // Either the order doesn't exist / isn't owned by this user, or
          // the guard failed (would overpay). Disambiguate for a clear error.
          const existing = await this.orderModel
            .findOne({ _id: orderObjectId, userId: userObjectId })
            .session(session)
            .exec();

          if (!existing) {
            throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found.');
          }

          const maxAmount = Math.round((existing.total - existing.amountPaid) * 100) / 100;
          throw new AppException(
            HttpStatus.CONFLICT,
            'OVERPAYMENT_REJECTED',
            `Payment exceeds the amount due. Maximum allowed payment is ${maxAmount}.`,
            { maxAmount },
          );
        }

        const beforeAmountPaid = updatedOrder.amountPaid - amount;
        const beforeStatus = deriveOrderStatus({
          total: updatedOrder.total,
          amountPaid: beforeAmountPaid,
          dueDate: updatedOrder.dueDate,
          now,
        });
        const afterStatus = deriveOrderStatus({
          total: updatedOrder.total,
          amountPaid: updatedOrder.amountPaid,
          dueDate: updatedOrder.dueDate,
          now,
        });

        const [created] = await this.paymentModel.create(
          [
            {
              orderId: orderObjectId,
              userId: userObjectId,
              amount,
              date: input.date,
              note: input.note,
            },
          ],
          { session },
        );
        payment = created;

        await this.auditService.logIfChanged({
          userId,
          orderId: orderObjectId,
          fromStatus: beforeStatus,
          toStatus: afterStatus,
          trigger: 'payment',
          occurredAt: now,
          session,
        });
      });

      if (!payment) {
        // Should be unreachable: withTransaction only resolves normally if
        // the callback completed without throwing.
        throw new AppException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'INTERNAL_ERROR',
          'Payment could not be recorded.',
        );
      }

      return payment;
    } finally {
      await session.endSession();
    }
  }

  async listForOrder(userId: string, orderId: string): Promise<PaymentDocument[]> {
    await ensureOrderOwnership(this.orderModel, userId, orderId);
    return this.listForOrderId(orderId);
  }

  /**
   * Same query as listForOrder, without the ownership recheck. Only call
   * this when the caller has already confirmed ownership of orderId this
   * request (e.g. OrdersController.findOne, right after fetching the order
   * itself) — skips a redundant `orders` lookup on the order-detail page,
   * which otherwise re-verified ownership once per related collection.
   */
  async listForOrderId(orderId: string): Promise<PaymentDocument[]> {
    return this.paymentModel
      .find({ orderId: new Types.ObjectId(orderId) })
      .sort({ date: 1, createdAt: 1 })
      .exec();
  }
}
