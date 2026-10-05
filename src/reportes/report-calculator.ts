import {
  dayOfWeek,
  daysBetweenInclusive,
  hourOf,
} from '../common/utils/date.util';
import { EstadoToma } from '../tomas/enums/estado-toma.enum';

/**
 * Cálculos puros de los reportes de adherencia.
 * Adherencia (%) = (tomas TOMADO / total de tomas programadas) × 100
 */
export interface TomaReporte {
  fecha: string;
  horaProgramada: string;
  estado: EstadoToma;
  medicamentoId: string;
  medicamento?: { nombre: string; dosis: string } | null;
}

export interface ConteoEstados {
  total: number;
  tomadas: number;
  omitidas: number;
  pendientes: number;
  adherencia: number | null;
}

export interface PuntoSerie extends ConteoEstados {
  fecha: string;
}

export interface AdherenciaMedicamento extends ConteoEstados {
  medicamentoId: string;
  nombre: string;
  dosis: string;
  tasaOmision: number | null;
}

export interface CeldaPatron {
  total: number;
  omitidas: number;
  tasaOmision: number | null;
}

export interface PatronesOmision {
  totalOmitidas: number;
  /** heatmap[dia][hora] = número de omisiones (dia 0 = domingo). */
  heatmap: number[][];
  porDia: (CeldaPatron & { dia: number; nombre: string })[];
  porHora: (CeldaPatron & { hora: number })[];
  peorDia: string | null;
  peorHora: number | null;
}

export const DIAS_SEMANA = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export function porcentaje(parte: number, total: number): number | null {
  return total === 0 ? null : Math.round((parte / total) * 10000) / 100;
}

export function contarEstados(
  tomas: Pick<TomaReporte, 'estado'>[],
): ConteoEstados {
  let tomadas = 0;
  let omitidas = 0;
  let pendientes = 0;
  for (const t of tomas) {
    if (t.estado === EstadoToma.TOMADO) tomadas++;
    else if (t.estado === EstadoToma.OMITIDO) omitidas++;
    else pendientes++;
  }
  return {
    total: tomas.length,
    tomadas,
    omitidas,
    pendientes,
    adherencia: porcentaje(tomadas, tomas.length),
  };
}

export function adherenciaGlobal(
  tomas: TomaReporte[],
  desde: string,
  hasta: string,
): ConteoEstados & { serie: PuntoSerie[] } {
  const porFecha = agrupar(tomas, (t) => t.fecha);
  const serie = daysBetweenInclusive(desde, hasta).map((fecha) => ({
    fecha,
    ...contarEstados(porFecha.get(fecha) ?? []),
  }));
  return { ...contarEstados(tomas), serie };
}

export function adherenciaPorMedicamento(
  tomas: TomaReporte[],
): AdherenciaMedicamento[] {
  const grupos = agrupar(tomas, (t) => t.medicamentoId);
  return [...grupos.entries()]
    .map(([medicamentoId, lista]) => {
      const conteo = contarEstados(lista);
      return {
        medicamentoId,
        nombre: lista[0].medicamento?.nombre ?? 'Desconocido',
        dosis: lista[0].medicamento?.dosis ?? '',
        ...conteo,
        tasaOmision: porcentaje(conteo.omitidas, conteo.total),
      };
    })
    .sort((a, b) => (a.adherencia ?? 101) - (b.adherencia ?? 101));
}

export function patronesOmision(tomas: TomaReporte[]): PatronesOmision {
  const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const dias = Array.from({ length: 7 }, () => ({ total: 0, omitidas: 0 }));
  const horas = Array.from({ length: 24 }, () => ({ total: 0, omitidas: 0 }));
  let totalOmitidas = 0;

  for (const t of tomas) {
    const dia = dayOfWeek(t.fecha);
    const hora = hourOf(t.horaProgramada);
    dias[dia].total++;
    horas[hora].total++;
    if (t.estado === EstadoToma.OMITIDO) {
      heatmap[dia][hora]++;
      dias[dia].omitidas++;
      horas[hora].omitidas++;
      totalOmitidas++;
    }
  }

  const porDia = dias.map((c, dia) => ({
    dia,
    nombre: DIAS_SEMANA[dia],
    ...c,
    tasaOmision: porcentaje(c.omitidas, c.total),
  }));
  const porHora = horas
    .map((c, hora) => ({
      hora,
      ...c,
      tasaOmision: porcentaje(c.omitidas, c.total),
    }))
    .filter((c) => c.total > 0);

  const peor = <T extends CeldaPatron>(celdas: T[]) =>
    celdas
      .filter((c) => c.omitidas > 0)
      .sort((a, b) => (b.tasaOmision ?? 0) - (a.tasaOmision ?? 0))[0];

  return {
    totalOmitidas,
    heatmap,
    porDia,
    porHora,
    peorDia: peor(porDia)?.nombre ?? null,
    peorHora: peor(porHora)?.hora ?? null,
  };
}

function agrupar<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const lista = map.get(k);
    if (lista) lista.push(item);
    else map.set(k, [item]);
  }
  return map;
}
