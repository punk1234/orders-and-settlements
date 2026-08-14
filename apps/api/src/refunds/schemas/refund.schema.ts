import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RefundDocument = HydratedDocument<Refund>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Refund {
  // Same reasoning as payment.schema.ts: orderId is covered by the compound
  // `{ orderId: 1, date: 1 }` index below, and refunds are never queried by
  // userId directly (ownership goes through the Order document instead).
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

export const RefundSchema = SchemaFactory.createForClass(Refund);
RefundSchema.index({ orderId: 1, date: 1 });
