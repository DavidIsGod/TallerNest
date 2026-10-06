import { ExecutionContext } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { toBoolean } from '../dto/boolean-query.transform';
import { paginate, skipFor } from '../dto/paginated.dto';
import { CAREGIVER } from '../testing/mocks';
import { currentUserFactory } from './current-user.decorator';
import { IsFecha } from './is-fecha.decorator';

class FechaDto {
  @IsFecha()
  fecha: string;
}

describe('decoradores y utilidades comunes', () => {
  it('CurrentUser extrae el usuario del request', () => {
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: CAREGIVER }) }),
    } as unknown as ExecutionContext;
    expect(currentUserFactory(undefined, ctx)).toBe(CAREGIVER);
  });

  it('IsFecha acepta YYYY-MM-DD válidas y rechaza el resto', () => {
    const errores = (fecha: string) =>
      validateSync(plainToInstance(FechaDto, { fecha })).length;
    expect(errores('2026-10-05')).toBe(0);
    expect(errores('2026-13-40')).toBeGreaterThan(0);
    expect(errores('05/10/2026')).toBeGreaterThan(0);
  });

  it('toBoolean convierte strings de query a boolean', () => {
    const t = (value: unknown) =>
      toBoolean({ value } as Parameters<typeof toBoolean>[0]);
    expect(t('true')).toBe(true);
    expect(t(true)).toBe(true);
    expect(t('false')).toBe(false);
    expect(t(false)).toBe(false);
    expect(t('x')).toBe('x');
  });

  it('paginate calcula la metadata', () => {
    expect(paginate([1, 2], 12, 2, 5)).toEqual({
      items: [1, 2],
      meta: { page: 2, size: 5, totalItems: 12, totalPages: 3 },
    });
    expect(skipFor(3, 10)).toBe(20);
  });
});
