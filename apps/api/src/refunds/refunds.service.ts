import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { CreateRefundInput, deriveOrderStatus } from '@orders/shared';
import { AppException } from '../common/exceptions/app.exception';
import { ensureOrderOwnership } from '../common/utils/order-ownership';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Refund, RefundDocument } from './schemas/refund.schema';
import { AuditService } from '../audit/audit.service';

// Same tolerance used for the overpayment guard — see payments.service.ts.
const EPSILON = 0.005;

@Injectable()
export class RefundsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Refund.name) private readonly refundModel: Model<RefundDocument>,
    private readonly auditService: AuditService,
  ) {}

  async recordRefund(
    userId: string,
    orderId: string,
    input: CreateRefundInput,
  ): Promise<RefundDocument> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found.');
    }

    const amount = Math.round(input.amount * 100) / 100;
    const userObjectId = new Types.ObjectId(userId);
    const orderObjectId = new Types.ObjectId(orderId);
    const now = new Date();

    const session = await this.connection.startSession();
    try {
      let refund: RefundDocument | undefined;

      await session.withTransaction(async () => {
        // Mirrors the payment guard exactly, just inverted: a refund can
        // never take amountPaid below 0. Refunds are modeled as their own
        // entity (not a negative Payment) so Payment's own invariants
        // (amount >= 0.01, and the overpayment guard's arithmetic) never
        // have to account for negative values — see README.
        const updatedOrder = await this.orderModel
          .findOneAndUpdate(
            {
              _id: orderObjectId,
              userId: userObjectId,
              $expr: {
                $gte: [{ $subtract: ['$amountPaid', amount] }, -EPSILON],
              },
            },
            { $inc: { amountPaid: -amount } },
            { new: true, session },
          )
          .exec();

        if (!updatedOrder) {
          const existing = await this.orderModel
            .findOne({ _id: orderObjectId, userId: userObjectId })
            .session(session)
            .exec();

          if (!existing) {
            throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found.');
          }

          const maxAmount = Math.round(existing.amountPaid * 100) / 100;
          if (maxAmount <= 0) {
            throw new AppException(
              HttpStatus.CONFLICT,
              'NO_PAYMENTS_TO_REFUND',
              'This order has no payments to refund.',
            );
          }
          throw new AppException(
            HttpStatus.CONFLICT,
            'REFUND_EXCEEDS_PAID',
            `Refund exceeds the amount paid. Maximum allowed refund is ${maxAmount}.`,
            { maxAmount },
          );
        }

        const beforeAmountPaid = updatedOrder.amountPaid + amount;
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

        const [created] = await this.refundModel.create(
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
        refund = created;

        await this.auditService.logIfChanged({
          userId,
          orderId: orderObjectId,
          fromStatus: beforeStatus,
          toStatus: afterStatus,
          trigger: 'refund',
          occurredAt: now,
          session,
        });
      });

      if (!refund) {
        throw new AppException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'INTERNAL_ERROR',
          'Refund could not be recorded.',
        );
      }

      return refund;
    } finally {
      await session.endSession();
    }
  }

  async listForOrder(userId: string, orderId: string): Promise<RefundDocument[]> {
    await ensureOrderOwnership(this.orderModel, userId, orderId);
    return this.listForOrderId(orderId);
  }

  /** See PaymentsService.listForOrderId — same reasoning, mirrored here. */
  async listForOrderId(orderId: string): Promise<RefundDocument[]> {
    return this.refundModel
      .find({ orderId: new Types.ObjectId(orderId) })
      .sort({ date: 1, createdAt: 1 })
      .exec();
  }
}
