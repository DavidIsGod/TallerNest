import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CAREGIVER,
  createMockRepository,
  FAMILY,
  MockRepository,
} from '../common/testing/mocks';
import { PatientAccessService } from '../contactos/patient-access.service';
import { InfoOpenFda } from '../openfda/interfaces/info-openfda.interface';
import { OpenFdaService } from '../openfda/openfda.service';
import { TomasService } from '../tomas/tomas.service';
import { CreateMedicamentoDto } from './dto/create-medicamento.dto';
import { Medicamento } from './entities/medicamento.entity';
import { MedicamentosService } from './medicamentos.service';

describe('MedicamentosService', () => {
  let repo: MockRepository;
  let openFda: { consultar: jest.Mock; detectarInteracciones: jest.Mock };
  let access: {
    resolvePatientId: jest.Mock;
    assertCanRead: jest.Mock;
    assertOwner: jest.Mock;
  };
  let tomas: { generarTomasRestantesDeHoy: jest.Mock };
  let service: MedicamentosService;

  const info = (overrides: Partial<InfoOpenFda> = {}): InfoOpenFda => ({
    encontrado: true,
    advertencias: ['a1', 'a2', 'a3', 'a4'],
    interacciones: ['warfarin'],
    reaccionesAdversas: [],
    indicaciones: [],
    dosificacion: [],
    fuente: 'openFDA',
    consultadoEn: '',
    ...overrides,
  });

  const dto: CreateMedicamentoDto = {
    nombre: 'Glucophage',
    principioActivo: 'metformina',
    dosis: '850 mg',
    frecuencia: 'Cada 12 horas',
    horarios: ['20:00', '08:00'],
    fechaInicio: '2026-10-01',
  };

  const medicamento = (overrides: Partial<Medicamento> = {}): Medicamento =>
    ({
      id: 'm1',
      pacienteId: CAREGIVER.id,
      ...dto,
      horarios: ['08:00', '20:00'],
      fechaFin: null,
      instrucciones: null,
      activo: true,
      infoOpenfda: info(),
      ...overrides,
    }) as Medicamento;

  beforeEach(() => {
    repo = createMockRepository();
    repo.save.mockImplementation((m: Medicamento) =>
      Promise.resolve({ ...m, id: m.id ?? 'm1' }),
    );
    openFda = {
      consultar: jest.fn().mockResolvedValue(info()),
      detectarInteracciones: jest.fn().mockReturnValue([]),
    };
    access = {
      resolvePatientId: jest.fn().mockResolvedValue(CAREGIVER.id),
      assertCanRead: jest.fn(),
      assertOwner: jest.fn(),
    };
    tomas = { generarTomasRestantesDeHoy: jest.fn().mockResolvedValue(1) };
    service = new MedicamentosService(
      repo as never,
      openFda as unknown as OpenFdaService,
      access as unknown as PatientAccessService,
      tomas as unknown as TomasService,
    );
  });

  describe('create', () => {
    it('consulta openFDA, ordena horarios, genera tomas y alerta interacciones', async () => {
      const otros = [
        { id: 'm9', nombre: 'Coumadin', principioActivo: 'warfarina' },
      ];
      repo.find.mockResolvedValue(otros);
      openFda.detectarInteracciones.mockReturnValue([{ medicamentoId: 'm9' }]);

      const result = await service.create(CAREGIVER, dto);

      expect(openFda.consultar).toHaveBeenCalledWith('metformina');
      expect(result.medicamento).toMatchObject({
        pacienteId: CAREGIVER.id,
        horarios: ['08:00', '20:00'],
        fechaFin: null,
        instrucciones: null,
        activo: true,
      });
      expect(result.alertas.advertencias).toEqual(['a1', 'a2', 'a3']);
      expect(result.alertas.interacciones).toEqual([{ medicamentoId: 'm9' }]);
      expect(result.tomasGeneradasHoy).toBe(1);
      expect(openFda.detectarInteracciones).toHaveBeenCalledWith(
        expect.objectContaining({ encontrado: true }),
        otros,
      );
    });

    it('informa cuando openFDA no tiene información', async () => {
      openFda.consultar.mockResolvedValue(
        info({
          encontrado: false,
          advertencias: [],
          mensaje: 'No se encontró',
        }),
      );
      const result = await service.create(CAREGIVER, {
        ...dto,
        fechaFin: '2026-12-31',
        instrucciones: 'Con alimentos',
      });
      expect(result.alertas.mensaje).toBe('No se encontró');
    });

    it('rechaza fecha de fin anterior a la de inicio', async () => {
      await expect(
        service.create(CAREGIVER, { ...dto, fechaFin: '2026-09-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('findAll filtra por activo y nombre/principio activo', async () => {
    repo.findAndCount.mockResolvedValue([[medicamento()], 1]);
    await service.findAll(FAMILY, {
      page: 1,
      size: 10,
      activo: true,
      nombre: 'gluco',
    });
    const where = repo.findAndCount.mock.calls[0][0].where as unknown[];
    expect(where).toHaveLength(2);
    expect(where[0]).toMatchObject({ pacienteId: CAREGIVER.id, activo: true });

    await service.findAll(FAMILY, { page: 1, size: 10 });
    expect(repo.findAndCount.mock.calls[1][0].where).toEqual({
      pacienteId: CAREGIVER.id,
    });
  });

  it('findOne valida acceso y 404', async () => {
    repo.findOne.mockResolvedValueOnce(medicamento({ infoOpenfda: null }));
    const result = await service.findOne(FAMILY, 'm1');
    expect(access.assertCanRead).toHaveBeenCalledWith(FAMILY, CAREGIVER.id);
    expect(result.alertas.advertencias).toEqual([]);
    await expect(service.findOne(FAMILY, 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('update', () => {
    it('actualiza campos, ordena horarios y genera tomas nuevas', async () => {
      repo.findOne.mockResolvedValue(medicamento());
      const result = await service.update(CAREGIVER, 'm1', {
        dosis: '1000 mg',
        horarios: ['22:00', '09:00'],
      });
      expect(result.medicamento).toMatchObject({
        dosis: '1000 mg',
        horarios: ['09:00', '22:00'],
        nombre: 'Glucophage',
      });
      expect(openFda.consultar).not.toHaveBeenCalled();
      expect(access.assertOwner).toHaveBeenCalledWith(CAREGIVER, CAREGIVER.id);
    });

    it('vuelve a consultar openFDA si cambia el principio activo', async () => {
      repo.findOne.mockResolvedValue(medicamento());
      await service.update(CAREGIVER, 'm1', {
        principioActivo: 'losartan',
        fechaFin: null,
      });
      expect(openFda.consultar).toHaveBeenCalledWith('losartan');
    });

    it('valida las fechas combinadas con las existentes', async () => {
      repo.findOne.mockResolvedValue(medicamento({ fechaFin: '2026-10-10' }));
      await expect(
        service.update(CAREGIVER, 'm1', { fechaInicio: '2026-11-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('toggle alterna el estado y genera tomas al reactivar', async () => {
    repo.findOne.mockResolvedValueOnce(medicamento({ activo: true }));
    await expect(service.toggle(CAREGIVER, 'm1')).resolves.toMatchObject({
      activo: false,
    });
    expect(tomas.generarTomasRestantesDeHoy).not.toHaveBeenCalled();

    repo.findOne.mockResolvedValueOnce(medicamento({ activo: false }));
    await expect(service.toggle(CAREGIVER, 'm1')).resolves.toMatchObject({
      activo: true,
    });
    expect(tomas.generarTomasRestantesDeHoy).toHaveBeenCalled();
  });

  it('remove hace soft delete (activo = false)', async () => {
    const m = medicamento();
    repo.findOne.mockResolvedValue(m);
    await service.remove(CAREGIVER, 'm1');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ activo: false }),
    );
  });
});
