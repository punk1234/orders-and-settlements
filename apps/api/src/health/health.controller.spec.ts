import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  async function buildController(readyState: number) {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: getConnectionToken(),
          useValue: { readyState },
        },
      ],
    }).compile();

    return moduleRef.get(HealthController);
  }

  it('reports db as connected when readyState is 1', async () => {
    const controller = await buildController(1);
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.db).toBe('connected');
    expect(typeof result.timestamp).toBe('string');
  });

  it('reports db as not_connected when readyState is not 1', async () => {
    const controller = await buildController(0);
    const result = controller.check();
    expect(result.db).toBe('not_connected');
  });
});
