import { ConfigService } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';
import { migrations } from '../database/migrations';

type EnvReader = Pick<ConfigService, 'get'>;

/**
 * Opciones de conexión compartidas por la aplicación y el CLI de migraciones.
 * Si existe DATABASE_URL (Render, Railway, etc.) tiene prioridad sobre DB_*.
 */
export function buildTypeOrmOptions(config: EnvReader): DataSourceOptions {
  const url = config.get<string>('DATABASE_URL');
  const ssl = config.get<boolean>('DB_SSL')
    ? { rejectUnauthorized: false }
    : false;

  const connection = url
    ? { url }
    : {
        host: config.get<string>('DB_HOST'),
        port: Number(config.get<number>('DB_PORT')),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
      };

  return {
    type: 'postgres',
    ...connection,
    ssl,
    synchronize: false,
    migrations,
    migrationsRun: true,
    dropSchema: config.get<boolean>('DB_DROP_SCHEMA') ?? false,
    logging: config.get<boolean>('DB_LOGGING') ?? false,
  };
}
