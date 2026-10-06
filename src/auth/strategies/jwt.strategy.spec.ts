import { Role } from '../../common/enums/role.enum';
import { CAREGIVER, createConfigMock } from '../../common/testing/mocks';
import { AuthService } from '../auth.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  it('valida el payload a través de AuthService', async () => {
    const authService = {
      validateAccessPayload: jest.fn().mockResolvedValue(CAREGIVER),
    };
    const strategy = new JwtStrategy(
      createConfigMock({ JWT_ACCESS_SECRET: 'secret-for-tests' }),
      authService as unknown as AuthService,
    );
    const payload = {
      sub: CAREGIVER.id,
      sid: 's1',
      email: CAREGIVER.email,
      rol: Role.CAREGIVER,
      type: 'access' as const,
    };
    await expect(strategy.validate(payload)).resolves.toBe(CAREGIVER);
    expect(authService.validateAccessPayload).toHaveBeenCalledWith(payload);
  });
});
