import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import {
  CAREGIVER,
  createMockRepository,
  FAMILY,
  MockRepository,
} from '../common/testing/mocks';
import { ContactosService, MAX_CONTACTOS } from './contactos.service';
import { ContactoFamiliar } from './entities/contacto-familiar.entity';
import { PatientAccessService } from './patient-access.service';

describe('ContactosService', () => {
  let contactos: MockRepository;
  let usuarios: MockRepository;
  let access: jest.Mocked<
    Pick<
      PatientAccessService,
      'resolvePatientId' | 'assertCanRead' | 'assertOwner'
    >
  >;
  let service: ContactosService;

  const contacto = (overrides: Partial<ContactoFamiliar> = {}) =>
    ({
      id: 'c1',
      pacienteId: CAREGIVER.id,
      usuarioId: null,
      nombre: 'Andrés',
      relacion: 'Hijo',
      telefono: '+573001112233',
      esEmergencia: true,
      recibeNotificaciones: true,
      ...overrides,
    }) as ContactoFamiliar;

  const dto = {
    nombre: 'Carmen',
    relacion: 'Hermana',
    telefono: '+573009998877',
  };

  beforeEach(() => {
    contactos = createMockRepository();
    usuarios = createMockRepository();
    access = {
      resolvePatientId: jest.fn().mockResolvedValue(CAREGIVER.id),
      assertCanRead: jest.fn(),
      assertOwner: jest.fn(),
    };
    service = new ContactosService(
      contactos as never,
      usuarios as never,
      access as unknown as PatientAccessService,
    );
  });

  describe('create', () => {
    it('marca el primer contacto como emergencia automáticamente', async () => {
      const result = await service.create(CAREGIVER, dto);
      expect(result).toMatchObject({
        pacienteId: CAREGIVER.id,
        esEmergencia: true,
        recibeNotificaciones: true,
        email: null,
        usuarioId: null,
      });
    });

    it('respeta esEmergencia=false si ya existe un contacto de emergencia', async () => {
      contactos.find.mockResolvedValue([contacto()]);
      const result = await service.create(CAREGIVER, {
        ...dto,
        esEmergencia: false,
        recibeNotificaciones: false,
        email: 'c@c.com',
      });
      expect(result).toMatchObject({
        esEmergencia: false,
        recibeNotificaciones: false,
        email: 'c@c.com',
      });
    });

    it(`rechaza más de ${MAX_CONTACTOS} contactos`, async () => {
      contactos.find.mockResolvedValue(
        Array.from({ length: MAX_CONTACTOS }, () => contacto()),
      );
      await expect(service.create(CAREGIVER, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('vincula un usuario ROLE_FAMILY por email', async () => {
      usuarios.findOne.mockResolvedValue({ id: FAMILY.id, rol: Role.FAMILY });
      const result = await service.create(CAREGIVER, {
        ...dto,
        usuarioEmail: FAMILY.email,
      });
      expect(result.usuarioId).toBe(FAMILY.id);
    });

    it('valida el usuario a vincular', async () => {
      usuarios.findOne.mockResolvedValueOnce(null);
      await expect(
        service.create(CAREGIVER, { ...dto, usuarioEmail: 'no@existe.com' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      usuarios.findOne.mockResolvedValueOnce({ id: 'x', rol: Role.CAREGIVER });
      await expect(
        service.create(CAREGIVER, { ...dto, usuarioEmail: 'c@c.com' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      usuarios.findOne.mockResolvedValueOnce({
        id: FAMILY.id,
        rol: Role.FAMILY,
      });
      contactos.exists.mockResolvedValueOnce(true);
      await expect(
        service.create(CAREGIVER, { ...dto, usuarioEmail: FAMILY.email }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('findAll resuelve el paciente y ordena por emergencia', async () => {
    await service.findAll(FAMILY, CAREGIVER.id);
    expect(access.resolvePatientId).toHaveBeenCalledWith(FAMILY, CAREGIVER.id);
    expect(contactos.find).toHaveBeenCalledWith({
      where: { pacienteId: CAREGIVER.id },
      order: { esEmergencia: 'DESC', nombre: 'ASC' },
    });
  });

  it('findOne valida acceso de lectura y 404', async () => {
    contactos.findOne.mockResolvedValueOnce(contacto());
    await service.findOne(FAMILY, 'c1');
    expect(access.assertCanRead).toHaveBeenCalledWith(FAMILY, CAREGIVER.id);
    await expect(service.findOne(FAMILY, 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('update', () => {
    it('actualiza los datos y vincula un usuario', async () => {
      contactos.findOne.mockResolvedValue(contacto({ esEmergencia: false }));
      usuarios.findOne.mockResolvedValue({ id: FAMILY.id, rol: Role.FAMILY });
      const result = await service.update(CAREGIVER, 'c1', {
        nombre: 'Nuevo',
        usuarioEmail: FAMILY.email,
      });
      expect(result).toMatchObject({ nombre: 'Nuevo', usuarioId: FAMILY.id });
      expect(access.assertOwner).toHaveBeenCalledWith(CAREGIVER, CAREGIVER.id);
    });

    it('impide quitar el único contacto de emergencia', async () => {
      contactos.findOne.mockResolvedValue(contacto());
      contactos.exists.mockResolvedValue(false);
      await expect(
        service.update(CAREGIVER, 'c1', { esEmergencia: false }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('permite quitarlo si existe otro contacto de emergencia', async () => {
      contactos.findOne.mockResolvedValue(contacto());
      contactos.exists.mockResolvedValue(true);
      const result = await service.update(CAREGIVER, 'c1', {
        esEmergencia: false,
      });
      expect(result.esEmergencia).toBe(false);
    });
  });

  describe('remove', () => {
    it('elimina un contacto que no es de emergencia', async () => {
      const c = contacto({ esEmergencia: false });
      contactos.findOne.mockResolvedValue(c);
      await service.remove(CAREGIVER, 'c1');
      expect(contactos.remove).toHaveBeenCalledWith(c);
    });

    it('elimina el contacto de emergencia si es el único contacto', async () => {
      contactos.findOne.mockResolvedValue(contacto());
      contactos.count.mockResolvedValue(0);
      await service.remove(CAREGIVER, 'c1');
      expect(contactos.remove).toHaveBeenCalled();
    });

    it('impide eliminar la única emergencia si quedan otros contactos', async () => {
      contactos.findOne.mockResolvedValue(contacto());
      contactos.count.mockResolvedValue(2);
      contactos.exists.mockResolvedValue(false);
      await expect(service.remove(CAREGIVER, 'c1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  it('setNotificaciones cambia la preferencia', async () => {
    contactos.findOne.mockResolvedValue(contacto());
    const result = await service.setNotificaciones(CAREGIVER, 'c1', false);
    expect(result.recibeNotificaciones).toBe(false);
  });

  it('misPacientes lista los pacientes vinculados al familiar', async () => {
    contactos.find.mockResolvedValue([
      {
        ...contacto({ usuarioId: FAMILY.id }),
        paciente: { nombre: 'María', email: 'm@m.com' },
      },
    ]);
    await expect(service.misPacientes(FAMILY)).resolves.toEqual([
      {
        pacienteId: CAREGIVER.id,
        nombre: 'María',
        email: 'm@m.com',
        relacion: 'Hijo',
        esEmergencia: true,
      },
    ]);
  });

  it('findNotificables filtra por recibeNotificaciones', async () => {
    await service.findNotificables('p1');
    expect(contactos.find).toHaveBeenCalledWith({
      where: { pacienteId: 'p1', recibeNotificaciones: true },
    });
  });
});
