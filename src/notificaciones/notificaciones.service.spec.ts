import {
  CAREGIVER,
  createConfigMock,
  createMockRepository,
  FAMILY,
  MockRepository,
} from '../common/testing/mocks';
import { ContactosService } from '../contactos/contactos.service';
import { PatientAccessService } from '../contactos/patient-access.service';
import {
  CanalNotificacion,
  EstadoNotificacion,
  TipoNotificacion,
} from './enums';
import { NotificacionesService } from './notificaciones.service';
import { TwilioService } from './twilio.service';

describe('NotificacionesService', () => {
  let repo: MockRepository;
  let contactos: { findNotificables: jest.Mock };
  let access: { resolvePatientId: jest.Mock };
  let twilio: { enviar: jest.Mock };
  let service: NotificacionesService;

  const envio = (estado: EstadoNotificacion) => ({
    estado,
    canal: CanalNotificacion.SMS,
    destino: '+573001234567',
    sid: estado === EstadoNotificacion.ENVIADA ? 'SM1' : null,
    estadoProveedor: null,
    error: estado === EstadoNotificacion.FALLIDA ? 'error' : null,
  });

  beforeEach(() => {
    repo = createMockRepository();
    contactos = { findNotificables: jest.fn().mockResolvedValue([]) };
    access = { resolvePatientId: jest.fn().mockResolvedValue(CAREGIVER.id) };
    twilio = {
      enviar: jest.fn().mockResolvedValue(envio(EstadoNotificacion.SIMULADA)),
    };
    service = new NotificacionesService(
      repo as never,
      contactos as unknown as ContactosService,
      access as unknown as PatientAccessService,
      twilio as unknown as TwilioService,
      createConfigMock({ NOTIFICACION_MAX_INTENTOS: 3 }),
    );
  });

  describe('notificarContactos', () => {
    it('envía a cada contacto notificable y registra los envíos', async () => {
      contactos.findNotificables.mockResolvedValue([
        { id: 'c1', telefono: '+573001234567' },
        { id: 'c2', telefono: '+573009876543' },
      ]);
      const result = await service.notificarContactos(
        CAREGIVER.id,
        'mensaje',
        TipoNotificacion.DOSIS_OMITIDA,
        't1',
      );
      expect(twilio.enviar).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        pacienteId: CAREGIVER.id,
        contactoId: 'c1',
        registroTomaId: 't1',
        tipo: TipoNotificacion.DOSIS_OMITIDA,
        estado: EstadoNotificacion.SIMULADA,
        intentos: 1,
      });
    });

    it('no guarda nada si no hay contactos notificables', async () => {
      await expect(
        service.notificarContactos('p', 'm', TipoNotificacion.RESUMEN_DIARIO),
      ).resolves.toEqual([]);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('reintentarFallidas', () => {
    it('reintenta los envíos fallidos e incrementa los intentos', async () => {
      const fallidas = [
        {
          intentos: 1,
          mensaje: 'm',
          destino: '+573001',
          contacto: { telefono: '+573001' },
          estado: EstadoNotificacion.FALLIDA,
        },
        {
          intentos: 2,
          mensaje: 'm',
          destino: 'whatsapp:+573002',
          contacto: null,
          estado: EstadoNotificacion.FALLIDA,
        },
      ];
      repo.find.mockResolvedValue(fallidas);
      twilio.enviar
        .mockResolvedValueOnce(envio(EstadoNotificacion.ENVIADA))
        .mockResolvedValueOnce(envio(EstadoNotificacion.FALLIDA));
      await expect(service.reintentarFallidas()).resolves.toEqual({
        reintentadas: 2,
        enviadas: 1,
      });
      expect(twilio.enviar).toHaveBeenNthCalledWith(2, '+573002', 'm');
      expect(fallidas[0]).toMatchObject({ intentos: 2, estado: 'ENVIADA' });
      expect(fallidas[1]).toMatchObject({ intentos: 3, estado: 'FALLIDA' });
      expect(repo.save).toHaveBeenCalledTimes(2);
    });

    it('no guarda si no hay fallidas', async () => {
      await expect(service.reintentarFallidas()).resolves.toEqual({
        reintentadas: 0,
        enviadas: 0,
      });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('usa 3 intentos como máximo por defecto', async () => {
      const svc = new NotificacionesService(
        repo as never,
        contactos as unknown as ContactosService,
        access as unknown as PatientAccessService,
        twilio as unknown as TwilioService,
        createConfigMock(),
      );
      await svc.reintentarFallidas();
      expect(repo.find).toHaveBeenCalled();
    });
  });

  it('findAll pagina y filtra el historial del paciente', async () => {
    repo.findAndCount.mockResolvedValue([[{ id: 'n1' }], 1]);
    const result = await service.findAll(FAMILY, {
      page: 1,
      size: 10,
      tipo: TipoNotificacion.DOSIS_OMITIDA,
      estado: EstadoNotificacion.SIMULADA,
    });
    expect(result.meta.totalItems).toBe(1);
    expect(repo.findAndCount.mock.calls[0][0].where).toEqual({
      pacienteId: CAREGIVER.id,
      tipo: TipoNotificacion.DOSIS_OMITIDA,
      estado: EstadoNotificacion.SIMULADA,
    });

    await service.findAll(FAMILY, { page: 1, size: 10 });
    expect(repo.findAndCount.mock.calls[1][0].where).toEqual({
      pacienteId: CAREGIVER.id,
    });
  });
});
