import { authenticator } from 'otplib';
import { createConfigMock } from '../common/testing/mocks';
import { TwoFactorService } from './two-factor.service';

describe('TwoFactorService', () => {
  const service = new TwoFactorService(createConfigMock());

  it('genera secreto, URL otpauth y QR en data URL', async () => {
    const setup = await service.generateSetup('maria@correo.com');
    expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
    expect(setup.otpauthUrl).toContain(
      'otpauth://totp/MediPlan:maria%40correo.com',
    );
    expect(setup.qrCodeDataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('verifica códigos TOTP válidos e inválidos', () => {
    const secret = authenticator.generateSecret();
    expect(service.verify(authenticator.generate(secret), secret)).toBe(true);
    expect(service.verify('000000', secret)).toBe(false);
  });

  it('devuelve false si otplib lanza un error', () => {
    expect(service.verify('123456', '')).toBe(false);
  });
});
