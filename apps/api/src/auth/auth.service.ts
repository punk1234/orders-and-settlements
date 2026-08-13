import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { SignupInput, LoginInput } from '@orders/shared';
import { AppException } from '../common/exceptions/app.exception';
import { isDuplicateKeyError } from '../common/utils/mongo-errors';
import { UsersService } from '../users/users.service';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(input: SignupInput) {
    const existing = await this.usersService.findByEmail(input.email);
    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'EMAIL_IN_USE',
        'An account with this email already exists.',
      );
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    try {
      const user = await this.usersService.create(input.email, passwordHash);
      return this.buildSession(user.id, user.email);
    } catch (err) {
      // The findByEmail check above isn't atomic with this insert — two
      // signups for the same email submitted at the same instant can both
      // pass the check and race to create(). The unique index on email is
      // the real guard; without this catch, the loser would surface as a
      // generic 500 instead of the same clean 409 the check above gives.
      if (isDuplicateKeyError(err)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'EMAIL_IN_USE',
          'An account with this email already exists.',
        );
      }
      throw err;
    }
  }

  async login(input: LoginInput) {
    const user = await this.usersService.findByEmail(input.email);
    if (!user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'Invalid email or password.',
      );
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'Invalid email or password.',
      );
    }

    return this.buildSession(user.id, user.email);
  }

  private buildSession(userId: string, email: string) {
    const token = this.jwtService.sign({ sub: userId, email });
    return { token, user: { id: userId, email } };
  }
}
