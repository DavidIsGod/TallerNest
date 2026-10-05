import { FAMILY } from '../common/testing/mocks';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';

describe('NotificacionesController', () => {
  it('delega listado y reintentos en el servicio', async () => {
    const service = {
      findAll: jest.fn().mockResolvedValue({ items: [] }),
      reintentarFallidas: jest.fn().mockResolvedValue({ reintentadas: 0 }),
    };
    const controller = new NotificacionesController(
      service as unknown as NotificacionesService,
    );
    await controller.findAll(FAMILY, { page: 1, size: 10 });
    expect(service.findAll).toHaveBeenCalledWith(FAMILY, { page: 1, size: 10 });
    await controller.reintentar();
    expect(service.reintentarFallidas).toHaveBeenCalled();
  });
});
