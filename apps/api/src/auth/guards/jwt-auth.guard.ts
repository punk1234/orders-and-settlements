import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AppException } from '../../common/exceptions/app.exception';

interface JwtPayload {
  sub: string;
  email: string;
}

function extractToken(request: Request): string | undefined {
  if (request.cookies?.token) return request.cookies.token;
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
  return undefined;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractToken(request);

    if (!token) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Authentication required.');
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      (request as Request & { user: { userId: string; email: string } }).user = {
        userId: payload.sub,
        email: payload.email,
      };
      return true;
    } catch {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Invalid or expired session.',
      );
    }
  }
}
