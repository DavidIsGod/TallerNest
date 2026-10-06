/**
 * Utilidades de fecha que trabajan con cadenas 'YYYY-MM-DD' y 'HH:mm:ss'
 * en una zona horaria concreta (por defecto America/Bogota), para que la
 * lógica de tomas no dependa de la zona horaria del servidor.
 */
export interface LocalDateTime {
  fecha: string;
  hora: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalDateTime(date: Date, timeZone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return {
    fecha: `${get('year')}-${get('month')}-${get('day')}`,
    hora: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
}

export function addDays(fecha: string, days: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sábado */
export function dayOfWeek(fecha: string): number {
  return new Date(`${fecha}T00:00:00Z`).getUTCDay();
}

export function daysBetweenInclusive(desde: string, hasta: string): string[] {
  const days: string[] = [];
  for (let d = desde; d <= hasta; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Normaliza 'HH:mm' o 'HH:mm:ss' a 'HH:mm:ss'. */
export function normalizeTime(hora: string): string {
  return hora.length === 5 ? `${hora}:00` : hora;
}

/** Devuelve 'HH:mm'. */
export function shortTime(hora: string): string {
  return hora.slice(0, 5);
}

export function hourOf(hora: string): number {
  return Number(hora.slice(0, 2));
}

export function formatHours(totalMinutes: number): string {
  return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
}
