import { ApiProperty } from '@nestjs/swagger';
import { AUDIT_TRIGGERS, AuditTrigger, ORDER_STATUSES, OrderStatus } from '@orders/shared';

// Documentation-only class mirroring AuditLogEntryResponse (@orders/shared audit.ts).
export class AuditLogEntryResponseDto {
  @ApiProperty({ example: '66c1f2a1e2b4a7f1d8c9a030' })
  id!: string;

  @ApiProperty({
    enum: ORDER_STATUSES,
    nullable: true,
    example: 'pending',
    description: 'Null for the initial "created" entry, which has no prior status.',
  })
  fromStatus!: OrderStatus | null;

  @ApiProperty({ enum: ORDER_STATUSES, example: 'partially_paid' })
  toStatus!: OrderStatus;

  @ApiProperty({ enum: AUDIT_TRIGGERS, example: 'payment' })
  trigger!: AuditTrigger;

  @ApiProperty({ example: '2026-08-10T10:05:00.000Z', type: String, format: 'date-time' })
  occurredAt!: Date;
}
