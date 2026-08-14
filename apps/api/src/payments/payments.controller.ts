import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { createPaymentSchema, CreatePaymentInput } from '@orders/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PaymentsService } from './payments.service';
import { toPaymentResponse } from './payment.mapper';
import { PaymentResponseDto } from './dto/payment-response.dto';

@ApiTags('payments')
@ApiCookieAuth('token')
@Controller('orders/:orderId/payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Record a payment against an order. Atomically rejected with 409 OVERPAYMENT_REJECTED ' +
      '(including the max allowed amount) if it would exceed the order total.',
  })
  @ApiBody({
    schema: { example: { amount: 400, date: '2026-08-12', note: 'First installment' } },
  })
  @ApiResponse({ status: 201, type: PaymentResponseDto })
  @ApiResponse({
    status: 409,
    schema: {
      example: {
        error: { code: 'OVERPAYMENT_REJECTED', message: 'Payment exceeds the amount due. Maximum allowed payment is 600.', maxAmount: 600 },
      },
    },
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(createPaymentSchema)) body: CreatePaymentInput,
  ) {
    const payment = await this.paymentsService.recordPayment(user.userId, orderId, body);
    return toPaymentResponse(payment);
  }

  @Get()
  @ApiOperation({ summary: 'Full payment history for one order (also embedded in GET /orders/:id).' })
  @ApiResponse({ status: 200, type: [PaymentResponseDto] })
  async findAll(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    const payments = await this.paymentsService.listForOrder(user.userId, orderId);
    return payments.map(toPaymentResponse);
  }
}
