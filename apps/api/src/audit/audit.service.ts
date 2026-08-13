import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AuditTrigger, OrderStatus } from '@orders/shared';
import { AuditLogEntry, AuditLogEntryDocument } from './schemas/audit-log-entry.schema';

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLogEntry.name)
    private readonly auditLogModel: Model<AuditLogEntryDocument>,
  ) {}

  /**
   * Write-triggered logging: called right alongside an order/payment/refund
   * write, where the caller already knows the exact before/after status
   * (usually computed arithmetically rather than re-read, so this never
   * costs an extra query). No-ops if the status didn't actually change.
   */
  async logIfChanged(params: {
    userId: string;
    orderId: Types.ObjectId;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    trigger: AuditTrigger;
    occurredAt?: Date;
    session?: ClientSession;
  }): Promise<void> {
    const { userId, orderId, fromStatus, toStatus, trigger, session } = params;
    if (fromStatus === toStatus) return;

    await this.auditLogModel.create(
      [
        {
          orderId,
          userId: new Types.ObjectId(userId),
          fromStatus,
          toStatus,
          trigger,
          occurredAt: params.occurredAt ?? new Date(),
        },
      ],
      { session },
    );
  }

  /**
   * Read-triggered logging: status can also change purely because time
   * passed (an order silently becomes overdue with no payment or refund
   * happening). There's no write to hang a log entry off of for that case,
   * so instead: whenever an order is actually opened, compare the freshly
   * derived status against the last logged entry and backfill a transition
   * if they've drifted. This also self-heals orders with no audit history
   * at all (e.g. created before this feature existed) — first read just
   * logs fromStatus: null.
   *
   * Only called from the order detail read path (not the list endpoint) to
   * avoid a write on every dashboard poll — documented in README.
   */
  async syncObservedStatus(
    userId: string,
    orderId: Types.ObjectId,
    currentStatus: OrderStatus,
  ): Promise<void> {
    const last = await this.auditLogModel
      .findOne({ orderId })
      .sort({ occurredAt: -1, createdAt: -1 })
      .exec();

    const lastStatus = last?.toStatus ?? null;
    if (lastStatus === currentStatus) return;

    await this.logIfChanged({
      userId,
      orderId,
      fromStatus: lastStatus,
      toStatus: currentStatus,
      trigger: last ? 'observed' : 'created',
    });
  }

  async listForOrder(orderId: Types.ObjectId): Promise<AuditLogEntryDocument[]> {
    return this.auditLogModel.find({ orderId }).sort({ occurredAt: 1, createdAt: 1 }).exec();
  }
}
