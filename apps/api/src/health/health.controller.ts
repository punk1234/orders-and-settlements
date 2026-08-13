import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  @ApiOperation({ summary: 'Liveness/readiness check, including DB connectivity.' })
  @ApiResponse({
    status: 200,
    schema: { example: { status: 'ok', db: 'connected', timestamp: '2026-08-13T12:00:00.000Z' } },
  })
  check() {
    // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    const dbState = this.connection.readyState;
    const dbStatus = dbState === 1 ? 'connected' : 'not_connected';

    return {
      status: 'ok',
      db: dbStatus,
      timestamp: new Date().toISOString(),
    };
  }
}
