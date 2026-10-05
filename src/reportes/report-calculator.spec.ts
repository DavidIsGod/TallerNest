import { EstadoToma } from '../tomas/enums/estado-toma.enum';
import {
  adherenciaGlobal,
  adherenciaPorMedicamento,
  contarEstados,
  patronesOmision,
  porcentaje,
  TomaReporte,
} from './report-calculator';

const t = (
  fecha: string,
  hora: string,
  estado: EstadoToma,
  medicamentoId = 'm1',
  nombre = 'Glucophage',
): TomaReporte => ({
  fecha,
  horaProgramada: hora,
  estado,
  medicamentoId,
  medicamento: { nombre, dosis: '850 mg' },
});

describe('report-calculator', () => {
  const tomas = [
    t('2026-10-04', '08:00:00', EstadoToma.TOMADO), // domingo
    t('2026-10-04', '21:00:00', EstadoToma.OMITIDO, 'm2', 'Lipitor'),
    t('2026-10-05', '08:00:00', EstadoToma.TOMADO), // lunes
    t('2026-10-05', '21:00:00', EstadoToma.OMITIDO, 'm2', 'Lipitor'),
    t('2026-10-05', '22:00:00', EstadoToma.PENDIENTE, 'm3', 'Eutirox'),
  ];

  it('porcentaje redondea a 2 decimales y devuelve null sin datos', () => {
    expect(porcentaje(2, 3)).toBe(66.67);
    expect(porcentaje(0, 0)).toBeNull();
  });

  it('contarEstados aplica la fórmula de adherencia', () => {
    expect(contarEstados(tomas)).toEqual({
      total: 5,
      tomadas: 2,
      omitidas: 2,
      pendientes: 1,
      adherencia: 40,
    });
  });

  it('adherenciaGlobal incluye una serie diaria con días sin tomas', () => {
    const result = adherenciaGlobal(tomas, '2026-10-03', '2026-10-05');
    expect(result.adherencia).toBe(40);
    expect(result.serie.map((p) => [p.fecha, p.total, p.adherencia])).toEqual([
      ['2026-10-03', 0, null],
      ['2026-10-04', 2, 50],
      ['2026-10-05', 3, 33.33],
    ]);
  });

  it('adherenciaPorMedicamento ordena de peor a mejor adherencia', () => {
    const result = adherenciaPorMedicamento([
      ...tomas,
      {
        ...t('2026-10-05', '09:00:00', EstadoToma.TOMADO, 'm4'),
        medicamento: null,
      },
    ]);
    expect(result.map((m) => [m.nombre, m.adherencia])).toEqual([
      ['Lipitor', 0],
      ['Eutirox', 0],
      ['Glucophage', 100],
      ['Desconocido', 100],
    ]);
    expect(result[0].tasaOmision).toBe(100);
  });

  it('adherenciaPorMedicamento ubica al final los medicamentos sin datos', () => {
    expect(adherenciaPorMedicamento([])).toEqual([]);
  });

  it('patronesOmision construye el heatmap día × hora', () => {
    const result = patronesOmision(tomas);
    expect(result.totalOmitidas).toBe(2);
    expect(result.heatmap[0][21]).toBe(1);
    expect(result.heatmap[1][21]).toBe(1);
    expect(result.porHora.map((h) => h.hora)).toEqual([8, 21, 22]);
    expect(result.peorHora).toBe(21);
    expect(result.peorDia).toBe('Domingo');
    expect(result.porDia[0]).toMatchObject({
      total: 2,
      omitidas: 1,
      tasaOmision: 50,
    });
  });

  it('patronesOmision sin omisiones no reporta peor día ni hora', () => {
    const result = patronesOmision([
      t('2026-10-05', '08:00:00', EstadoToma.TOMADO),
    ]);
    expect(result.peorDia).toBeNull();
    expect(result.peorHora).toBeNull();
  });
});
