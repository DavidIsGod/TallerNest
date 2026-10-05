import { EstadoToma } from '../tomas/enums/estado-toma.enum';
import { PdfService } from './pdf.service';
import {
  adherenciaPorMedicamento,
  contarEstados,
  patronesOmision,
  TomaReporte,
} from './report-calculator';

describe('PdfService', () => {
  const service = new PdfService();
  const base = {
    paciente: { nombre: 'María Gómez', email: 'maria@correo.com' },
    periodo: '30d',
    desde: '2026-09-06',
    hasta: '2026-10-05',
    generadoEn: '2026-10-05 12:00',
  };

  it('genera un PDF con gráfico y tablas (varias páginas)', async () => {
    const estados = [
      EstadoToma.TOMADO,
      EstadoToma.OMITIDO,
      EstadoToma.PENDIENTE,
    ];
    const tomas: TomaReporte[] = Array.from({ length: 120 }, (_, i) => ({
      fecha: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
      horaProgramada: `${String(i % 24).padStart(2, '0')}:00:00`,
      estado: estados[i % 3],
      medicamentoId: `m${i % 4}`,
      medicamento:
        i % 5 === 0 ? null : { nombre: `Med ${i % 4}`, dosis: '10 mg' },
    }));
    const porMedicamento = adherenciaPorMedicamento(tomas);
    porMedicamento.push({ ...porMedicamento[0], adherencia: null });
    porMedicamento.push({ ...porMedicamento[0], adherencia: 65 });
    porMedicamento.push({ ...porMedicamento[0], adherencia: 95 });
    const buffer = await service.generarReporteAdherencia({
      ...base,
      global: contarEstados(tomas),
      porMedicamento,
      patrones: patronesOmision(tomas),
      historial: tomas,
    });
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(3000);
  });

  it('genera un PDF válido sin datos', async () => {
    const buffer = await service.generarReporteAdherencia({
      ...base,
      global: contarEstados([]),
      porMedicamento: [],
      patrones: patronesOmision([]),
      historial: [],
    });
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
