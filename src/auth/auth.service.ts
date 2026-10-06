import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { IsNull, Not, Repository } from 'typeorm';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { Usuario } from '../users/entities/usuario.entity';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Sesion } from './entities/sesion.entity';
import {
  AccessTokenPayload,
  AuthTokens,
  RefreshTokenPayload,
  TwoFactorTokenPayload,
} from './interfaces/jwt-payload.interface';
import { TwoFactorService, TwoFactorSetup } from './two-factor.service';

export type LoginResult =
  | (AuthTokens & { requiresTwoFactor: false; usuario: Usuario })
  | { requiresTwoFactor: true; twoFactorToken: string; expiresIn: number };

const TWO_FACTOR_TOKEN_TTL_SECONDS = 300;
const INVALID_CREDENTIALS = 'Credenciales inválidas';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly twoFactor: TwoFactorService,
    @InjectRepository(Sesion)
    private readonly sesiones: Repository<Sesion>,
  ) {}

  register(dto: RegisterDto): Promise<Usuario> {
    return this.users.create(dto);
  }

  /**
   * Paso 1 del login. Si el usuario tiene 2FA activo devuelve un token
   * temporal (5 min) que debe canjearse en /auth/2fa/verify junto al código.
   */
  async login(dto: LoginDto, userAgent?: string): Promise<LoginResult> {
    const usuario = await this.users.findByEmailWithSecrets(dto.email);
    if (!usuario || !(await this.users.verifyPassword(usuario, dto.password))) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    this.ensureActive(usuario);

    if (usuario.twoFactorEnabled) {
      const payload: TwoFactorTokenPayload = { sub: usuario.id, type: '2fa' };
      const twoFactorToken = await this.jwt.signAsync(payload, {
        expiresIn: TWO_FACTOR_TOKEN_TTL_SECONDS,
      });
      return {
        requiresTwoFactor: true,
        twoFactorToken,
        expiresIn: TWO_FACTOR_TOKEN_TTL_SECONDS,
      };
    }

    return this.completeLogin(usuario, userAgent);
  }

  /** Paso 2 del login cuando el usuario tiene 2FA activo. */
  async verifyTwoFactorLogin(
    twoFactorToken: string,
    code: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    const payload = await this.verifyToken<TwoFactorTokenPayload>(
      twoFactorToken,
      '2fa',
    );
    const usuario = await this.users.findByIdWithSecrets(payload.sub);
    this.ensureActive(usuario);
    if (
      !usuario.twoFactorEnabled ||
      !usuario.twoFactorSecret ||
      !this.twoFactor.verify(code, usuario.twoFactorSecret)
    ) {
      throw new UnauthorizedException('Código de verificación inválido');
    }
    return this.completeLogin(usuario, userAgent);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = await this.verifyToken<RefreshTokenPayload>(
      refreshToken,
      'refresh',
      this.refreshSecret,
    );
    const sesion = await this.sesiones.findOne({
      where: { id: payload.sid },
      relations: { usuario: true },
    });
    if (
      !sesion ||
      sesion.revocadaEn ||
      sesion.expiraEn.getTime() < Date.now() ||
      sesion.refreshTokenHash !== this.hashToken(refreshToken)
    ) {
      throw new UnauthorizedException('Refresh token inválido o revocado');
    }
    this.ensureActive(sesion.usuario);

    // Rotación: el refresh token anterior deja de servir.
    const tokens = await this.signTokens(sesion.usuario, sesion.id);
    sesion.refreshTokenHash = this.hashToken(tokens.refreshToken);
    sesion.expiraEn = this.refreshExpiry();
    await this.sesiones.save(sesion);
    return tokens;
  }

  async logout(user: AuthenticatedUser): Promise<{ message: string }> {
    await this.sesiones.update(
      { id: user.sessionId, revocadaEn: IsNull() },
      { revocadaEn: new Date() },
    );
    return { message: 'Sesión cerrada correctamente' };
  }

  /** Usado por JwtStrategy en cada request protegido. */
  async validateAccessPayload(
    payload: AccessTokenPayload,
  ): Promise<AuthenticatedUser> {
    if (payload.type !== 'access' || !payload.sid) {
      throw new UnauthorizedException('Token inválido');
    }
    const sesion = await this.sesiones.findOne({
      where: { id: payload.sid },
      relations: { usuario: true },
    });
    if (!sesion || sesion.revocadaEn || sesion.usuarioId !== payload.sub) {
      throw new UnauthorizedException('La sesión ha finalizado');
    }
    if (!sesion.usuario.activo) {
      throw new UnauthorizedException('Usuario inactivo');
    }
    return {
      id: sesion.usuario.id,
      email: sesion.usuario.email,
      nombre: sesion.usuario.nombre,
      rol: sesion.usuario.rol, // rol vigente en BD (cambios del admin aplican al instante)
      sessionId: sesion.id,
    };
  }

  me(user: AuthenticatedUser): Promise<Usuario> {
    return this.users.findById(user.id);
  }

  updateMe(user: AuthenticatedUser, dto: UpdateProfileDto): Promise<Usuario> {
    return this.users.updateProfile(user.id, dto);
  }

  /** Cambia la contraseña y cierra las demás sesiones abiertas. */
  async changePassword(
    user: AuthenticatedUser,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    await this.users.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
    await this.sesiones.update(
      { usuarioId: user.id, id: Not(user.sessionId), revocadaEn: IsNull() },
      { revocadaEn: new Date() },
    );
    return { message: 'Contraseña actualizada correctamente' };
  }

  // ---------------------------------------------------------------- 2FA

  async setupTwoFactor(user: AuthenticatedUser): Promise<TwoFactorSetup> {
    const usuario = await this.users.findById(user.id);
    if (usuario.twoFactorEnabled) {
      throw new ConflictException('El 2FA ya está activo');
    }
    const setup = await this.twoFactor.generateSetup(usuario.email);
    await this.users.setTwoFactorSecret(usuario.id, setup.secret);
    return setup;
  }

  async enableTwoFactor(
    user: AuthenticatedUser,
    code: string,
  ): Promise<{ message: string }> {
    const usuario = await this.users.findByIdWithSecrets(user.id);
    if (usuario.twoFactorEnabled) {
      throw new ConflictException('El 2FA ya está activo');
    }
    if (!usuario.twoFactorSecret) {
      throw new BadRequestException(
        'Primero debe generar el secreto en /auth/2fa/setup',
      );
    }
    if (!this.twoFactor.verify(code, usuario.twoFactorSecret)) {
      throw new UnauthorizedException('Código de verificación inválido');
    }
    await this.users.setTwoFactorEnabled(usuario.id, true);
    return { message: '2FA activado correctamente' };
  }

  async disableTwoFactor(
    user: AuthenticatedUser,
    code: string,
  ): Promise<{ message: string }> {
    const usuario = await this.users.findByIdWithSecrets(user.id);
    if (!usuario.twoFactorEnabled || !usuario.twoFactorSecret) {
      throw new BadRequestException('El 2FA no está activo');
    }
    if (!this.twoFactor.verify(code, usuario.twoFactorSecret)) {
      throw new UnauthorizedException('Código de verificación inválido');
    }
    await this.users.setTwoFactorEnabled(usuario.id, false);
    return { message: '2FA desactivado correctamente' };
  }

  // ---------------------------------------------------------------- helpers

  private async completeLogin(
    usuario: Usuario,
    userAgent?: string,
  ): Promise<LoginResult> {
    const sessionId = randomUUID();
    const tokens = await this.signTokens(usuario, sessionId);
    await this.sesiones.save(
      this.sesiones.create({
        id: sessionId,
        usuarioId: usuario.id,
        refreshTokenHash: this.hashToken(tokens.refreshToken),
        expiraEn: this.refreshExpiry(),
        userAgent: userAgent?.slice(0, 255) ?? null,
      }),
    );
    await this.users.touchLastLogin(usuario.id);
    const perfil = await this.users.findById(usuario.id);
    return { ...tokens, requiresTwoFactor: false, usuario: perfil };
  }

  private async signTokens(
    usuario: Usuario,
    sessionId: string,
  ): Promise<AuthTokens> {
    const accessPayload: AccessTokenPayload = {
      sub: usuario.id,
      sid: sessionId,
      email: usuario.email,
      rol: usuario.rol,
      type: 'access',
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: usuario.id,
      sid: sessionId,
      type: 'refresh',
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, { expiresIn: this.accessTtl }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.refreshSecret,
        expiresIn: this.refreshTtl,
        jwtid: randomUUID(),
      }),
    ]);
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTtl,
    };
  }

  private async verifyToken<T extends { type: string }>(
    token: string,
    type: T['type'],
    secret?: string,
  ): Promise<T> {
    let payload: T;
    try {
      payload = await this.jwt.verifyAsync<T & object>(
        token,
        secret ? { secret } : {},
      );
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (payload.type !== type) {
      throw new UnauthorizedException('Token inválido');
    }
    return payload;
  }

  private ensureActive(usuario: Usuario): void {
    if (!usuario.activo) {
      throw new ForbiddenException(
        'El usuario está inactivo. Contacte al administrador',
      );
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.refreshTtl * 1000);
  }

  private get accessTtl(): number {
    return Number(this.config.get<number>('JWT_ACCESS_TTL_SECONDS') ?? 900);
  }

  private get refreshTtl(): number {
    return Number(this.config.get<number>('JWT_REFRESH_TTL_SECONDS') ?? 604800);
  }

  private get refreshSecret(): string {
    return this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }
}
