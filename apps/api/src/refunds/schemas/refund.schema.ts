import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RefundDocument = HydratedDocument<Refund>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Refund {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true, index: true })
  orderId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
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
