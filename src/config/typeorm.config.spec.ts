import { createConfigMock } from '../common/testing/mocks';
import { envValidationSchema } from './env.validation';
import { buildTypeOrmOptions } from './typeorm.config';

describe('buildTypeOrmOptions', () => {
  it('usa DATABASE_URL y SSL cuando están definidos', () => {
    const options = buildTypeOrmOptions(
      createConfigMock({
        DATABASE_URL: 'postgres://u:p@host:5432/db',
        DB_SSL: true,
      }),
    );
    expect(options).toMatchObject({
      type: 'postgres',
      url: 'postgres://u:p@host:5432/db',
      ssl: { rejectUnauthorized: false },
      synchronize: false,
      migrationsRun: true,
      dropSchema: false,
      logging: false,
    });
  });

  it('usa las variables DB_* si no hay DATABASE_URL', () => {
    const options = buildTypeOrmOptions(
      createConfigMock({
        DB_HOST: 'localhost',
        DB_PORT: '5433',
        DB_USERNAME: 'postgres',
        DB_PASSWORD: 'secret',
        DB_NAME: 'mediplan',
        DB_DROP_SCHEMA: true,
        DB_LOGGING: true,
      }),
    );
    expect(options).toMatchObject({
      host: 'localhost',
      port: 5433,
      database: 'mediplan',
      ssl: false,
      dropSchema: true,
      logging: true,
    });
  });

  it('valida las variables de entorno obligatorias', () => {
    const { error } = envValidationSchema.validate({});
    expect(error?.message).toContain('JWT_ACCESS_SECRET');
    const ok = envValidationSchema.validate({
      JWT_ACCESS_SECRET: 'x'.repeat(16),
      JWT_REFRESH_SECRET: 'y'.repeat(16),
    });
    expect(ok.error).toBeUndefined();
    expect(ok.value).toMatchObject({ PORT: 3000, OMISION_HORAS: 2 });
  });
});
