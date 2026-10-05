import { NotFoundException } from '@nestjs/common';
import {
  CAREGIVER,
  createClockMock,
  createMockRepository,
  FAMILY,
  MockRepository,
} from '../common/testing/mocks';
import { PatientAccessService } from '../contactos/patient-access.service';
import { EstadoToma } from '../tomas/enums/estado-toma.enum';
import { Periodo } from './dto/reporte-query.dto';
import { PdfService } from './pdf.service';
import { ReportesService } from './reportes.service';

describe('ReportesService', () => {
  let tomas: MockRepository;
  let medicamentos: MockRepository;
  let usuarios: MockRepository;
  let access: { resolvePatientId: jest.Mock };
  let pdf: { generarReporteAdherencia: jest.Mock };
  let service: ReportesService;

  const registros = [
    {
      id: 't1',
      fecha: '2026-10-05',
      horaProgramada: '08:00:00',
      estado: EstadoToma.TOMADO,
      medicamentoId: 'm1',
      medicamento: { nombre: 'Glucophage', dosis: '850 mg' },
    },
    {
      id: 't2',
      fecha: '2026-10-05',
      horaProgramada: '20:00:00',
      estado: EstadoToma.OMITIDO,
      medicamentoId: 'm1',
      medicamento: { nombre: 'Glucophage', dosis: '850 mg' },
    },
  ];

  beforeEach(() => {
    tomas = createMockRepository();
    medicamentos = createMockRepository();
    usuarios = createMockRepository();
    access = { resolvePatientId: jest.fn().mockResolvedValue(CAREGIVER.id) };
    pdf = {
      generarReporteAdherencia: jest
        .fn()
        .mockResolvedValue(Buffer.from('%PDF')),
    };
    service = new ReportesService(
      tomas as never,
      medicamentos as never,
      usuarios as never,
      access as unknown as PatientAccessService,
      createClockMock('2026-10-05', '12:00:00'),
      pdf as unknown as PdfService,
    );
    tomas.find.mockResolvedValue(registros);
    usuarios.findOne.mockResolvedValue({
      id: CAREGIVER.id,
      nombre: 'María Gómez',
      email: CAREGIVER.email,
    });
  });

  it('calcula el rango de cada periodo', () => {
    expect(service.rango(Periodo.SEMANA)).toEqual({
      desde: '2026-09-29',
      hasta: '2026-10-05',
    });
    expect(service.rango(Periodo.TRIMESTRE).desde).toBe('2026-07-08');
  });

  it('adherencia devuelve el global y la serie diaria', async () => {
    const result = await service.adherencia(FAMILY, {
      periodo: Periodo.SEMANA,
    });
    expect(result).toMatchObject({
      pacienteId: CAREGIVER.id,
      periodo: '7d',
      total: 2,
      adherencia: 50,
    });
    expect(result.serie).toHaveLength(7);
  });

  it('porMedicamento y patrones usan las tomas del periodo', async () => {
    const porMed = await service.porMedicamento(FAMILY, {
      periodo: Periodo.MES,
    });
    expect(porMed.medicamentos[0]).toMatchObject({
      nombre: 'Glucophage',
      adherencia: 50,
    });
    const patrones = await service.patrones(FAMILY, { periodo: Periodo.MES });
    expect(patrones).toMatchObject({ totalOmitidas: 1, peorHora: 20 });
  });

  it('historial aplica filtros y paginación', async () => {
    tomas.findAndCount.mockResolvedValue([registros, 2]);
    const result = await service.historial(FAMILY, {
      page: 1,
      size: 10,
      fechaInicio: '2026-10-01',
      fechaFin: '2026-10-05',
      medicamentoId: 'm1',
      estado: EstadoToma.OMITIDO,
    });
    expect(result.meta.totalItems).toBe(2);
    const where = tomas.findAndCount.mock.calls[0][0].where as Record<
      string,
      unknown
    >;
    expect(where).toMatchObject({
      medicamentoId: 'm1',
      estado: EstadoToma.OMITIDO,
    });

    await service.historial(FAMILY, {
      page: 1,
      size: 10,
      fechaInicio: '2026-10-01',
    });
    await service.historial(FAMILY, {
      page: 1,
      size: 10,
      fechaFin: '2026-10-05',
    });
    await service.historial(FAMILY, { page: 1, size: 10 });
    expect(tomas.findAndCount.mock.calls[3][0].where).toEqual({
      pacienteId: CAREGIVER.id,
    });
  });

  it('resumen arma el dashboard con próxima toma y alertas', async () => {
    tomas.find
      .mockResolvedValueOnce([
        { estado: EstadoToma.TOMADO },
        { estado: EstadoToma.PENDIENTE },
      ])
      .mockResolvedValueOnce(registros)
      .mockResolvedValueOnce([
        { ...registros[1], medicamento: { nombre: 'Glucophage' } },
      ]);
    tomas.findOne.mockResolvedValue({ id: 't3', horaProgramada: '20:00:00' });
    medicamentos.count.mockResolvedValue(3);
    medicamentos.find.mockResolvedValue([
      { id: 'm2', nombre: 'Omeprazol', fechaFin: '2026-10-10' },
    ]);

    const result = await service.resumen(FAMILY);
    expect(result).toMatchObject({
      paciente: { id: CAREGIVER.id, nombre: 'María Gómez' },
      fecha: '2026-10-05',
      hoy: { total: 2, tomadas: 1, pendientes: 1 },
      adherencia7d: 50,
      medicamentosActivos: 3,
      proximaToma: { id: 't3' },
    });
    expect(result.alertas).toEqual([
      expect.objectContaining({
        tipo: 'DOSIS_OMITIDA',
        mensaje: 'Dosis omitida de Glucophage (2026-10-05 20:00)',
      }),
      expect.objectContaining({ tipo: 'TRATAMIENTO_POR_FINALIZAR' }),
    ]);
  });

  it('resumen lanza 404 si el paciente no existe', async () => {
    usuarios.findOne.mockResolvedValue(null);
    await expect(service.resumen(FAMILY)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('exportarPdf genera el documento con nombre de archivo', async () => {
    const result = await service.exportarPdf(CAREGIVER, {
      periodo: Periodo.MES,
    });
    expect(result.filename).toBe('mediplan-reporte-2026-09-06_2026-10-05.pdf');
    expect(result.buffer.toString()).toBe('%PDF');
    expect(pdf.generarReporteAdherencia).toHaveBeenCalledWith(
      expect.objectContaining({
        paciente: { nombre: 'María Gómez', email: CAREGIVER.email },
        historial: [registros[1], registros[0]],
      }),
    );
  });
});
