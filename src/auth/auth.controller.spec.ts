import { Role } from '../common/enums/role.enum';
import { CAREGIVER } from '../common/testing/mocks';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  const service = {
    register: jest.fn(),
    login: jest.fn(),
    verifyTwoFactorLogin: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    me: jest.fn(),
    updateMe: jest.fn(),
    changePassword: jest.fn(),
    setupTwoFactor: jest.fn(),
    enableTwoFactor: jest.fn(),
    disableTwoFactor: jest.fn(),
  };
  const controller = new AuthController(service as unknown as AuthService);

  it('delega cada endpoint en AuthService', async () => {
    const register = {
      nombre: 'x',
      email: 'x@x.com',
      password: 'Secreta123',
      rol: Role.CAREGIVER,
    };
    await controller.register(register);
    expect(service.register).toHaveBeenCalledWith(register);

    await controller.login({ email: 'x@x.com', password: 'p' }, 'agent');
    expect(service.login).toHaveBeenCalledWith(
      { email: 'x@x.com', password: 'p' },
      'agent',
    );

    await controller.verifyTwoFactor(
      { twoFactorToken: 't', code: '123456' },
      'a',
    );
    expect(service.verifyTwoFactorLogin).toHaveBeenCalledWith(
      't',
      '123456',
      'a',
    );

    await controller.refresh({ refreshToken: 'r' });
    expect(service.refresh).toHaveBeenCalledWith('r');

    await controller.logout(CAREGIVER);
    expect(service.logout).toHaveBeenCalledWith(CAREGIVER);

    await controller.me(CAREGIVER);
    expect(service.me).toHaveBeenCalledWith(CAREGIVER);

    await controller.updateMe(CAREGIVER, { nombre: 'n' });
    expect(service.updateMe).toHaveBeenCalledWith(CAREGIVER, { nombre: 'n' });

    const pwd = { currentPassword: 'a', newPassword: 'B1234567' };
    await controller.changePassword(CAREGIVER, pwd);
    expect(service.changePassword).toHaveBeenCalledWith(CAREGIVER, pwd);

    await controller.setupTwoFactor(CAREGIVER);
    expect(service.setupTwoFactor).toHaveBeenCalledWith(CAREGIVER);

    await controller.enableTwoFactor(CAREGIVER, { code: '123456' });
    expect(service.enableTwoFactor).toHaveBeenCalledWith(CAREGIVER, '123456');

    await controller.disableTwoFactor(CAREGIVER, { code: '654321' });
    expect(service.disableTwoFactor).toHaveBeenCalledWith(CAREGIVER, '654321');
  });
});
