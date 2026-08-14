import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { signupSchema, loginSchema, SignupInput, LoginInput } from '@orders/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { AUTH_COOKIE_NAME, authCookieOptions } from './cookie.util';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthResponseDto, LogoutResponseDto } from './dto/auth-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  // Tighter than the app-wide default (100/min) — signup is a target for
  // account-enumeration/spam scripts, so 5 attempts/min per IP is plenty
  // for a real user and cheap to hit for an abusive one.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create an account and start a session (sets the auth cookie).' })
  @ApiBody({ schema: { example: { email: 'jane@acme.com', password: 'at-least-8-chars' } } })
  @ApiResponse({
    status: 201,
    description: 'Account created. The auth cookie is set on the response.',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Email already in use.',
    schema: { example: { error: { code: 'EMAIL_IN_USE', message: 'An account with this email already exists.' } } },
  })
  async signup(
    @Body(new ZodValidationPipe(signupSchema)) body: SignupInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.authService.signup(body);
    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
    return { user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Same reasoning as signup — this is the actual brute-force target
  // (password guessing against a known email), so it gets the tightest limit.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Log in and start a session (sets the auth cookie).' })
  @ApiBody({ schema: { example: { email: 'jane@acme.com', password: 'at-least-8-chars' } } })
  @ApiResponse({
    status: 200,
    description: 'Logged in. The auth cookie is set on the response.',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Wrong email or password.',
    schema: { example: { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } } },
  })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.authService.login(body);
    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear the auth cookie.' })
  @ApiResponse({ status: 200, type: LogoutResponseDto })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('token')
  @ApiOperation({ summary: 'Get the currently authenticated user (used by the frontend to check session state).' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({
    status: 401,
    schema: { example: { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } } },
  })
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user: { id: user.userId, email: user.email } };
  }
}
