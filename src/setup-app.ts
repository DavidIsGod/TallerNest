import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

export const API_PREFIX = 'api';
export const SWAGGER_PATH = 'api/docs';

/**
 * Configuración global compartida por main.ts y las pruebas e2e:
 * prefijo /api, validación, formato de respuesta/errores, seguridad y Swagger.
 */
export function setupApp(app: INestApplication): INestApplication {
  const config = app.get(ConfigService);

  app.setGlobalPrefix(API_PREFIX);
  // Detrás del proxy de Render/Heroku: usar la IP real del cliente (rate limiting).
  (
    app.getHttpAdapter().getInstance() as {
      set: (k: string, v: unknown) => void;
    }
  ).set('trust proxy', 1);
  app.use(helmet());
  const origins = config.get<string>('CORS_ORIGINS', '*');
  app.enableCors({
    origin: origins === '*' ? true : origins.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new ResponseInterceptor(),
  );

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('MediPlan API')
      .setDescription(
        [
          'Sistema de gestión y seguimiento de medicamentos para adultos mayores y sus cuidadores.',
          '',
          '**Autenticación:** JWT (Bearer) + 2FA opcional (TOTP). Haga login en `POST /api/auth/login` y pulse **Authorize** con el `accessToken`.',
          '',
          '**Roles:** `ROLE_ADMIN`, `ROLE_CAREGIVER` (cuidador/paciente), `ROLE_FAMILY` (familiar remoto, solo lectura).',
          '',
          '**Formato de respuesta:** `{ status, message, data, timestamp }`. Errores: `{ status, error, message, timestamp, path }`.',
        ].join('\n'),
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  app.enableShutdownHooks();
  return app;
}
