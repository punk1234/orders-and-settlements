import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<Pick<UsersService, 'findByEmail' | 'create'>>;

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('signed.jwt.token') } },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('signup', () => {
    it('rejects when the email is already in use', async () => {
      usersService.findByEmail.mockResolvedValue({ id: '1' } as never);

      await expect(
        service.signup({ email: 'a@b.com', password: 'password123' }),
      ).rejects.toThrow('An account with this email already exists.');
    });

    it('hashes the password and returns a session for a new user', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ id: '1', email: 'a@b.com' } as never);

      const result = await service.signup({ email: 'a@b.com', password: 'password123' });

      expect(usersService.create).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringMatching(/^\$2[aby]\$/), // bcrypt hash format
      );
      expect(result.token).toBe('signed.jwt.token');
      expect(result.user).toEqual({ id: '1', email: 'a@b.com' });
    });

    it('turns a duplicate-key race on create() into the same clean EMAIL_IN_USE error', async () => {
      // Simulates two signups for the same email arriving at once: both pass
      // findByEmail (neither sees the other yet), so the real guard is the
      // unique index rejecting the loser's insert with a Mongo E11000.
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockRejectedValue(
        Object.assign(new Error('E11000 duplicate key error'), { code: 11000 }),
      );

      await expect(
        service.signup({ email: 'a@b.com', password: 'password123' }),
      ).rejects.toThrow('An account with this email already exists.');
    });

    it('re-throws unrelated errors from create() as-is', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockRejectedValue(new Error('connection reset'));

      await expect(
        service.signup({ email: 'a@b.com', password: 'password123' }),
      ).rejects.toThrow('connection reset');
    });
  });

  describe('login', () => {
    it('rejects when no user has that email', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@b.com', password: 'password123' }),
      ).rejects.toThrow('Invalid email or password.');
    });

    it('rejects when the password does not match', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      usersService.findByEmail.mockResolvedValue({
        id: '1',
        email: 'a@b.com',
        passwordHash,
      } as never);

      await expect(
        service.login({ email: 'a@b.com', password: 'wrong-password' }),
      ).rejects.toThrow('Invalid email or password.');
    });

    it('returns a session when the password matches', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      usersService.findByEmail.mockResolvedValue({
        id: '1',
        email: 'a@b.com',
        passwordHash,
      } as never);

      const result = await service.login({ email: 'a@b.com', password: 'correct-password' });

      expect(result.token).toBe('signed.jwt.token');
      expect(result.user).toEqual({ id: '1', email: 'a@b.com' });
    });
  });
});
