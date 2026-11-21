import { CAREGIVER, FAMILY } from '../../common/testing/mocks';
import { Medicamento } from '../entities/medicamento.entity';
import { MedicamentosService } from '../medicamentos.service';
import { MedicamentoInput } from './medicamento.inputs';
import { MedicamentosResolver } from './medicamentos.resolver';

describe('MedicamentosResolver', () => {
  const medicamento = {
    id: 'm1',
    nombre: 'Glucophage',
    infoOpenfda: { advertencias: ['a1', 'a2'] },
  } as unknown as Medicamento;
  const conAlertas = { medicamento, alertas: {}, tomasGeneradasHoy: 0 };

  const service = {
    findAll: jest.fn().mockResolvedValue({
      items: [medicamento],
      meta: { page: 2, size: 5, totalItems: 6, totalPages: 2 },
    }),
    findOne: jest.fn().mockResolvedValue(conAlertas),
    create: jest.fn().mockResolvedValue(conAlertas),
    update: jest.fn().mockResolvedValue(conAlertas),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const resolver = new MedicamentosResolver(
    service as unknown as MedicamentosService,
  );
  const datos = { nombre: 'Glucophage' } as MedicamentoInput;

  it('medicamentos traduce los filtros y la página al lenguaje del dominio', async () => {
    const pagina = await resolver.medicamentos(FAMILY, {
      pagina: 2,
      tamano: 5,
      nombre: 'gluco',
      activo: true,
    });
    expect(service.findAll).toHaveBeenCalledWith(FAMILY, {
      page: 2,
      size: 5,
      nombre: 'gluco',
      activo: true,
    });
    expect(pagina).toEqual({
      items: [medicamento],
      pagina: 2,
      totalPaginas: 2,
      totalItems: 6,
    });
  });

  it('reutiliza MedicamentosService en el detalle y las mutaciones', async () => {
    await expect(resolver.medicamento(FAMILY, 'm1')).resolves.toBe(medicamento);
    expect(service.findOne).toHaveBeenCalledWith(FAMILY, 'm1');

    await expect(resolver.crearMedicamento(CAREGIVER, datos)).resolves.toBe(
      medicamento,
    );
    expect(service.create).toHaveBeenCalledWith(CAREGIVER, datos);

    await expect(
      resolver.actualizarMedicamento(CAREGIVER, 'm1', datos),
    ).resolves.toBe(medicamento);
    expect(service.update).toHaveBeenCalledWith(CAREGIVER, 'm1', datos);

    await expect(resolver.eliminarMedicamento(CAREGIVER, 'm1')).resolves.toBe(
      true,
    );
    expect(service.remove).toHaveBeenCalledWith(CAREGIVER, 'm1');
  });

  it('advertencias sale de la información de openFDA (o vacío)', () => {
    expect(resolver.advertencias(medicamento)).toEqual(['a1', 'a2']);
    expect(resolver.advertencias({ infoOpenfda: null } as Medicamento)).toEqual(
      [],
    );
  });
});
