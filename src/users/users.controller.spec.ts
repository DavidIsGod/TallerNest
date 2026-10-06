import { Role } from '../common/enums/role.enum';
import { ADMIN } from '../common/testing/mocks';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  const service = {
    create: jest.fn().mockResolvedValue({ id: 'u1' }),
    findAll: jest.fn().mockResolvedValue({ items: [] }),
    findById: jest.fn().mockResolvedValue({ id: 'u1' }),
    updateRole: jest.fn().mockResolvedValue({ id: 'u1', rol: Role.FAMILY }),
    updateStatus: jest.fn().mockResolvedValue({ id: 'u1', activo: false }),
  };
  const controller = new UsersController(service as unknown as UsersService);

  it('delega cada operación en UsersService', async () => {
    const dto = {
      nombre: 'x',
      email: 'x@x.com',
      password: 'Secreta123',
      rol: Role.CAREGIVER,
    };
    await controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);

    await controller.findAll({ page: 1, size: 10 });
    expect(service.findAll).toHaveBeenCalled();

    await controller.findOne('u1');
    expect(service.findById).toHaveBeenCalledWith('u1');

    await controller.updateRole('u1', { rol: Role.FAMILY }, ADMIN);
    expect(service.updateRole).toHaveBeenCalledWith(
      'u1',
      Role.FAMILY,
      ADMIN.id,
    );

    await controller.updateStatus('u1', { activo: false }, ADMIN);
    expect(service.updateStatus).toHaveBeenCalledWith('u1', false, ADMIN.id);
  });
});
