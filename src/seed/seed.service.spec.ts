import { Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { createClockMock, createConfigMock } from '../common/testing/mocks';
import { RegistroToma } from '../tomas/entities/registro-toma.entity';
import { EstadoToma } from '../tomas/enums/estado-toma.enum';
import { UsersService } from '../users/users.service';
import {
  DEMO_2FA_SECRET,
  prng,
  SEED_MEDICAMENTOS,
  SEED_USUARIOS,
} from './seed-data';
import { SeedService } from './seed.service';

describe('SeedService', () => {
  let manager: { query: jest.Mock; create: jest.Mock; save: jest.Mock };
  let service: SeedService;
  let seq = 0;

  const withId = (e: Record<string, unknown>) => ({ id: `id-${++seq}`, ...e });

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    seq = 0;
    manager = {
      query: jest.fn(),
      create: jest.fn(
        (_entity: unknown, data: Record<string, unknown>) => data,
      ),
      save: jest.fn((data: unknown) =>
        Promise.resolve(
          Array.isArray(data)
            ? data.map((d: Record<string, unknown>) => withId(d))
            : withId(data as Record<string, unknown>),
        ),
      ),
    };
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
        cb(manager as unknown as EntityManager),
      ),
    };
    service = new SeedService(
      dataSource as unknown as DataSource,
      {
        hashPassword: jest.fn().mockResolvedValue('hash'),
      } as unknown as UsersService,
      createConfigMock({ ADMIN_EMAIL: 'admin@mediplan.com' }),
      createClockMock('2026-10-05', '12:00:00'),
    );
  });

  it('reinicia las tablas y carga los datos de demostración', async () => {
    const result = await service.run();

    expect(manager.query.mock.calls[0][0]).toContain('TRUNCATE TABLE');
    expect(result).toMatchObject({
      usuarios: SEED_USUARIOS.length + 1,
      medicamentos: SEED_MEDICAMENTOS.length,
      contactos: 3,
    });
    expect(result.tomas).toBeGreaterThan(100);
    expect(result.notificaciones).toBeGreaterThan(0);
    expect(result.credenciales[0]).toEqual({
      email: 'admin@mediplan.com',
      password: 'Admin123*',
      rol: Role.ADMIN,
      twoFactor: false,
    });
    expect(result.credenciales.find((c) => c.twoFactor)?.email).toBe(
      'cuidador2fa@mediplan.com',
    );
  });

  it('crea el usuario con 2FA usando el secreto de demostración', async () => {
    await service.run();
    const usuarios = manager.create.mock.calls
      .map((c) => c[1] as Record<string, unknown>)
      .filter((d) => 'passwordHash' in d);
    expect(usuarios.find((u) => u.twoFactorEnabled)).toMatchObject({
      email: 'cuidador2fa@mediplan.com',
      twoFactorSecret: DEMO_2FA_SECRET,
    });
  });

  it('las tomas futuras de hoy quedan PENDIENTES y las pasadas registradas', async () => {
    await service.run();
    const tomas = manager.create.mock.calls
      .map((c) => c[1] as Partial<RegistroToma>)
      .filter((d) => 'horaProgramada' in d);
    const hoyFuturas = tomas.filter(
      (t) => t.fecha === '2026-10-05' && t.horaProgramada! > '12:00:00',
    );
    expect(hoyFuturas.every((t) => t.estado === EstadoToma.PENDIENTE)).toBe(
      true,
    );
    const pasadas = tomas.filter((t) => t.fecha! < '2026-10-05');
    expect(pasadas.some((t) => t.estado === EstadoToma.OMITIDO)).toBe(true);
    expect(pasadas.every((t) => t.estado !== EstadoToma.PENDIENTE)).toBe(true);
  });

  it('prng es determinístico', () => {
    const a = prng(1);
    const b = prng(1);
    expect([a(), a()]).toEqual([b(), b()]);
  });
});
