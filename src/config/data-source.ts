import 'dotenv/config';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { buildTypeOrmOptions } from './typeorm.config';

/**
 * DataSource usado por el CLI de TypeORM (migration:generate / run / revert).
 */
const env = {
  get: <T>(key: string): T | undefined => {
    const value = process.env[key];
    if (value === 'true') return true as T;
    if (value === 'false') return false as T;
    return value as T;
  },
};

export default new DataSource({
  ...buildTypeOrmOptions(env),
  migrationsRun: false,
  dropSchema: false,
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
});
