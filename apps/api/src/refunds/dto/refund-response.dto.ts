import { ApiProperty } from '@nestjs/swagger';

// Documentation-only class mirroring RefundResponse (refunds/refund.mapper.ts).
export class RefundResponseDto {
  @ApiProperty({ example: '66c1f2a1e2b4a7f1d8c9a020' })
  id!: string;

  @ApiProperty({ example: 150 })
  amount!: number;

  @ApiProperty({ example: '2026-08-11T00:00:00.000Z', type: String, format: 'date-time' })
  date!: Date;

  @ApiProperty({ required: false, example: 'Overcharge correction' })
  note?: string;

  @ApiProperty({ required: false, example: '2026-08-11T09:15:00.000Z', type: String, format: 'date-time' })
  createdAt?: Date;
}
