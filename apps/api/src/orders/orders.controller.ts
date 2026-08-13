import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createOrderSchema,
  updateOrderSchema,
  exportOrdersQuerySchema,
  ExportOrdersQuery,
  ORDER_STATUSES,
  OrderStatus,
  CreateOrderInput,
  UpdateOrderInput,
} from '@orders/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AppException } from '../common/exceptions/app.exception';
import { toCsv } from '../common/utils/csv';
import { OrdersService } from './orders.service';
import { toOrderResponse } from './order.mapper';
import { PaymentsService } from '../payments/payments.service';
import { toPaymentResponse } from '../payments/payment.mapper';
import { RefundsService } from '../refunds/refunds.service';
import { toRefundResponse } from '../refunds/refund.mapper';
import { AuditService } from '../audit/audit.service';
import { toAuditLogEntryResponse } from '../audit/audit.mapper';

const ORDER_EXAMPLE = {
  id: '66c1f2a1e2b4a7f1d8c9a001',
  customer: 'Acme Inc',
  dueDate: '2026-08-19T00:00:00.000Z',
  lineItems: [{ description: 'Widget', quantity: 2, unitPrice: 500 }],
  subtotal: 1000,
  total: 1000,
  amountPaid: 400,
  amountDue: 600,
  status: 'partially_paid',
  editable: false,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-05T10:00:00.000Z',
};

const PAYMENT_EXAMPLE = {
  id: '66c1f2a1e2b4a7f1d8c9a010',
  amount: 400,
  date: '2026-08-05T00:00:00.000Z',
  note: 'First installment',
  createdAt: '2026-08-05T10:00:00.000Z',
};

const REFUND_EXAMPLE = {
  id: '66c1f2a1e2b4a7f1d8c9a020',
  amount: 100,
  date: '2026-08-06T00:00:00.000Z',
  note: 'Damaged item',
  createdAt: '2026-08-06T10:00:00.000Z',
};

const AUDIT_LOG_EXAMPLE = {
  id: '66c1f2a1e2b4a7f1d8c9a030',
  fromStatus: 'pending',
  toStatus: 'partially_paid',
  trigger: 'payment',
  occurredAt: '2026-08-05T10:00:00.000Z',
};

function parseStatusFilter(status: unknown): OrderStatus | undefined {
  if (status === undefined) return undefined;
  if (typeof status === 'string' && (ORDER_STATUSES as readonly string[]).includes(status)) {
    return status as OrderStatus;
  }
  throw new AppException(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_FAILED',
    `status must be one of: ${ORDER_STATUSES.join(', ')}`,
  );
}

