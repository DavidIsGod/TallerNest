import { Role } from '../../common/enums/role.enum';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  email: string;
  rol: Role;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  type: 'refresh';
}

export interface TwoFactorTokenPayload {
  sub: string;
  type: '2fa';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}
