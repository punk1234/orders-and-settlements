import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { AssistantModule } from './assistant/assistant.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Global default: 100 requests/min per IP, generous enough that normal
    // app usage never hits it. Auth endpoints override this with a much
    // tighter limit via @Throttle (see AuthController) — that's the one
    // place brute-forcing is a real concern (password guessing).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI'),
        // Tuned for serverless (Vercel Functions), not a long-lived server.
        // @nestjs/mongoose's own defaults (10 retries, 3s apart) can eat
        // 30+ seconds retrying a single connection attempt — comfortably
        // longer than a Function's execution limit, so a real connectivity
        // problem previously surfaced as the function getting killed
        // mid-retry ("process exited with exit status: 1") instead of a
        // clear error. Fail fast instead: a genuine problem (bad URI,
        // Atlas network access, wrong credentials) shows up as an explicit
        // MongoServerSelectionError within a few seconds, logged clearly.
        // Warm invocations reuse the already-open connection either way —
        // this only affects the cold-start path.
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        retryAttempts: 1,
        retryDelay: 0,
      }),
    }),
    HealthModule,
    UsersModule,
    AuthModule,
    OrdersModule,
    PaymentsModule,
    AssistantModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