@ApiTags('orders')
@ApiCookieAuth('token')
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly refundsService: RefundsService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an order. Subtotal/total are computed server-side from line items.' })
  @ApiBody({
    schema: {
      example: {
        customer: 'Acme Inc',
        dueDate: '2026-08-19',
        lineItems: [{ description: 'Widget', quantity: 2, unitPrice: 500 }],
      },
    },
  })
  @ApiResponse({ status: 201, schema: { example: { ...ORDER_EXAMPLE, amountPaid: 0, amountDue: 1000, status: 'pending', editable: true } } })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput,
  ) {
    const order = await this.ordersService.create(user.userId, body);
    return toOrderResponse(order);
  }

  @Get()
  @ApiOperation({ summary: "List the current user's orders, optionally filtered by status." })
  @ApiQuery({ name: 'status', required: false, enum: ORDER_STATUSES })
  @ApiResponse({ status: 200, schema: { example: [ORDER_EXAMPLE] } })
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: string) {
    const statusFilter = parseStatusFilter(status);
    const orders = await this.ordersService.findAllForUser(user.userId, statusFilter);
    return orders.map((o) => toOrderResponse(o));
  }

  // Must be declared before ':id' — Nest/Express match routes in
  // declaration order, so 'export' would otherwise be swallowed as an :id
  // value and 404 as "order not found".
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="orders-export.csv"')
  @ApiOperation({
    summary:
      'Download the current user\'s orders as CSV, optionally filtered to a due-date range ' +
      '(both "from" and "to" are optional; omit either for an open-ended range).',
  })
  @ApiQuery({ name: 'from', required: false, type: String, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, type: String, example: '2026-08-31' })
  @ApiResponse({
    status: 200,
    description: 'CSV file, one row per order, columns: Order ID, Customer, Status, Total, Amount Paid, Amount Due, Due Date.',
    content: {
      'text/csv': {
        schema: {
          type: 'string',
          example:
            'Order ID,Customer,Status,Total,Amount Paid,Amount Due,Due Date\r\n' +
            '66c1f2a1e2b4a7f1d8c9a001,Acme Inc,partially_paid,1000,400,600,2026-08-19\r\n',
        },
      },
    },
  })
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(exportOrdersQuerySchema)) query: ExportOrdersQuery,
  ): Promise<string> {
    const orders = await this.ordersService.exportToCsvRows(user.userId, query);
    const rows = orders.map((o) => toOrderResponse(o));

    return toCsv(rows, [
      { header: 'Order ID', value: (r) => r.id },
      { header: 'Customer', value: (r) => r.customer },
      { header: 'Status', value: (r) => r.status },
      { header: 'Total', value: (r) => r.total },
      { header: 'Amount Paid', value: (r) => r.amountPaid },
      { header: 'Amount Due', value: (r) => r.amountDue },
      { header: 'Due Date', value: (r) => r.dueDate.toISOString().slice(0, 10) },
    ]);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one order, including its line items, payment/refund history.' })
  @ApiResponse({
    status: 200,
    schema: { example: { ...ORDER_EXAMPLE, payments: [PAYMENT_EXAMPLE], refunds: [REFUND_EXAMPLE] } },
  })
  @ApiResponse({
    status: 404,
    schema: { example: { error: { code: 'NOT_FOUND', message: 'Order not found.' } } },
  })
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const order = await this.ordersService.findOneForUserWithStatusSync(user.userId, id);
    // Ownership of `id` is already confirmed by the lookup above, so skip
    // the redundant ownership recheck each service's own endpoint needs.
    const [payments, refunds] = await Promise.all([
      this.paymentsService.listForOrderId(id),
      this.refundsService.listForOrderId(id),
    ]);
    return {
      ...toOrderResponse(order),
      payments: payments.map(toPaymentResponse),
      refunds: refunds.map(toRefundResponse),
    };
  }

  @Get(':id/audit-log')
  @ApiOperation({ summary: 'Status-change history for one order, with timestamps.' })
  @ApiResponse({ status: 200, schema: { example: [{ ...AUDIT_LOG_EXAMPLE, fromStatus: null, trigger: 'created' }, AUDIT_LOG_EXAMPLE] } })
  async auditLog(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const order = await this.ordersService.findOneForUserWithStatusSync(user.userId, id);
    const entries = await this.auditService.listForOrder(order._id);
    return entries.map(toAuditLogEntryResponse);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an order. Rejected (409 ORDER_LOCKED) once any payment has been recorded.' })
  @ApiResponse({ status: 200, schema: { example: { ...ORDER_EXAMPLE, amountPaid: 0, amountDue: 1000, status: 'pending', editable: true } } })
  @ApiResponse({
    status: 409,
    schema: { example: { error: { code: 'ORDER_LOCKED', message: 'This order has payments recorded and can no longer be edited.' } } },
  })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateOrderSchema)) body: UpdateOrderInput,
  ) {
    const order = await this.ordersService.update(user.userId, id, body);
    return toOrderResponse(order);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an order. Rejected (409 ORDER_LOCKED) once any payment has been recorded.' })
  @ApiResponse({ status: 204, description: 'Deleted. Empty response body.' })
  @ApiResponse({
    status: 409,
    schema: { example: { error: { code: 'ORDER_LOCKED', message: 'This order has payments recorded and cannot be deleted.' } } },
  })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.ordersService.remove(user.userId, id);
  }
}
