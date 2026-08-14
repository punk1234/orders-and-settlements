import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AUDIT_TRIGGERS, AuditTrigger, ORDER_STATUSES, OrderStatus } from '@orders/shared';

export type AuditLogEntryDocument = HydratedDocument<AuditLogEntry>;

@Schema({ collection: 'auditlogs', timestamps: { createdAt: true, updatedAt: false } })
export class AuditLogEntry {
  // Same reasoning as payment.schema.ts: orderId is covered by the compound
  // `{ orderId: 1, occurredAt: 1 }` index below, and entries are never
  // queried by userId directly.
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  // null only for the very first entry on an order (there is no "from").
  @Prop({ type: String, enum: ORDER_STATUSES, default: null })
  fromStatus!: OrderStatus | null;

  @Prop({ type: String, enum: ORDER_STATUSES, required: true })
  toStatus!: OrderStatus;

  @Prop({ type: String, enum: AUDIT_TRIGGERS, required: true })
  trigger!: AuditTrigger;

  // When this transition was recorded. For 'created'/'payment'/'refund' this
  // is the exact moment. For 'observed' (a pure due-date-driven flip to
  // overdue, which happens with no write of its own) it's the first time
  // anyone happened to load the order after the cutover — see README.
  @Prop({ required: true })
  occurredAt!: Date;

  createdAt?: Date;
}

export const AuditLogEntrySchema = SchemaFactory.createForClass(AuditLogEntry);
AuditLogEntrySchema.index({ orderId: 1, occurredAt: 1 });
