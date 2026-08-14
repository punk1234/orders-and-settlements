import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PaymentDocument = HydratedDocument<Payment>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Payment {
  // No `index: true` on either field: orderId is covered by the compound
  // `{ orderId: 1, date: 1 }` index below, and nothing in the app queries
  // payments by userId directly — ownership is checked against the Order
  // document (see order-ownership.ts), not by filtering this collection.
  // userId is still stored on every payment for data lineage/auditability.
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, min: 0.01 })
  amount!: number;

  @Prop({ required: true })
  date!: Date;

  @Prop({ trim: true, maxlength: 500 })
  note?: string;

  createdAt?: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ orderId: 1, date: 1 });
