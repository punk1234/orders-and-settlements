import { HttpStatus, PipeTransform } from '@nestjs/common';
import { ZodSchema, z } from 'zod';
import { AppException } from '../exceptions/app.exception';

export class ZodValidationPipe<S extends ZodSchema>
  implements PipeTransform<unknown, z.infer<S>>
{
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        issues[0]?.message ?? 'Validation failed',
        { issues },
      );
    }
    return result.data;
  }
}
