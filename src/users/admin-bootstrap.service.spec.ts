import { Logger } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import { createConfigMock } from '../common/testing/mocks';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { UsersService } from './users.service';

describe('AdminBootstrapService', () => {
  const users = {
    countByRole: jest.fn(),
    findByEmail: jest.fn(),
    create: jest.fn(),
  };
  const service = new AdminBootstrapService(
    users as unknown as UsersService,
    createConfigMock({ ADMIN_EMAIL: 'root@mediplan.com' }),
  );

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  beforeEach(() => jest.clearAllMocks());

  it('no hace nada si ya existe un administrador', async () => {
    users.countByRole.mockResolvedValue(1);
    await service.onApplicationBootstrap();
    expect(users.create).not.toHaveBeenCalled();
  });

  it('no crea el admin si el email ya está tomado', async () => {
    users.countByRole.mockResolvedValue(0);
    users.findByEmail.mockResolvedValue({ id: 'x' });
    await service.onApplicationBootstrap();
    expect(users.create).not.toHaveBeenCalled();
  });

  it('crea el administrador inicial con las variables de entorno', async () => {
    users.countByRole.mockResolvedValue(0);
    users.findByEmail.mockResolvedValue(null);
    await service.onApplicationBootstrap();
    expect(users.create).toHaveBeenCalledWith({
      nombre: 'Administrador MediPlan',
      email: 'root@mediplan.com',
      password: 'Admin123*',
      rol: Role.ADMIN,
    });
  });
});
