import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { TwoFactorCodeDto, VerifyTwoFactorDto } from './dto/two-factor.dto';

const LOGIN_LIMIT = Number(process.env.LOGIN_THROTTLE_LIMIT ?? 5);

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Registro de nuevo usuario (CAREGIVER o FAMILY)' })
  @ApiCreatedResponse({ description: 'Usuario creado' })
  @ApiConflictResponse({ description: 'Email duplicado' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Inicio de sesión',
    description:
      'Devuelve accessToken + refreshToken. Si el usuario tiene 2FA activo devuelve { requiresTwoFactor: true, twoFactorToken } y el login se completa en POST /auth/2fa/verify.',
  })
  @ApiUnauthorizedResponse({ description: 'Credenciales inválidas' })
  @ApiForbiddenResponse({ description: 'Usuario inactivo' })
  @ApiTooManyRequestsResponse({
    description: 'Máx. 5 intentos por minuto por IP y email',
  })
  @ApiHeader({
    name: 'user-agent',
    required: false,
    description: 'Se guarda en la sesión (opcional)',
  })
  login(@Body() dto: LoginDto, @Headers('user-agent') userAgent?: string) {
    return this.authService.login(dto, userAgent);
  }

  @Public()
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 60000 } })
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Segundo paso del login con código TOTP' })
  @ApiUnauthorizedResponse({ description: 'Código o token temporal inválido' })
  @ApiHeader({
    name: 'user-agent',
    required: false,
    description: 'Se guarda en la sesión (opcional)',
  })
  verifyTwoFactor(
    @Body() dto: VerifyTwoFactorDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.verifyTwoFactorLogin(
      dto.twoFactorToken,
      dto.code,
      userAgent,
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar el access token (rota el refresh token)' })
  @ApiUnauthorizedResponse({ description: 'Refresh token inválido o revocado' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cerrar sesión',
    description:
      'Revoca la sesión: el access token y el refresh token dejan de ser válidos.',
  })
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Perfil del usuario autenticado' })
  @ApiOkResponse()
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user);
  }

  @ApiBearerAuth()
  @Put('me')
  @ApiOperation({ summary: 'Actualizar el perfil propio' })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateMe(user, dto);
  }

  @ApiBearerAuth()
  @Put('change-password')
  @ApiOperation({
    summary: 'Cambiar contraseña (cierra las demás sesiones abiertas)',
  })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user, dto);
  }

  @ApiBearerAuth()
  @Post('2fa/setup')
  @ApiOperation({
    summary: 'Generar secreto 2FA (TOTP) y código QR',
    description:
      'Escanee el QR con Google Authenticator / Authy y confirme en /auth/2fa/enable.',
  })
  setupTwoFactor(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.setupTwoFactor(user);
  }

  @ApiBearerAuth()
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar 2FA confirmando un código válido' })
  enableTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TwoFactorCodeDto,
  ) {
    return this.authService.enableTwoFactor(user, dto.code);
  }

  @ApiBearerAuth()
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar 2FA (requiere un código válido)' })
  disableTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TwoFactorCodeDto,
  ) {
    return this.authService.disableTwoFactor(user, dto.code);
  }
}
