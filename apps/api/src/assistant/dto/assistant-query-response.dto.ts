import { ApiProperty } from '@nestjs/swagger';
import { OrderResponseDto } from '../../orders/dto/order-response.dto';

// Documentation-only class mirroring AssistantQueryResult (assistant/assistant.service.ts).
export class AssistantQueryResponseDto {
  @ApiProperty({
    example: 'You have 2 overdue orders totaling $1,450: Acme Inc ($1,000) and Globex Ltd ($450).',
  })
  answer!: string;

  @ApiProperty({
    type: [OrderResponseDto],
    description: 'Orders the assistant looked up while answering — empty array if none were relevant.',
  })
  orders!: OrderResponseDto[];
}
