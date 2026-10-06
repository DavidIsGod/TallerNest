import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

/** Envoltorio de otplib (TOTP, RFC 6238) para el segundo factor. */
@Injectable()
export class TwoFactorService {
  constructor(private readonly config: ConfigService) {
    // Acepta el código anterior/siguiente (±30 s) por desfases de reloj.
    authenticator.options = { window: 1 };
  }

  async generateSetup(email: string): Promise<TwoFactorSetup> {
    const secret = authenticator.generateSecret();
    const issuer = this.config.get<string>('TWO_FACTOR_APP_NAME', 'MediPlan');
    const otpauthUrl = authenticator.keyuri(email, issuer, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  verify(code: string, secret: string): boolean {
    try {
      return authenticator.verify({ token: code, secret });
    } catch {
      return false;
    }
  }
}
