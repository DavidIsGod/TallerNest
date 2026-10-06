import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ADMIN_CREDENTIALS, bearer, createTestApp, login, totp } from './utils';

describe('Autenticación y autorización (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  const cuidador = {
    nombre: 'Rosa Martínez',
    email: 'rosa@correo.com',
    password: 'Secreta123',
    rol: 'ROLE_CAREGIVER',
    telefono: '+573001234567',
  };
  let cuidadorId: string;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
  });

  afterAll(() => app.close());

  it('GET /api/health es público', async () => {
    const res = await http.get('/api/health').expect(200);
    expect(res.body.data).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('GET /api/docs-json publica la documentación Swagger', async () => {
    const res = await http.get('/api/docs-json').expect(200);
    expect(res.body.info.title).toBe('MediPlan API');
    expect(Object.keys(res.body.paths)).toContain('/api/medicamentos');
  });

  it('las rutas protegidas exigen token (401)', async () => {
    const res = await http.get('/api/auth/me').expect(401);
    expect(res.body).toMatchObject({ status: 401, error: 'Unauthorized' });
    await http
      .get('/api/medicamentos')
      .set(bearer('token.invalido.x'))
      .expect(401);
  });

  describe('registro', () => {
    it('registra un cuidador sin exponer secretos', async () => {
      const res = await http
        .post('/api/auth/register')
        .send(cuidador)
        .expect(201);
      expect(res.body.data).toMatchObject({
        email: cuidador.email,
        rol: 'ROLE_CAREGIVER',
        twoFactorEnabled: false,
      });
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(res.body.data.twoFactorSecret).toBeUndefined();
      cuidadorId = res.body.data.id;
    });

    it('rechaza emails duplicados (409)', async () => {
      await http
        .post('/api/auth/register')
        .send({ ...cuidador, email: 'ROSA@correo.com' })
        .expect(409);
    });

    it('no permite auto-asignarse ROLE_ADMIN ni contraseñas débiles (400)', async () => {
      const res = await http
        .post('/api/auth/register')
        .send({
          ...cuidador,
          email: 'x@x.com',
          rol: 'ROLE_ADMIN',
          password: '123',
        })
        .expect(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('El rol debe ser')]),
      );
    });

    it('rechaza propiedades no permitidas (whitelist)', async () => {
      await http
        .post('/api/auth/register')
        .send({ ...cuidador, email: 'y@y.com', activo: false })
        .expect(400);
    });
  });

  describe('login, perfil y tokens', () => {
    it('rechaza credenciales inválidas (401)', async () => {
      await http
        .post('/api/auth/login')
        .send({ email: cuidador.email, password: 'Incorrecta1' })
        .expect(401);
    });

    it('inicia sesión y devuelve access + refresh token', async () => {
      const data = await login(app, cuidador.email, cuidador.password);
      expect(data).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 900,
        requiresTwoFactor: false,
      });
      accessToken = data.accessToken;
      refreshToken = data.refreshToken;
    });

    it('GET/PUT /api/auth/me consulta y actualiza el perfil', async () => {
      const me = await http
        .get('/api/auth/me')
        .set(bearer(accessToken))
        .expect(200);
      expect(me.body.data).toMatchObject({
        id: cuidadorId,
        nombre: cuidador.nombre,
      });
      expect(me.body.data.ultimoLogin).not.toBeNull();

      const upd = await http
        .put('/api/auth/me')
        .set(bearer(accessToken))
        .send({ nombre: 'Rosa M. Martínez' })
        .expect(200);
      expect(upd.body.data.nombre).toBe('Rosa M. Martínez');
    });

    it('POST /api/auth/refresh rota el refresh token', async () => {
      const res = await http
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);
      expect(res.body.data.refreshToken).not.toBe(refreshToken);
      // El refresh token anterior ya no sirve.
      await http.post('/api/auth/refresh').send({ refreshToken }).expect(401);
      refreshToken = res.body.data.refreshToken;
      accessToken = res.body.data.accessToken;
    });
  });

  describe('2FA (TOTP)', () => {
    let secret: string;

    it('genera el secreto y el QR', async () => {
      const res = await http
        .post('/api/auth/2fa/setup')
        .set(bearer(accessToken))
        .expect(201);
      secret = res.body.data.secret;
      expect(res.body.data.otpauthUrl).toContain('otpauth://totp/');
      expect(res.body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('rechaza códigos inválidos y activa con un código válido', async () => {
      await http
        .post('/api/auth/2fa/enable')
        .set(bearer(accessToken))
        .send({ code: '000000' })
        .expect(401);
      await http
        .post('/api/auth/2fa/enable')
        .set(bearer(accessToken))
        .send({ code: totp(secret) })
        .expect(200);
      await http
        .post('/api/auth/2fa/setup')
        .set(bearer(accessToken))
        .expect(409);
    });

    it('el login exige el segundo factor', async () => {
      const res = await http
        .post('/api/auth/login')
        .send({ email: cuidador.email, password: cuidador.password })
        .expect(200);
      expect(res.body.data).toMatchObject({ requiresTwoFactor: true });
      expect(res.body.data.accessToken).toBeUndefined();
      const { twoFactorToken } = res.body.data;

      await http
        .post('/api/auth/2fa/verify')
        .send({ twoFactorToken, code: '000000' })
        .expect(401);
      const ok = await http
        .post('/api/auth/2fa/verify')
        .send({ twoFactorToken, code: totp(secret) })
        .expect(200);
      expect(ok.body.data.accessToken).toBeDefined();
      accessToken = ok.body.data.accessToken;
    });

    it('el token temporal de 2FA no sirve como access token', async () => {
      const res = await http
        .post('/api/auth/login')
        .send({ email: cuidador.email, password: cuidador.password });
      await http
        .get('/api/auth/me')
        .set(bearer(res.body.data.twoFactorToken))
        .expect(401);
    });

    it('desactiva el 2FA con un código válido', async () => {
      await http
        .post('/api/auth/2fa/disable')
        .set(bearer(accessToken))
        .send({ code: totp(secret) })
        .expect(200);
      const data = await login(app, cuidador.email, cuidador.password);
      expect(data.accessToken).toBeDefined();
    });
  });

  describe('cambio de contraseña y logout', () => {
    it('valida la contraseña actual y cierra las demás sesiones', async () => {
      const otraSesion = await login(app, cuidador.email, cuidador.password);
      await http
        .put('/api/auth/change-password')
        .set(bearer(accessToken))
        .send({ currentPassword: 'Mala12345', newPassword: 'NuevaClave1' })
        .expect(401);
      await http
        .put('/api/auth/change-password')
        .set(bearer(accessToken))
        .send({
          currentPassword: cuidador.password,
          newPassword: 'NuevaClave1',
        })
        .expect(200);
      await http
        .get('/api/auth/me')
        .set(bearer(otraSesion.accessToken))
        .expect(401);
      await http.get('/api/auth/me').set(bearer(accessToken)).expect(200);
      await http
        .post('/api/auth/login')
        .send({ email: cuidador.email, password: cuidador.password })
        .expect(401);
      cuidador.password = 'NuevaClave1';
    });

    it('logout invalida el access token y el refresh token', async () => {
      const sesion = await login(app, cuidador.email, cuidador.password);
      await http
        .post('/api/auth/logout')
        .set(bearer(sesion.accessToken))
        .expect(200);
      await http
        .get('/api/auth/me')
        .set(bearer(sesion.accessToken))
        .expect(401);
      await http
        .post('/api/auth/refresh')
        .send({ refreshToken: sesion.refreshToken })
        .expect(401);
    });
  });

  describe('administración de roles (ROLE_ADMIN)', () => {
    let adminToken: string;
    let userToken: string;

    beforeAll(async () => {
      adminToken = (
        await login(app, ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password)
      ).accessToken;
      userToken = (await login(app, cuidador.email, cuidador.password))
        .accessToken;
    });

    it('solo el admin puede listar y gestionar usuarios', async () => {
      await http.get('/api/users').set(bearer(userToken)).expect(403);
      const res = await http
        .get('/api/users?rol=ROLE_CAREGIVER&search=rosa')
        .set(bearer(adminToken))
        .expect(200);
      expect(res.body.data.meta.totalItems).toBe(1);
      await http
        .get(`/api/users/${cuidadorId}`)
        .set(bearer(adminToken))
        .expect(200);
    });

    it('el admin crea usuarios con cualquier rol', async () => {
      const res = await http
        .post('/api/users')
        .set(bearer(adminToken))
        .send({
          nombre: 'Soporte',
          email: 'soporte@mediplan.com',
          password: 'Soporte123',
          rol: 'ROLE_ADMIN',
        })
        .expect(201);
      expect(res.body.data.rol).toBe('ROLE_ADMIN');
    });

    it('el cambio de rol aplica de inmediato a los permisos', async () => {
      await http
        .post('/api/contactos')
        .set(bearer(userToken))
        .send({ nombre: 'Hijo', relacion: 'Hijo', telefono: '+573001112233' })
        .expect(201);

      await http
        .patch(`/api/users/${cuidadorId}/role`)
        .set(bearer(adminToken))
        .send({ rol: 'ROLE_FAMILY' })
        .expect(200);

      await http
        .post('/api/contactos')
        .set(bearer(userToken))
        .send({ nombre: 'Otro', relacion: 'Hijo', telefono: '+573001112234' })
        .expect(403);

      await http
        .patch(`/api/users/${cuidadorId}/role`)
        .set(bearer(adminToken))
        .send({ rol: 'ROLE_SUPERUSER' })
        .expect(400);
    });

    it('el admin no puede cambiar su propio rol', async () => {
      const me = await http.get('/api/auth/me').set(bearer(adminToken));
      await http
        .patch(`/api/users/${me.body.data.id}/role`)
        .set(bearer(adminToken))
        .send({ rol: 'ROLE_FAMILY' })
        .expect(400);
    });

    it('desactivar un usuario bloquea su sesión y su login', async () => {
      await http
        .patch(`/api/users/${cuidadorId}/status`)
        .set(bearer(adminToken))
        .send({ activo: false })
        .expect(200);
      await http.get('/api/auth/me').set(bearer(userToken)).expect(401);
      await http
        .post('/api/auth/login')
        .send({ email: cuidador.email, password: cuidador.password })
        .expect(403);
    });

    it('valida UUIDs en los parámetros (400) y 404 para inexistentes', async () => {
      await http.get('/api/users/no-uuid').set(bearer(adminToken)).expect(400);
      await http
        .get('/api/users/00000000-0000-4000-8000-000000000000')
        .set(bearer(adminToken))
        .expect(404);
    });
  });
});
