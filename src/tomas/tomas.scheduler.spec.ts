import { Logger } from '@nestjs/common';
import { createConfigMock } from '../common/testing/mocks';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { TomasScheduler } from './tomas.scheduler';
import { TomasService } from './tomas.service';

describe('TomasScheduler', () => {
  const tomas = {
    finalizarTratamientosVencidos: jest.fn(),
    generarTomasDelDia: jest.fn(),
    detectarOmisiones: jest.fn(),
    enviarResumenesDiarios: jest.fn(),
  };
  const notificaciones = { reintentarFallidas: jest.fn() };
  const build = (enabled: boolean) =>
    new TomasScheduler(
      tomas as unknown as TomasService,
      notificaciones as unknown as NotificacionesService,
      createConfigMock({ SCHEDULER_ENABLED: enabled }),
    );

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  beforeEach(() => jest.clearAllMocks());

  it('genera las tomas al iniciar y en el job diario', async () => {
    await build(true).onApplicationBootstrap();
    expect(tomas.finalizarTratamientosVencidos).toHaveBeenCalled();
    expect(tomas.generarTomasDelDia).toHaveBeenCalled();
  });

  it('detecta omisiones y reintenta notificaciones fallidas', async () => {
    await build(true).detectarOmisiones();
    expect(tomas.detectarOmisiones).toHaveBeenCalled();
    expect(notificaciones.reintentarFallidas).toHaveBeenCalled();
  });

  it('envía el resumen diario', async () => {
    await build(true).resumenDiario();
    expect(tomas.enviarResumenesDiarios).toHaveBeenCalled();
  });

  it('no ejecuta nada si el scheduler está deshabilitado', async () => {
    const scheduler = build(false);
    await scheduler.generarTomasDiarias();
    await scheduler.detectarOmisiones();
    await scheduler.resumenDiario();
    expect(tomas.generarTomasDelDia).not.toHaveBeenCalled();
    expect(tomas.detectarOmisiones).not.toHaveBeenCalled();
    expect(tomas.enviarResumenesDiarios).not.toHaveBeenCalled();
  });

  it('captura y registra los errores de un job', async () => {
    tomas.detectarOmisiones.mockRejectedValueOnce(new Error('db caída'));
    await expect(build(true).detectarOmisiones()).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'Job detectar-omisiones falló: db caída',
    );
  });
});
