import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp, SWAGGER_PATH } from './setup-app';

async function bootstrap() {
  const app = setupApp(await NestFactory.create(AppModule));
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(
    `MediPlan API escuchando en http://localhost:${port}/api`,
    'Bootstrap',
  );
  Logger.log(
    `Swagger en http://localhost:${port}/${SWAGGER_PATH}`,
    'Bootstrap',
  );
}

void bootstrap();
