import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

@Schema({ _id: false })
export class LineItem {
  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  unitPrice!: number;
}

export const LineItemSchema = SchemaFactory.createForClass(LineItem);

@Schema({ timestamps: true })
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  customer!: string;

  @Prop({ required: true })
  dueDate!: Date;

  @Prop({ type: [LineItemSchema], required: true })
  lineItems!: LineItem[];

  @Prop({ required: true, min: 0 })
  subtotal!: number;

  @Prop({ required: true, min: 0 })
  total!: number;

  // Denormalized running sum of payments, updated transactionally alongside
  // Payment inserts (see Batch 4). Never trust a client-supplied amountPaid.
  @Prop({ required: true, min: 0, default: 0 })
  amountPaid!: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ userId: 1, dueDate: 1 });
