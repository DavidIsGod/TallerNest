import { CAREGIVER, FAMILY } from '../common/testing/mocks';
import { MedicamentosController } from './medicamentos.controller';
import { MedicamentosService } from './medicamentos.service';

describe('MedicamentosController', () => {
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    toggle: jest.fn(),
    remove: jest.fn(),
  };
  const controller = new MedicamentosController(
    service as unknown as MedicamentosService,
  );

  it('delega cada endpoint en MedicamentosService', async () => {
    const dto = {
      nombre: 'x',
      principioActivo: 'y',
      dosis: '1',
      frecuencia: 'f',
      horarios: ['08:00'],
      fechaInicio: '2026-10-01',
    };
    await controller.create(CAREGIVER, dto);
    expect(service.create).toHaveBeenCalledWith(CAREGIVER, dto);

    await controller.findAll(FAMILY, { page: 1, size: 10 });
    expect(service.findAll).toHaveBeenCalledWith(FAMILY, { page: 1, size: 10 });

    await controller.findOne(FAMILY, 'm1');
    expect(service.findOne).toHaveBeenCalledWith(FAMILY, 'm1');

    await controller.update(CAREGIVER, 'm1', { dosis: '2' });
    expect(service.update).toHaveBeenCalledWith(CAREGIVER, 'm1', {
      dosis: '2',
    });

    await controller.toggle(CAREGIVER, 'm1');
    expect(service.toggle).toHaveBeenCalledWith(CAREGIVER, 'm1');

    await controller.remove(CAREGIVER, 'm1');
    expect(service.remove).toHaveBeenCalledWith(CAREGIVER, 'm1');
  });
});
