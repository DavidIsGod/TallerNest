import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { authenticator } from 'otplib';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = setupApp(
    moduleRef.createNestApplication<INestApplication<App>>(),
  );
  await app.init();
  return app;
}

export const ADMIN_CREDENTIALS = {
  email: 'admin@mediplan.com',
  password: 'Admin123*',
};

export interface LoginData {
  accessToken: string;
  refreshToken: string;
  usuario: { id: string; rol: string };
}

export async function login(
  app: INestApplication<App>,
  email: string,
  password: string,
): Promise<LoginData> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return (res.body as { data: LoginData }).data;
}

/** Código TOTP válido para un secreto (simula la app autenticadora). */
export const totp = (secret: string) => authenticator.generate(secret);

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Fecha local (YYYY-MM-DD) en la zona horaria de la app. */
export function localDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIMEZONE ?? 'America/Bogota',
  }).format(d);
}
