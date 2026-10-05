import { CAREGIVER, FAMILY } from '../common/testing/mocks';
import { EstadoToma } from './enums/estado-toma.enum';
import { TomasController } from './tomas.controller';
import { TomasService } from './tomas.service';

describe('TomasController', () => {
  const service = {
    findAll: jest.fn(),
    findHoy: jest.fn(),
    resumen: jest.fn(),
    findOne: jest.fn(),
    actualizarEstado: jest.fn(),
    generarTomasDelDia: jest.fn().mockResolvedValue(3),
    detectarOmisiones: jest.fn(),
    enviarResumenesDiarios: jest.fn(),
  };
  const controller = new TomasController(service as unknown as TomasService);

  it('delega cada endpoint en TomasService', async () => {
    await controller.findAll(FAMILY, { page: 1, size: 10 });
    expect(service.findAll).toHaveBeenCalledWith(FAMILY, { page: 1, size: 10 });

    await controller.findHoy(FAMILY, {});
    expect(service.findHoy).toHaveBeenCalledWith(FAMILY, {});

    await controller.resumen(FAMILY, { fecha: '2026-10-05' });
    expect(service.resumen).toHaveBeenCalledWith(FAMILY, {
      fecha: '2026-10-05',
    });

    await controller.findOne(FAMILY, 't1');
    expect(service.findOne).toHaveBeenCalledWith(FAMILY, 't1');

    const dto = { estado: EstadoToma.TOMADO as const };
    await controller.actualizarEstado(CAREGIVER, 't1', dto);
    expect(service.actualizarEstado).toHaveBeenCalledWith(CAREGIVER, 't1', dto);

    await expect(controller.generar({ fecha: '2026-10-05' })).resolves.toEqual({
      creadas: 3,
    });
    await controller.detectarOmisiones();
    expect(service.detectarOmisiones).toHaveBeenCalled();
    await controller.resumenDiario({});
    expect(service.enviarResumenesDiarios).toHaveBeenCalledWith(undefined);
  });
});
