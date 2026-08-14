import { ApiProperty } from '@nestjs/swagger';

// Documentation-only class mirroring PaymentResponse (payments/payment.mapper.ts).
export class PaymentResponseDto {
  @ApiProperty({ example: '66c1f2a1e2b4a7f1d8c9a010' })
  id!: string;

  @ApiProperty({ example: 400 })
  amount!: number;

  @ApiProperty({ example: '2026-08-10T00:00:00.000Z', type: String, format: 'date-time' })
  date!: Date;

  @ApiProperty({ required: false, example: 'Wire transfer' })
  note?: string;

  @ApiProperty({ required: false, example: '2026-08-10T10:05:00.000Z', type: String, format: 'date-time' })
  createdAt?: Date;
}
