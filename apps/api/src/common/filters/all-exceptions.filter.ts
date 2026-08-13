import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Normalizes every error response to { error: { code, message, ...extra } },
 * regardless of whether it originated from an AppException, a stock Nest
 * HttpException (e.g. from a guard), or an unexpected thrown error.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // AppException already produced { error: {...} }
      if (
        typeof body === 'object' &&
        body !== null &&
        'error' in (body as Record<string, unknown>)
      ) {
        response.status(status).json(body);
        return;
      }

      // Stock Nest HttpException (e.g. thrown by a guard/pipe we don't control)
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] })?.message ??
            'Request failed');
      response.status(status).json({
        error: {
          code: HttpStatus[status] ?? 'ERROR',
          message: Array.isArray(message) ? message.join(', ') : message,
        },
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      },
    });
  }
}
