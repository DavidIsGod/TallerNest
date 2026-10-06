import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SeedService } from './seed.service';

/** Script de carga inicial: `npm run seed` (o `npm run seed:prod`). */
async function bootstrap() {
  process.env.SCHEDULER_ENABLED = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const result = await app.get(SeedService).run();
    Logger.log(JSON.stringify(result, null, 2), 'Seed');
  } finally {
    await app.close();
  }
}

void bootstrap();
