import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Between, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import {
  CAREGIVER,
  createClockMock,
  createConfigMock,
  createInsertQueryBuilder,
  createMockRepository,
  FAMILY,
  MockRepository,
} from '../common/testing/mocks';
import { PatientAccessService } from '../contactos/patient-access.service';
import { Medicamento } from '../medicamentos/entities/medicamento.entity';
import { TipoNotificacion } from '../notificaciones/enums';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { RegistroToma } from './entities/registro-toma.entity';
import { EstadoToma } from './enums/estado-toma.enum';
import { TomasService } from './tomas.service';

describe('TomasService', () => {
  let tomas: MockRepository;
  let medicamentos: MockRepository;
  let access: {
    resolvePatientId: jest.Mock;
    assertCanRead: jest.Mock;
    assertOwner: jest.Mock;
  };
  let notificaciones: { notificarContactos: jest.Mock };
  let clock: ReturnType<typeof createClockMock>;
  let service: TomasService;

  const HOY = '2026-10-05';

  const toma = (overrides: Partial<RegistroToma> = {}): RegistroToma =>
    ({
      id: 't1',
      pacienteId: CAREGIVER.id,
      medicamentoId: 'm1',
      fecha: HOY,
      horaProgramada: '08:00:00',
      estado: EstadoToma.PENDIENTE,
      horaReal: null,
      notas: null,
      notificacionEnviada: false,
      omisionAutomatica: false,
      medicamento: { id: 'm1', nombre: 'Glucophage', dosis: '850 mg' },
      paciente: { id: CAREGIVER.id, nombre: 'María Gómez' },
      ...overrides,
    }) as RegistroToma;

  const medicamento = (overrides: Partial<Medicamento> = {}): Medicamento =>
    ({
      id: 'm1',
      pacienteId: CAREGIVER.id,
      horarios: ['08:00', '14:00', '20:00'],
      fechaInicio: '2026-10-01',
      fechaFin: null,
      activo: true,
      ...overrides,
    }) as Medicamento;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    tomas = createMockRepository();
    medicamentos = createMockRepository();
    access = {
      resolvePatientId: jest.fn().mockResolvedValue(CAREGIVER.id),
      assertCanRead: jest.fn(),
      assertOwner: jest.fn(),
    };
    notificaciones = { notificarContactos: jest.fn().mockResolvedValue([]) };
    clock = createClockMock(HOY, '12:00:00');
    service = new TomasService(
      tomas as never,
      medicamentos as never,
      access as unknown as PatientAccessService,
      notificaciones as unknown as NotificacionesService,
      clock,
      createConfigMock({ OMISION_HORAS: 2 }),
    );
  });

  describe('findAll', () => {
    const base = { page: 1, size: 10 };
    const whereDe = (i: number) =>
      tomas.findAndCount.mock.calls[i][0].where as Record<string, unknown>;

    it('aplica filtros de fecha exacta, estado y medicamento', async () => {
      await service.findAll(CAREGIVER, {
        ...base,
        fecha: HOY,
        estado: EstadoToma.TOMADO,
        medicamentoId: 'm1',
      });
      expect(whereDe(0)).toEqual({
        pacienteId: CAREGIVER.id,
        fecha: HOY,
        estado: EstadoToma.TOMADO,
        medicamentoId: 'm1',
      });
    });

    it('aplica rangos de fechas', async () => {
      await service.findAll(CAREGIVER, {
        ...base,
        desde: '2026-10-01',
        hasta: HOY,
      });
      await service.findAll(CAREGIVER, { ...base, desde: '2026-10-01' });
      await service.findAll(CAREGIVER, { ...base, hasta: HOY });
      expect(whereDe(0).fecha).toEqual(Between('2026-10-01', HOY));
      expect(whereDe(1).fecha).toEqual(MoreThanOrEqual('2026-10-01'));
      expect(whereDe(2).fecha).toEqual(LessThanOrEqual(HOY));
    });

    it('rechaza rangos invertidos', async () => {
      await expect(
        service.findAll(CAREGIVER, {
          ...base,
          desde: HOY,
          hasta: '2026-10-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('findHoy consulta las tomas del día con filtro opcional de estado', async () => {
    await service.findHoy(FAMILY, { estado: EstadoToma.PENDIENTE });
    await service.findHoy(FAMILY, {});
    expect(tomas.find.mock.calls[0][0].where).toEqual({
      pacienteId: CAREGIVER.id,
      fecha: HOY,
      estado: EstadoToma.PENDIENTE,
    });
    expect(tomas.find.mock.calls[1][0].where).toEqual({
      pacienteId: CAREGIVER.id,
      fecha: HOY,
    });
  });

  it('resumen cuenta tomas por estado y calcula la adherencia', async () => {
    tomas.find.mockResolvedValue([
      { estado: EstadoToma.TOMADO },
      { estado: EstadoToma.TOMADO },
      { estado: EstadoToma.OMITIDO },
      { estado: EstadoToma.PENDIENTE },
    ]);
    await expect(service.resumen(CAREGIVER, {})).resolves.toEqual({
      fecha: HOY,
      total: 4,
      tomadas: 2,
      omitidas: 1,
      pendientes: 1,
      adherencia: 50,
    });
    tomas.find.mockResolvedValue([]);
    await expect(
      service.resumen(CAREGIVER, { fecha: '2026-10-01' }),
    ).resolves.toMatchObject({
      fecha: '2026-10-01',
      total: 0,
      adherencia: null,
    });
  });

  it('findOne valida acceso y devuelve 404 si no existe', async () => {
    tomas.findOne.mockResolvedValueOnce(toma());
    await expect(service.findOne(FAMILY, 't1')).resolves.toMatchObject({
      id: 't1',
    });
    expect(access.assertCanRead).toHaveBeenCalledWith(FAMILY, CAREGIVER.id);
    await expect(service.findOne(FAMILY, 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('actualizarEstado', () => {
    it('marca TOMADO registrando la hora real del servidor', async () => {
      const t = toma();
      tomas.findOne.mockResolvedValueOnce(t).mockResolvedValueOnce(t);
      await service.actualizarEstado(CAREGIVER, 't1', {
        estado: EstadoToma.TOMADO,
        notas: 'Con el desayuno',
      });
      expect(t).toMatchObject({
        estado: EstadoToma.TOMADO,
        horaReal: clock.now(),
        notas: 'Con el desayuno',
      });
      expect(access.assertOwner).toHaveBeenCalledWith(CAREGIVER, CAREGIVER.id);
      expect(notificaciones.notificarContactos).not.toHaveBeenCalled();
    });

    it('permite registrar tarde una toma OMITIDA', async () => {
      const t = toma({ estado: EstadoToma.OMITIDO, omisionAutomatica: true });
      tomas.findOne.mockResolvedValue(t);
      await service.actualizarEstado(CAREGIVER, 't1', {
        estado: EstadoToma.TOMADO,
      });
      expect(t.estado).toBe(EstadoToma.TOMADO);
    });

    it('marca OMITIDO y notifica a los familiares', async () => {
      const t = toma({ horaReal: new Date() });
      tomas.findOne.mockResolvedValue(t);
      notificaciones.notificarContactos.mockResolvedValue([{ id: 'n1' }]);
      await service.actualizarEstado(CAREGIVER, 't1', {
        estado: EstadoToma.OMITIDO,
      });
      expect(t).toMatchObject({ estado: EstadoToma.OMITIDO, horaReal: null });
      expect(notificaciones.notificarContactos).toHaveBeenCalledWith(
        CAREGIVER.id,
        expect.stringContaining(
          'María Gómez no ha tomado su dosis de Glucophage',
        ),
        TipoNotificacion.DOSIS_OMITIDA,
        't1',
      );
      expect(tomas.update).toHaveBeenCalledWith('t1', {
        notificacionEnviada: true,
      });
    });

    it('no reenvía la alerta si ya fue notificada', async () => {
      tomas.findOne.mockResolvedValue(toma({ notificacionEnviada: true }));
      await service.actualizarEstado(CAREGIVER, 't1', {
        estado: EstadoToma.OMITIDO,
      });
      expect(notificaciones.notificarContactos).not.toHaveBeenCalled();
    });

    it('valida existencia, fecha futura y transiciones', async () => {
      await expect(
        service.actualizarEstado(CAREGIVER, 'x', { estado: EstadoToma.TOMADO }),
      ).rejects.toBeInstanceOf(NotFoundException);

      tomas.findOne.mockResolvedValueOnce(toma({ fecha: '2026-10-06' }));
      await expect(
        service.actualizarEstado(CAREGIVER, 't1', {
          estado: EstadoToma.TOMADO,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      tomas.findOne.mockResolvedValueOnce(toma({ estado: EstadoToma.TOMADO }));
      await expect(
        service.actualizarEstado(CAREGIVER, 't1', {
          estado: EstadoToma.OMITIDO,
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      tomas.findOne.mockResolvedValueOnce(toma({ estado: EstadoToma.OMITIDO }));
      await expect(
        service.actualizarEstado(CAREGIVER, 't1', {
          estado: EstadoToma.OMITIDO,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('generación de tomas', () => {
    it('genera una toma PENDIENTE por horario de cada medicamento activo', async () => {
      medicamentos.find.mockResolvedValue([
        medicamento(),
        medicamento({ id: 'm2', horarios: ['21:00'] }),
      ]);
      const qb = createInsertQueryBuilder([
        { id: 1 },
        { id: 2 },
        { id: 3 },
        { id: 4 },
      ]);
      tomas.createQueryBuilder.mockReturnValue(qb);
      await expect(service.generarTomasDelDia()).resolves.toBe(4);
      const filas = qb.values.mock.calls[0][0] as RegistroToma[];
      expect(filas).toHaveLength(4);
      expect(filas[0]).toEqual({
        medicamentoId: 'm1',
        pacienteId: CAREGIVER.id,
        fecha: HOY,
        horaProgramada: '08:00:00',
        estado: EstadoToma.PENDIENTE,
      });
      expect(qb.orIgnore).toHaveBeenCalled();
    });

    it('no ejecuta inserts si no hay medicamentos y tolera raw no array', async () => {
      await expect(service.generarTomasDelDia('2026-10-07')).resolves.toBe(0);
      expect(tomas.createQueryBuilder).not.toHaveBeenCalled();

      medicamentos.find.mockResolvedValue([medicamento()]);
      const qb = createInsertQueryBuilder();
      qb.execute.mockResolvedValue({ raw: undefined });
      tomas.createQueryBuilder.mockReturnValue(qb);
      await expect(service.generarTomasDelDia()).resolves.toBe(0);
    });

    it('generarTomasRestantesDeHoy solo crea los horarios que faltan', async () => {
      const qb = createInsertQueryBuilder([{ id: 1 }, { id: 2 }]);
      tomas.createQueryBuilder.mockReturnValue(qb);
      await expect(
        service.generarTomasRestantesDeHoy(medicamento()),
      ).resolves.toBe(2);
      const horas = (qb.values.mock.calls[0][0] as RegistroToma[]).map(
        (f) => f.horaProgramada,
      );
      expect(horas).toEqual(['14:00:00', '20:00:00']);
    });

    it.each([
      ['inactivo', { activo: false }],
      ['que inicia en el futuro', { fechaInicio: '2026-10-10' }],
      ['ya finalizado', { fechaFin: '2026-10-01' }],
    ])('no genera tomas para un medicamento %s', async (_caso, overrides) => {
      await expect(
        service.generarTomasRestantesDeHoy(medicamento(overrides)),
      ).resolves.toBe(0);
    });

    it('finaliza los tratamientos vencidos', async () => {
      medicamentos.update.mockResolvedValueOnce({ affected: 2 });
      await expect(service.finalizarTratamientosVencidos()).resolves.toBe(2);
      medicamentos.update.mockResolvedValueOnce({});
      await expect(service.finalizarTratamientosVencidos()).resolves.toBe(0);
    });
  });

  describe('detectarOmisiones', () => {
    it('marca como OMITIDO las tomas vencidas y notifica', async () => {
      const vencidas = [toma(), toma({ id: 't2', notificacionEnviada: true })];
      tomas.find.mockResolvedValue(vencidas);
      notificaciones.notificarContactos.mockResolvedValue([
        { id: 'n1' },
        { id: 'n2' },
      ]);
      await expect(service.detectarOmisiones()).resolves.toEqual({
        omitidas: 2,
        notificaciones: 2,
      });
      expect(vencidas.every((t) => t.estado === EstadoToma.OMITIDO)).toBe(true);
      expect(tomas.update).toHaveBeenCalledWith(
        { id: In(['t1', 't2']) },
        { estado: EstadoToma.OMITIDO, omisionAutomatica: true },
      );
      expect(vencidas[0].omisionAutomatica).toBe(true);
      expect(clock.local).toHaveBeenCalledWith(
        new Date(clock.now().getTime() - 2 * 3_600_000),
      );
    });

    it('no hace nada si no hay tomas vencidas', async () => {
      await expect(service.detectarOmisiones()).resolves.toEqual({
        omitidas: 0,
        notificaciones: 0,
      });
      expect(tomas.update).not.toHaveBeenCalled();
    });

    it('usa 2 horas por defecto', async () => {
      const svc = new TomasService(
        tomas as never,
        medicamentos as never,
        access as unknown as PatientAccessService,
        notificaciones as unknown as NotificacionesService,
        clock,
        createConfigMock(),
      );
      await svc.detectarOmisiones();
      expect(tomas.find).toHaveBeenCalled();
    });
  });

  it('enviarResumenesDiarios envía un resumen por paciente', async () => {
    tomas.find.mockResolvedValue([
      toma({ estado: EstadoToma.TOMADO }),
      toma({ estado: EstadoToma.OMITIDO }),
      toma({
        pacienteId: 'p2',
        estado: EstadoToma.TOMADO,
        paciente: { nombre: 'Jorge' } as never,
      }),
    ]);
    notificaciones.notificarContactos.mockResolvedValue([{ id: 'n' }]);
    await expect(service.enviarResumenesDiarios()).resolves.toEqual({
      pacientes: 2,
      notificaciones: 2,
    });
    expect(notificaciones.notificarContactos).toHaveBeenCalledWith(
      CAREGIVER.id,
      'Resumen MediPlan: María Gómez tomó 1 de 2 dosis programadas hoy (50% adherencia).',
      TipoNotificacion.RESUMEN_DIARIO,
    );
  });

  it('contar maneja listas vacías', () => {
    expect(TomasService.contar(HOY, [])).toMatchObject({
      total: 0,
      adherencia: null,
    });
  });
});
