import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [ConfigModule, AuthModule, OrdersModule, PaymentsModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
