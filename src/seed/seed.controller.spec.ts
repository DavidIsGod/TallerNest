import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';

describe('SeedController', () => {
  it('ejecuta el seed', async () => {
    const service = { run: jest.fn().mockResolvedValue({ usuarios: 5 }) };
    const controller = new SeedController(service as unknown as SeedService);
    await expect(controller.run()).resolves.toEqual({ usuarios: 5 });
  });
});
