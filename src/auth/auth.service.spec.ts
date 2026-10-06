import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { Role } from '../common/enums/role.enum';
import {
  CAREGIVER,
  createConfigMock,
  createMockRepository,
  MockRepository,
} from '../common/testing/mocks';
import { Usuario } from '../users/entities/usuario.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { Sesion } from './entities/sesion.entity';
import { TwoFactorService } from './two-factor.service';

const ACCESS_SECRET = 'access-secret-for-tests';
const REFRESH_SECRET = 'refresh-secret-for-tests';
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

describe('AuthService', () => {
  let service: AuthService;
  let jwt: JwtService;
  let sesiones: MockRepository;
  let users: jest.Mocked<
    Pick<
      UsersService,
      | 'create'
      | 'findById'
      | 'findByEmailWithSecrets'
      | 'findByIdWithSecrets'
      | 'verifyPassword'
      | 'touchLastLogin'
      | 'updateProfile'
      | 'changePassword'
      | 'setTwoFactorSecret'
      | 'setTwoFactorEnabled'
    >
  >;
  let twoFactor: { generateSetup: jest.Mock; verify: jest.Mock };

  const usuario = (overrides: Partial<Usuario> = {}): Usuario =>
    ({
      id: CAREGIVER.id,
      nombre: CAREGIVER.nombre,
      email: CAREGIVER.email,
      rol: Role.CAREGIVER,
      activo: true,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      passwordHash: 'hash',
      ...overrides,
    }) as Usuario;

  beforeEach(() => {
    jwt = new JwtService({ secret: ACCESS_SECRET });
    sesiones = createMockRepository();
    users = {
      create: jest.fn(),
      findById: jest.fn().mockResolvedValue(usuario()),
      findByEmailWithSecrets: jest.fn().mockResolvedValue(usuario()),
      findByIdWithSecrets: jest.fn().mockResolvedValue(usuario()),
      verifyPassword: jest.fn().mockResolvedValue(true),
      touchLastLogin: jest.fn(),
      updateProfile: jest.fn(),
      changePassword: jest.fn(),
      setTwoFactorSecret: jest.fn(),
      setTwoFactorEnabled: jest.fn(),
    };
    twoFactor = { generateSetup: jest.fn(), verify: jest.fn() };
    service = new AuthService(
      users as unknown as UsersService,
      jwt,
      createConfigMock({
        JWT_REFRESH_SECRET: REFRESH_SECRET,
        JWT_ACCESS_TTL_SECONDS: 900,
        JWT_REFRESH_TTL_SECONDS: 3600,
      }),
      twoFactor as unknown as TwoFactorService,
      sesiones as never,
    );
  });

  it('register delega en UsersService', async () => {
    const dto = {
      nombre: 'x',
      email: 'x@x.com',
      password: 'Secreta123',
      rol: Role.FAMILY,
    };
    await service.register(dto);
    expect(users.create).toHaveBeenCalledWith(dto);
  });

  describe('login', () => {
    it('emite access y refresh token y crea una sesión', async () => {
      const result = await service.login(
        { email: CAREGIVER.email, password: 'ok' },
        'jest-agent',
      );
      if (result.requiresTwoFactor) throw new Error('no esperado');
      const payload = jwt.verify<Record<string, unknown>>(result.accessToken);
      expect(payload).toMatchObject({
        sub: CAREGIVER.id,
        rol: Role.CAREGIVER,
        type: 'access',
      });
      const refresh = jwt.verify<Record<string, unknown>>(result.refreshToken, {
        secret: REFRESH_SECRET,
      });
      expect(refresh).toMatchObject({ type: 'refresh', sid: payload.sid });
      const sesion = sesiones.create.mock.calls[0][0] as Sesion;
      expect(sesion).toMatchObject({
        id: payload.sid,
        usuarioId: CAREGIVER.id,
        refreshTokenHash: sha(result.refreshToken),
        userAgent: 'jest-agent',
      });
      expect(users.touchLastLogin).toHaveBeenCalledWith(CAREGIVER.id);
      expect(result.expiresIn).toBe(900);
    });

    it('rechaza credenciales inválidas con 401', async () => {
      users.verifyPassword.mockResolvedValueOnce(false);
      await expect(
        service.login({ email: 'x@x.com', password: 'mala' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      users.findByEmailWithSecrets.mockResolvedValueOnce(null);
      await expect(
        service.login({ email: 'x@x.com', password: 'mala' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza usuarios inactivos con 403', async () => {
      users.findByEmailWithSecrets.mockResolvedValueOnce(
        usuario({ activo: false }),
      );
      await expect(
        service.login({ email: 'x@x.com', password: 'ok' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('si el 2FA está activo devuelve un token temporal en lugar de tokens', async () => {
      users.findByEmailWithSecrets.mockResolvedValueOnce(
        usuario({ twoFactorEnabled: true, twoFactorSecret: 'S' }),
      );
      const result = await service.login({ email: 'x@x.com', password: 'ok' });
      expect(result.requiresTwoFactor).toBe(true);
      if (!result.requiresTwoFactor) throw new Error('no esperado');
      expect(
        jwt.verify<Record<string, unknown>>(result.twoFactorToken).type,
      ).toBe('2fa');
      expect(sesiones.save).not.toHaveBeenCalled();
    });
  });

  describe('verifyTwoFactorLogin', () => {
    const tokenDe = (type: string) =>
      jwt.sign({ sub: CAREGIVER.id, type }, { expiresIn: 60 });

    beforeEach(() => {
      users.findByIdWithSecrets.mockResolvedValue(
        usuario({ twoFactorEnabled: true, twoFactorSecret: 'S' }),
      );
    });

    it('completa el login con un código válido', async () => {
      twoFactor.verify.mockReturnValue(true);
      const result = await service.verifyTwoFactorLogin(
        tokenDe('2fa'),
        '123456',
      );
      expect(result.requiresTwoFactor).toBe(false);
      expect(twoFactor.verify).toHaveBeenCalledWith('123456', 'S');
    });

    it('rechaza códigos inválidos', async () => {
      twoFactor.verify.mockReturnValue(false);
      await expect(
        service.verifyTwoFactorLogin(tokenDe('2fa'), '000000'),
      ).rejects.toThrow('Código de verificación inválido');
    });

    it('rechaza tokens de otro tipo o inválidos', async () => {
      await expect(
        service.verifyTwoFactorLogin(tokenDe('access'), '123456'),
      ).rejects.toThrow('Token inválido');
      await expect(
        service.verifyTwoFactorLogin('no-es-un-jwt', '123456'),
      ).rejects.toThrow('Token inválido o expirado');
    });

    it('rechaza si el usuario ya no tiene 2FA activo', async () => {
      users.findByIdWithSecrets.mockResolvedValueOnce(usuario());
      await expect(
        service.verifyTwoFactorLogin(tokenDe('2fa'), '123456'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    const refreshToken = (sid = 's1', type = 'refresh') =>
      jwt.sign(
        { sub: CAREGIVER.id, sid, type },
        { secret: REFRESH_SECRET, expiresIn: 60 },
      );

    it('rota el refresh token de una sesión válida', async () => {
      const token = refreshToken();
      const sesion = {
        id: 's1',
        usuario: usuario(),
        revocadaEn: null,
        expiraEn: new Date(Date.now() + 60000),
        refreshTokenHash: sha(token),
      };
      sesiones.findOne.mockResolvedValue(sesion);
      const tokens = await service.refresh(token);
      expect(tokens.refreshToken).not.toBe(token);
      expect(sesion.refreshTokenHash).toBe(sha(tokens.refreshToken));
      expect(sesiones.save).toHaveBeenCalledWith(sesion);
    });

    it.each([
      ['inexistente', null],
      [
        'revocada',
        { revocadaEn: new Date(), expiraEn: new Date(Date.now() + 1000) },
      ],
      ['expirada', { revocadaEn: null, expiraEn: new Date(Date.now() - 1000) }],
      [
        'con otro token',
        {
          revocadaEn: null,
          expiraEn: new Date(Date.now() + 1000),
          refreshTokenHash: 'otro',
        },
      ],
    ])('rechaza una sesión %s', async (_caso, sesion) => {
      sesiones.findOne.mockResolvedValue(sesion);
      await expect(service.refresh(refreshToken())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rechaza tokens firmados con el secreto de access', async () => {
      const token = jwt.sign({ sub: 'x', sid: 's', type: 'refresh' });
      await expect(service.refresh(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rechaza si el usuario fue desactivado', async () => {
      const token = refreshToken();
      sesiones.findOne.mockResolvedValue({
        usuario: usuario({ activo: false }),
        revocadaEn: null,
        expiraEn: new Date(Date.now() + 60000),
        refreshTokenHash: sha(token),
      });
      await expect(service.refresh(token)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  it('logout revoca la sesión actual', async () => {
    await expect(service.logout(CAREGIVER)).resolves.toEqual({
      message: 'Sesión cerrada correctamente',
    });
    expect(sesiones.update.mock.calls[0][0]).toMatchObject({
      id: CAREGIVER.sessionId,
    });
    expect(sesiones.update.mock.calls[0][1].revocadaEn).toBeInstanceOf(Date);
  });

  describe('validateAccessPayload', () => {
    const payload = {
      sub: CAREGIVER.id,
      sid: 's1',
      email: CAREGIVER.email,
      rol: Role.CAREGIVER,
      type: 'access' as const,
    };

    it('devuelve el usuario autenticado con el rol vigente en BD', async () => {
      sesiones.findOne.mockResolvedValue({
        id: 's1',
        usuarioId: CAREGIVER.id,
        revocadaEn: null,
        usuario: usuario({ rol: Role.FAMILY }),
      });
      await expect(service.validateAccessPayload(payload)).resolves.toEqual({
        id: CAREGIVER.id,
        email: CAREGIVER.email,
        nombre: CAREGIVER.nombre,
        rol: Role.FAMILY,
        sessionId: 's1',
      });
    });

    it('rechaza tokens que no son de acceso', async () => {
      await expect(
        service.validateAccessPayload({
          ...payload,
          type: 'refresh',
        } as never),
      ).rejects.toThrow('Token inválido');
    });

    it('rechaza sesiones revocadas o de otro usuario', async () => {
      sesiones.findOne.mockResolvedValue({
        usuarioId: CAREGIVER.id,
        revocadaEn: new Date(),
      });
      await expect(service.validateAccessPayload(payload)).rejects.toThrow(
        'La sesión ha finalizado',
      );
      sesiones.findOne.mockResolvedValue({
        usuarioId: 'otro',
        revocadaEn: null,
      });
      await expect(service.validateAccessPayload(payload)).rejects.toThrow(
        'La sesión ha finalizado',
      );
    });

    it('rechaza usuarios inactivos', async () => {
      sesiones.findOne.mockResolvedValue({
        usuarioId: CAREGIVER.id,
        revocadaEn: null,
        usuario: usuario({ activo: false }),
      });
      await expect(service.validateAccessPayload(payload)).rejects.toThrow(
        'Usuario inactivo',
      );
    });
  });

  it('me y updateMe delegan en UsersService', async () => {
    await service.me(CAREGIVER);
    expect(users.findById).toHaveBeenCalledWith(CAREGIVER.id);
    await service.updateMe(CAREGIVER, { nombre: 'Nuevo' });
    expect(users.updateProfile).toHaveBeenCalledWith(CAREGIVER.id, {
      nombre: 'Nuevo',
    });
  });

  it('changePassword cambia la contraseña y revoca las otras sesiones', async () => {
    await service.changePassword(CAREGIVER, {
      currentPassword: 'Actual123',
      newPassword: 'Nueva1234',
    });
    expect(users.changePassword).toHaveBeenCalledWith(
      CAREGIVER.id,
      'Actual123',
      'Nueva1234',
    );
    expect(sesiones.update.mock.calls[0][0]).toMatchObject({
      usuarioId: CAREGIVER.id,
    });
  });

  describe('2FA', () => {
    it('setup genera y guarda el secreto', async () => {
      twoFactor.generateSetup.mockResolvedValue({
        secret: 'S',
        otpauthUrl: 'u',
      });
      await expect(service.setupTwoFactor(CAREGIVER)).resolves.toMatchObject({
        secret: 'S',
      });
      expect(users.setTwoFactorSecret).toHaveBeenCalledWith(CAREGIVER.id, 'S');
    });

    it('setup falla si el 2FA ya está activo', async () => {
      users.findById.mockResolvedValueOnce(usuario({ twoFactorEnabled: true }));
      await expect(service.setupTwoFactor(CAREGIVER)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('enable activa el 2FA con un código válido', async () => {
      users.findByIdWithSecrets.mockResolvedValue(
        usuario({ twoFactorSecret: 'S' }),
      );
      twoFactor.verify.mockReturnValue(true);
      await service.enableTwoFactor(CAREGIVER, '123456');
      expect(users.setTwoFactorEnabled).toHaveBeenCalledWith(
        CAREGIVER.id,
        true,
      );
    });

    it('enable valida estado, secreto y código', async () => {
      users.findByIdWithSecrets.mockResolvedValueOnce(
        usuario({ twoFactorEnabled: true }),
      );
      await expect(
        service.enableTwoFactor(CAREGIVER, '1'),
      ).rejects.toBeInstanceOf(ConflictException);

      users.findByIdWithSecrets.mockResolvedValueOnce(usuario());
      await expect(
        service.enableTwoFactor(CAREGIVER, '1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      users.findByIdWithSecrets.mockResolvedValueOnce(
        usuario({ twoFactorSecret: 'S' }),
      );
      twoFactor.verify.mockReturnValue(false);
      await expect(
        service.enableTwoFactor(CAREGIVER, '1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('disable desactiva el 2FA con un código válido', async () => {
      users.findByIdWithSecrets.mockResolvedValue(
        usuario({ twoFactorEnabled: true, twoFactorSecret: 'S' }),
      );
      twoFactor.verify.mockReturnValue(true);
      await service.disableTwoFactor(CAREGIVER, '123456');
      expect(users.setTwoFactorEnabled).toHaveBeenCalledWith(
        CAREGIVER.id,
        false,
      );

      twoFactor.verify.mockReturnValue(false);
      await expect(
        service.disableTwoFactor(CAREGIVER, '1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('disable falla si el 2FA no está activo', async () => {
      users.findByIdWithSecrets.mockResolvedValueOnce(usuario());
      await expect(
        service.disableTwoFactor(CAREGIVER, '1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('usa los TTL por defecto si no están configurados', async () => {
    const svc = new AuthService(
      users as unknown as UsersService,
      jwt,
      createConfigMock({ JWT_REFRESH_SECRET: REFRESH_SECRET }),
      twoFactor as unknown as TwoFactorService,
      sesiones as never,
    );
    const result = await svc.login({ email: 'x@x.com', password: 'ok' });
    expect(result.expiresIn).toBe(900);
  });
});
