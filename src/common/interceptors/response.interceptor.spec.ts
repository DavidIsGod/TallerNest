import { CallHandler, ExecutionContext, StreamableFile } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor<unknown>();
  const contextWithStatus = (statusCode: number) =>
    ({
      switchToHttp: () => ({ getResponse: () => ({ statusCode }) }),
    }) as unknown as ExecutionContext;
  const handler = (data: unknown): CallHandler => ({ handle: () => of(data) });

  it('envuelve la respuesta en el formato estándar', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(contextWithStatus(201), handler({ id: 1 })),
    );
    expect(result).toMatchObject({
      status: 201,
      message: 'Created',
      data: { id: 1 },
    });
  });

  it('no envuelve archivos ni respuestas 204', async () => {
    const file = new StreamableFile(Buffer.from('pdf'));
    await expect(
      lastValueFrom(
        interceptor.intercept(contextWithStatus(200), handler(file)),
      ),
    ).resolves.toBe(file);
    await expect(
      lastValueFrom(
        interceptor.intercept(contextWithStatus(204), handler(undefined)),
      ),
    ).resolves.toBeUndefined();
  });

  it('usa OK si el código no tiene texto estándar', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(contextWithStatus(299), handler([])),
    );
    expect(result).toMatchObject({ status: 299, message: 'OK' });
  });
});
