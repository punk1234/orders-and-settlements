import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

function contextWithRequest(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('rejects requests with no token', () => {
    const jwtService = { verify: jest.fn() } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService);
    const ctx = contextWithRequest({ cookies: {}, headers: {} });

    expect(() => guard.canActivate(ctx)).toThrow('Authentication required.');
  });

  it('rejects requests with an invalid token', () => {
    const jwtService = {
      verify: jest.fn(() => {
        throw new Error('bad token');
      }),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService);
    const ctx = contextWithRequest({ cookies: { token: 'garbage' }, headers: {} });

    expect(() => guard.canActivate(ctx)).toThrow('Invalid or expired session.');
  });

  it('attaches req.user and allows the request through for a valid cookie token', () => {
    const jwtService = {
      verify: jest.fn(() => ({ sub: 'user-1', email: 'a@b.com' })),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService);
    const request: Record<string, unknown> = { cookies: { token: 'valid' }, headers: {} };
    const ctx = contextWithRequest(request);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.user).toEqual({ userId: 'user-1', email: 'a@b.com' });
  });

  it('also accepts a Bearer token in the Authorization header', () => {
    const jwtService = {
      verify: jest.fn(() => ({ sub: 'user-1', email: 'a@b.com' })),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService);
    const request: Record<string, unknown> = {
      cookies: {},
      headers: { authorization: 'Bearer valid' },
    };
    const ctx = contextWithRequest(request);

    expect(guard.canActivate(ctx)).toBe(true);
  });
});
