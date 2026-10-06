import { CAREGIVER, FAMILY } from '../common/testing/mocks';
import { ContactosController } from './contactos.controller';
import { ContactosService } from './contactos.service';

describe('ContactosController', () => {
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    misPacientes: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    setNotificaciones: jest.fn(),
  };
  const controller = new ContactosController(
    service as unknown as ContactosService,
  );

  it('delega cada endpoint en ContactosService', async () => {
    const dto = { nombre: 'x', relacion: 'y', telefono: '+573001234567' };
    await controller.create(CAREGIVER, dto);
    expect(service.create).toHaveBeenCalledWith(CAREGIVER, dto);

    await controller.findAll(FAMILY, { pacienteId: 'p1' });
    expect(service.findAll).toHaveBeenCalledWith(FAMILY, 'p1');

    await controller.misPacientes(FAMILY);
    expect(service.misPacientes).toHaveBeenCalledWith(FAMILY);

    await controller.findOne(FAMILY, 'c1');
    expect(service.findOne).toHaveBeenCalledWith(FAMILY, 'c1');

    await controller.update(CAREGIVER, 'c1', { nombre: 'z' });
    expect(service.update).toHaveBeenCalledWith(CAREGIVER, 'c1', {
      nombre: 'z',
    });

    await controller.remove(CAREGIVER, 'c1');
    expect(service.remove).toHaveBeenCalledWith(CAREGIVER, 'c1');

    await controller.setNotificaciones(CAREGIVER, 'c1', {
      recibeNotificaciones: false,
    });
    expect(service.setNotificaciones).toHaveBeenCalledWith(
      CAREGIVER,
      'c1',
      false,
    );
  });
});
