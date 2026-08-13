import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CreateOrderInput,
  UpdateOrderInput,
  OrderStatus,
  computeOrderTotals,
  deriveOrderStatus,
} from '@orders/shared';
import { AppException } from '../common/exceptions/app.exception';
import { Order, OrderDocument } from './schemas/order.schema';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly auditService: AuditService,
  ) {}

  async create(userId: string, input: CreateOrderInput): Promise<OrderDocument> {
    const { subtotal, total } = computeOrderTotals(input.lineItems);

    const order = await this.orderModel.create({
      userId: new Types.ObjectId(userId),
      customer: input.customer,
      dueDate: input.dueDate,
      lineItems: input.lineItems,
      subtotal,
      total,
      amountPaid: 0,
    });

    // Best-effort: if this write fails for some reason, the next time
    // anyone opens the order, syncObservedStatus (called from
    // findOneForUserOrThrow) detects the missing history and backfills it.
    const initialStatus = deriveOrderStatus({
      total: order.total,
      amountPaid: order.amountPaid,
      dueDate: order.dueDate,
    });
    await this.auditService.logIfChanged({
      userId,
      orderId: order._id,
      fromStatus: null,
      toStatus: initialStatus,
      trigger: 'created',
    });

    return order;
  }

  async findAllForUser(userId: string, statusFilter?: OrderStatus): Promise<OrderDocument[]> {
    const orders = await this.orderModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();

    if (!statusFilter) return orders;

    const now = new Date();
    return orders.filter(
      (order) =>
        deriveOrderStatus({
          total: order.total,
          amountPaid: order.amountPaid,
          dueDate: order.dueDate,
          now,
        }) === statusFilter,
    );
  }

  async findOneForUserOrThrow(userId: string, orderId: string): Promise<OrderDocument> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found.');
    }

    const order = await this.orderModel
      .findOne({ _id: orderId, userId: new Types.ObjectId(userId) })
      .exec();

    if (!order) {
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found.');
    }

    return order;
  }

  /**
   * Same lookup as findOneForUserOrThrow, plus a status-audit sync. Kept
   * separate rather than folded into findOneForUserOrThrow because that
   * method is also used internally by update()/remove() purely to check
   * ownership and lock state — an edit or delete triggering an "observed
   * status" log entry would be a confusing, unrelated side effect. Use this
   * version specifically for read paths a user actually opens (order
   * detail, audit log) — see AuditService.syncObservedStatus for what this
   * catches (a pure due-date-driven flip to overdue, which has no write of
   * its own to hang a log entry off).
   */
  async findOneForUserWithStatusSync(userId: string, orderId: string): Promise<OrderDocument> {
    const order = await this.findOneForUserOrThrow(userId, orderId);

    const currentStatus = deriveOrderStatus({
      total: order.total,
      amountPaid: order.amountPaid,
      dueDate: order.dueDate,
    });
    await this.auditService.syncObservedStatus(userId, order._id, currentStatus);

    return order;
  }

  async exportToCsvRows(
    userId: string,
    range: { from?: Date; to?: Date },
  ): Promise<OrderDocument[]> {
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (range.from || range.to) {
      const dueDate: Record<string, Date> = {};
      if (range.from) dueDate.$gte = range.from;
      if (range.to) {
        // UTC, not local time — the server's timezone shouldn't change which
        // orders end up in the export.
        const endOfDay = new Date(range.to);
        endOfDay.setUTCHours(23, 59, 59, 999);
        dueDate.$lte = endOfDay;
      }
      filter.dueDate = dueDate;
    }

    return this.orderModel.find(filter).sort({ dueDate: 1 }).exec();
  }

  async update(
    userId: string,
    orderId: string,
    input: UpdateOrderInput,
  ): Promise<OrderDocument> {
    const order = await this.findOneForUserOrThrow(userId, orderId);

    if (order.amountPaid > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'ORDER_LOCKED',
        'This order has payments recorded and can no longer be edited.',
      );
    }

    if (input.customer !== undefined) order.customer = input.customer;
    if (input.dueDate !== undefined) order.dueDate = input.dueDate;
    if (input.lineItems !== undefined) {
      order.lineItems = input.lineItems;
      const { subtotal, total } = computeOrderTotals(input.lineItems);
      order.subtotal = subtotal;
      order.total = total;
    }

    await order.save();
    return order;
  }

  async remove(userId: string, orderId: string): Promise<void> {
    const order = await this.findOneForUserOrThrow(userId, orderId);

    if (order.amountPaid > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'ORDER_LOCKED',
        'This order has payments recorded and cannot be deleted.',
      );
    }

    await order.deleteOne();
  }
}
