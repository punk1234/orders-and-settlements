import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Every error thrown deliberately in this API should be an AppException so the
 * response body always has the shape { error: { code, message, ...extra } }.
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    extra?: Record<string, unknown>,
  ) {
    super({ error: { code, message, ...extra } }, status);
    // HttpException doesn't surface a string `message` when the response body
    // is an object, so set it explicitly (useful for logs and for tests that
    // assert on .message via toThrow()).
    this.message = message;
  }
}
