import {
  addDays,
  dayOfWeek,
  daysBetweenInclusive,
  formatHours,
  hourOf,
  normalizeTime,
  shortTime,
  toLocalDateTime,
} from './date.util';
import { definedOnly } from './object.util';

describe('date.util', () => {
  it('convierte un instante a fecha/hora local de la zona indicada', () => {
    const instante = new Date('2026-10-06T03:30:15Z');
    expect(toLocalDateTime(instante, 'America/Bogota')).toEqual({
      fecha: '2026-10-05',
      hora: '22:30:15',
    });
    expect(toLocalDateTime(instante, 'UTC')).toEqual({
      fecha: '2026-10-06',
      hora: '03:30:15',
    });
  });

  it('suma días cruzando meses y años', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('calcula el día de la semana (0 = domingo)', () => {
    expect(dayOfWeek('2026-10-04')).toBe(0);
    expect(dayOfWeek('2026-10-05')).toBe(1);
  });

  it('lista los días de un rango inclusivo', () => {
    expect(daysBetweenInclusive('2026-09-29', '2026-10-01')).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
    ]);
    expect(daysBetweenInclusive('2026-10-02', '2026-10-01')).toEqual([]);
  });

  it('normaliza y formatea horas', () => {
    expect(normalizeTime('08:00')).toBe('08:00:00');
    expect(normalizeTime('08:00:30')).toBe('08:00:30');
    expect(shortTime('21:15:00')).toBe('21:15');
    expect(hourOf('21:15:00')).toBe(21);
    expect(formatHours(125)).toBe('02:05');
  });

  it('definedOnly elimina las propiedades undefined', () => {
    expect(definedOnly({ a: 1, b: undefined, c: null })).toEqual({
      a: 1,
      c: null,
    });
  });
});
