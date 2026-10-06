import { ConfigService } from '@nestjs/config';
import { Role } from '../enums/role.enum';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { ClockService } from '../services/clock.service';

/** Utilidades compartidas por las pruebas unitarias (excluidas de cobertura). */
export type MockRepository = {
  find: jest.Mock;
  findOne: jest.Mock;
  findAndCount: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  exists: jest.Mock;
  count: jest.Mock;
  remove: jest.Mock;
  createQueryBuilder: jest.Mock;
};

export function createMockRepository(): MockRepository {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    create: jest.fn((entity: unknown) => entity),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    exists: jest.fn().mockResolvedValue(false),
    count: jest.fn().mockResolvedValue(0),
    remove: jest.fn((entity: unknown) => Promise.resolve(entity)),
    createQueryBuilder: jest.fn(),
  };
}

/** Query builder encadenable para INSERT ... ON CONFLICT DO NOTHING. */
export function createInsertQueryBuilder(raw: unknown[] = []) {
  const qb = {
    insert: jest.fn(),
    into: jest.fn(),
    values: jest.fn(),
    orIgnore: jest.fn(),
    returning: jest.fn(),
    execute: jest.fn().mockResolvedValue({ raw }),
  };
  qb.insert.mockReturnValue(qb);
  qb.into.mockReturnValue(qb);
  qb.values.mockReturnValue(qb);
  qb.orIgnore.mockReturnValue(qb);
  qb.returning.mockReturnValue(qb);
  return qb;
}

export function createConfigMock(
  values: Record<string, unknown> = {},
): ConfigService {
  const get = jest.fn((key: string, def?: unknown) =>
    key in values ? values[key] : def,
  );
  const getOrThrow = jest.fn((key: string) => {
    if (!(key in values)) throw new Error(`Missing ${key}`);
    return values[key];
  });
  return { get, getOrThrow } as unknown as ConfigService;
}

export function createClockMock(
  fecha = '2026-10-05',
  hora = '12:00:00',
  now = new Date(`${fecha}T${hora}-05:00`),
): jest.Mocked<ClockService> {
  return {
    timeZone: 'America/Bogota',
    now: jest.fn(() => now),
    today: jest.fn(() => fecha),
    local: jest.fn((date?: Date) =>
      date ? { fecha, hora: '10:00:00' } : { fecha, hora },
    ),
  } as unknown as jest.Mocked<ClockService>;
}

export const CAREGIVER: AuthenticatedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'cuidador@mediplan.com',
  nombre: 'María Gómez',
  rol: Role.CAREGIVER,
  sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

export const FAMILY: AuthenticatedUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'familiar@mediplan.com',
  nombre: 'Andrés Gómez',
  rol: Role.FAMILY,
  sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};

export const ADMIN: AuthenticatedUser = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'admin@mediplan.com',
  nombre: 'Admin',
  rol: Role.ADMIN,
  sessionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
};
