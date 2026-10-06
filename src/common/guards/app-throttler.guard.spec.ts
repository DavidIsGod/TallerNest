import { AppThrottlerGuard } from './app-throttler.guard';

class TestableGuard extends AppThrottlerGuard {
  tracker(req: Parameters<AppThrottlerGuard['getTracker']>[0]) {
    return this.getTracker(req);
  }
}

describe('AppThrottlerGuard', () => {
  const guard = new TestableGuard({} as never, {} as never, {} as never);

  it('usa IP + email cuando el cuerpo trae un email', async () => {
    await expect(
      guard.tracker({ ip: '1.1.1.1', body: { email: ' Ana@Correo.com ' } }),
    ).resolves.toBe('1.1.1.1:ana@correo.com');
  });

  it('usa la IP real detrás de un proxy y solo IP sin email', async () => {
    await expect(
      guard.tracker({ ip: '10.0.0.1', ips: ['200.1.1.1'], body: {} }),
    ).resolves.toBe('200.1.1.1');
    await expect(guard.tracker({})).resolves.toBe('unknown');
  });
});
