import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ enum: ['connected', 'not_connected'], example: 'connected' })
  db!: 'connected' | 'not_connected';

  @ApiProperty({ example: '2026-08-13T12:00:00.000Z', type: String, format: 'date-time' })
  timestamp!: string;
}
