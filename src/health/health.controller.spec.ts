import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reporta la base de datos arriba', async () => {
    const ds = { query: jest.fn().mockResolvedValue([1]) };
    const controller = new HealthController(ds as unknown as DataSource);
    await expect(controller.check()).resolves.toMatchObject({
      status: 'ok',
      database: 'up',
    });
  });

  it('reporta la base de datos caída', async () => {
    const ds = { query: jest.fn().mockRejectedValue(new Error('down')) };
    const controller = new HealthController(ds as unknown as DataSource);
    await expect(controller.check()).resolves.toMatchObject({
      database: 'down',
    });
  });
});
