import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import {
  ADMIN,
  CAREGIVER,
  createMockRepository,
  FAMILY,
  MockRepository,
} from '../common/testing/mocks';
import { PatientAccessService } from './patient-access.service';

describe('PatientAccessService', () => {
  let contactos: MockRepository;
  let usuarios: MockRepository;
  let service: PatientAccessService;
  const PACIENTE = CAREGIVER.id;

  beforeEach(() => {
    contactos = createMockRepository();
    usuarios = createMockRepository();
    service = new PatientAccessService(contactos as never, usuarios as never);
  });

  describe('resolvePatientId', () => {
    it('el cuidador siempre opera sobre sí mismo', async () => {
      await expect(service.resolvePatientId(CAREGIVER)).resolves.toBe(PACIENTE);
      await expect(service.resolvePatientId(CAREGIVER, PACIENTE)).resolves.toBe(
        PACIENTE,
      );
    });

    it('el cuidador no puede consultar otro paciente', async () => {
      await expect(
        service.resolvePatientId(CAREGIVER, 'otro'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('el familiar vinculado a un solo paciente lo obtiene por defecto', async () => {
      contactos.find.mockResolvedValue([{ pacienteId: PACIENTE }]);
      await expect(service.resolvePatientId(FAMILY)).resolves.toBe(PACIENTE);
    });

    it('el familiar sin vínculos recibe 403 y con varios debe indicar pacienteId', async () => {
      contactos.find.mockResolvedValueOnce([]);
      await expect(service.resolvePatientId(FAMILY)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      contactos.find.mockResolvedValueOnce([
        { pacienteId: 'p1' },
        { pacienteId: 'p2' },
      ]);
      await expect(service.resolvePatientId(FAMILY)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('el familiar con pacienteId explícito debe estar vinculado', async () => {
      contactos.exists.mockResolvedValueOnce(true);
      await expect(service.resolvePatientId(FAMILY, PACIENTE)).resolves.toBe(
        PACIENTE,
      );
      contactos.exists.mockResolvedValueOnce(false);
      await expect(
        service.resolvePatientId(FAMILY, PACIENTE),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('el admin debe indicar un paciente existente', async () => {
      await expect(service.resolvePatientId(ADMIN)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      usuarios.exists.mockResolvedValueOnce(false);
      await expect(
        service.resolvePatientId(ADMIN, PACIENTE),
      ).rejects.toBeInstanceOf(NotFoundException);
      usuarios.exists.mockResolvedValueOnce(true);
      await expect(service.resolvePatientId(ADMIN, PACIENTE)).resolves.toBe(
        PACIENTE,
      );
    });

    it('rechaza roles desconocidos', async () => {
      await expect(
        service.resolvePatientId({ ...CAREGIVER, rol: 'X' as Role }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assertCanRead', () => {
    it('permite al admin y al propio paciente', async () => {
      await expect(
        service.assertCanRead(ADMIN, PACIENTE),
      ).resolves.toBeUndefined();
      await expect(
        service.assertCanRead(CAREGIVER, PACIENTE),
      ).resolves.toBeUndefined();
    });

    it('permite al familiar vinculado y rechaza al resto', async () => {
      contactos.exists.mockResolvedValueOnce(true);
      await expect(
        service.assertCanRead(FAMILY, PACIENTE),
      ).resolves.toBeUndefined();
      contactos.exists.mockResolvedValueOnce(false);
      await expect(
        service.assertCanRead(FAMILY, PACIENTE),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.assertCanRead(CAREGIVER, 'otro'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('assertOwner solo permite al cuidador dueño', () => {
    expect(() => service.assertOwner(CAREGIVER, PACIENTE)).not.toThrow();
    expect(() => service.assertOwner(CAREGIVER, 'otro')).toThrow(
      ForbiddenException,
    );
    expect(() => service.assertOwner(FAMILY, FAMILY.id)).toThrow(
      ForbiddenException,
    );
  });
});
