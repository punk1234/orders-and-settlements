import { ApiProperty } from '@nestjs/swagger';
import { ORDER_STATUSES, OrderStatus } from '@orders/shared';
import { PaymentResponseDto } from '../../payments/dto/payment-response.dto';
import { RefundResponseDto } from '../../refunds/dto/refund-response.dto';

// Purely documentation-facing: mirrors OrderResponse / order.mapper.ts field
// for field, decorated with @ApiProperty so Swagger's Schema tab (and the
// example values it derives from these) are populated. Nothing in the app
// actually constructs instances of this class — controllers keep returning
// plain objects shaped like it; @nestjs/swagger only reads this class's
// decorator metadata at boot to build the OpenAPI document.
export class LineItemDto {
  @ApiProperty({ example: 'Widget' })
  description!: string;

  @ApiProperty({ example: 2, minimum: 1 })
  quantity!: number;

  @ApiProperty({ example: 500, minimum: 0 })
  unitPrice!: number;
}

export class OrderResponseDto {
  @ApiProperty({ example: '66c1f2a1e2b4a7f1d8c9a001' })
  id!: string;

  @ApiProperty({ example: 'Acme Inc' })
  customer!: string;

  @ApiProperty({ example: '2026-08-19T00:00:00.000Z', type: String, format: 'date-time' })
  dueDate!: Date;

  @ApiProperty({ type: [LineItemDto] })
  lineItems!: LineItemDto[];

  @ApiProperty({ example: 1000, description: 'Sum of (quantity × unitPrice) across all line items.' })
  subtotal!: number;

  @ApiProperty({ example: 1000, description: 'Same as subtotal — no order-level tax/discount in this assignment.' })
  total!: number;

  @ApiProperty({ example: 400, description: 'Net of payments minus refunds.' })
  amountPaid!: number;

  @ApiProperty({ example: 600 })
  amountDue!: number;

  @ApiProperty({ enum: ORDER_STATUSES, example: 'partially_paid' })
  status!: OrderStatus;

  @ApiProperty({
    example: false,
    description: 'False once any payment has been recorded — the order is then read-only (409 ORDER_LOCKED on edit/delete).',
  })
  editable!: boolean;

  @ApiProperty({ required: false, example: '2026-08-01T10:00:00.000Z', type: String, format: 'date-time' })
  createdAt?: Date;

  @ApiProperty({ required: false, example: '2026-08-05T10:00:00.000Z', type: String, format: 'date-time' })
  updatedAt?: Date;
}

// GET /orders/:id returns the order plus its full payment/refund history —
// this extends OrderResponseDto rather than duplicating its fields.
export class OrderDetailResponseDto extends OrderResponseDto {
  @ApiProperty({ type: [PaymentResponseDto] })
  payments!: PaymentResponseDto[];

  @ApiProperty({ type: [RefundResponseDto] })
  refunds!: RefundResponseDto[];
}
