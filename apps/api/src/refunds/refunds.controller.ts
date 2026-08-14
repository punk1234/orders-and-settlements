import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { createRefundSchema, CreateRefundInput } from '@orders/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RefundsService } from './refunds.service';
import { toRefundResponse } from './refund.mapper';
import { RefundResponseDto } from './dto/refund-response.dto';

@ApiTags('refunds')
@ApiCookieAuth('token')
@Controller('orders/:orderId/refunds')
@UseGuards(JwtAuthGuard)
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Record a refund against an order. Atomically rejected with 409 REFUND_EXCEEDS_PAID ' +
      '(including the max refundable amount) if it would take amount paid below 0, or 409 ' +
      'NO_PAYMENTS_TO_REFUND if nothing has been paid yet.',
  })
  @ApiBody({
    schema: { example: { amount: 100, date: '2026-08-20', note: 'Damaged item' } },
  })
  @ApiResponse({ status: 201, type: RefundResponseDto })
  @ApiResponse({
    status: 409,
    schema: {
      example: {
        error: { code: 'REFUND_EXCEEDS_PAID', message: 'Refund exceeds the amount paid. Maximum allowed refund is 400.', maxAmount: 400 },
      },
    },
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(createRefundSchema)) body: CreateRefundInput,
  ) {
    const refund = await this.refundsService.recordRefund(user.userId, orderId, body);
    return toRefundResponse(refund);
  }

  @Get()
  @ApiOperation({ summary: 'Full refund history for one order (also embedded in GET /orders/:id).' })
  @ApiResponse({ status: 200, type: [RefundResponseDto] })
  async findAll(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    const refunds = await this.refundsService.listForOrder(user.userId, orderId);
    return refunds.map(toRefundResponse);
  }
}
