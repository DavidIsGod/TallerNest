import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { setupApp } from './setup-app';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { pong: true };
  }
}

describe('setupApp', () => {
  let app: INestApplication;

  const build = async (cors: string) => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [() => ({ CORS_ORIGINS: cors })],
        }),
      ],
      controllers: [PingController],
    }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
  };

  afterEach(() => app.close());

  it('aplica el prefijo /api, el formato estándar y publica Swagger', async () => {
    await build('*');
    const res = await request(app.getHttpServer()).get('/api/ping').expect(200);
    expect(res.body).toMatchObject({ status: 200, data: { pong: true } });
    await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    const notFound = await request(app.getHttpServer())
      .get('/nope')
      .expect(404);
    expect(notFound.body).toMatchObject({ status: 404, error: 'Not Found' });
  });

  it('restringe CORS a los orígenes configurados', async () => {
    await build('http://localhost:5173, https://mediplan.app');
    const res = await request(app.getHttpServer())
      .get('/api/ping')
      .set('Origin', 'https://mediplan.app');
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://mediplan.app',
    );
  });
});
