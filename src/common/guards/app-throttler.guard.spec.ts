import { ExecutionContext } from '@nestjs/common';
import { AppThrottlerGuard } from './app-throttler.guard';

class TestableGuard extends AppThrottlerGuard {
  tracker(req: Parameters<AppThrottlerGuard['getTracker']>[0]) {
    return this.getTracker(req);
  }
  reqRes(context: ExecutionContext) {
    return this.getRequestResponse(context);
  }
}

describe('AppThrottlerGuard', () => {
  const guard = new TestableGuard({} as never, {} as never, {} as never);

  it('usa IP + email cuando el cuerpo trae un email', async () => {
    await expect(
      guard.tracker({ ip: '1.1.1.1', body: { email: ' Ana@Correo.com ' } }),
    ).resolves.toBe('1.1.1.1:ana@correo.com');
  });

  it('toma el request y el response de REST o de GraphQL', () => {
    const req = { ip: '1.1.1.1' };
    const res = { header: jest.fn() };
    const rest = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
    expect(guard.reqRes(rest)).toEqual({ req, res });
    const graphql = {
      getType: () => 'graphql',
      getArgs: () => [{}, {}, { req, res }, {}],
      getClass: jest.fn(),
      getHandler: jest.fn(),
    } as unknown as ExecutionContext;
    expect(guard.reqRes(graphql)).toEqual({ req, res });
  });

  it('usa la IP real detrás de un proxy y solo IP sin email', async () => {
    await expect(
      guard.tracker({ ip: '10.0.0.1', ips: ['200.1.1.1'], body: {} }),
    ).resolves.toBe('200.1.1.1');
    await expect(guard.tracker({})).resolves.toBe('unknown');
  });
});
