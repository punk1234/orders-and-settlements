import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { assistantQuerySchema, AssistantQueryInput } from '@orders/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AssistantService } from './assistant.service';

@ApiTags('assistant (stretch feature)')
@ApiCookieAuth('token')
@Controller('assistant')
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Ask a natural-language question about the current user's own orders. Optional: returns " +
      '503 ASSISTANT_UNAVAILABLE if ANTHROPIC_API_KEY is not configured.',
  })
  @ApiBody({ schema: { example: { question: 'Which orders are overdue?' } } })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        answer: 'You have 2 overdue orders totaling $1,450: Acme Inc ($1,000) and Globex Ltd ($450).',
        orders: [
          {
            id: '66c1f2a1e2b4a7f1d8c9a001',
            customer: 'Acme Inc',
            dueDate: '2026-07-19T00:00:00.000Z',
            lineItems: [{ description: 'Widget', quantity: 2, unitPrice: 500 }],
            subtotal: 1000,
            total: 1000,
            amountPaid: 0,
            amountDue: 1000,
            status: 'overdue',
            editable: true,
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 503,
    schema: {
      example: { error: { code: 'ASSISTANT_UNAVAILABLE', message: 'The assistant is not configured on this deployment (missing ANTHROPIC_API_KEY).' } },
    },
  })
  async query(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(assistantQuerySchema)) body: AssistantQueryInput,
  ) {
    return this.assistantService.query(user.userId, body.question);
  }
}
