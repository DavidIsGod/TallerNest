import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Role } from '../common/enums/role.enum';
import {
  createConfigMock,
  createMockRepository,
  MockRepository,
} from '../common/testing/mocks';
import { Usuario } from './entities/usuario.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let repo: MockRepository;

  const usuario = (overrides: Partial<Usuario> = {}): Usuario =>
    ({
      id: 'u1',
      nombre: 'María',
      email: 'maria@correo.com',
      rol: Role.CAREGIVER,
      activo: true,
      ...overrides,
    }) as Usuario;

  beforeEach(async () => {
    repo = createMockRepository();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(Usuario), useValue: repo },
        {
          provide: ConfigService,
          useValue: createConfigMock({ BCRYPT_ROUNDS: 4 }),
        },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  describe('create', () => {
    it('crea el usuario con el email en minúsculas y la contraseña hasheada', async () => {
      repo.save.mockResolvedValue({ id: 'u1' });
      repo.findOne.mockResolvedValue(usuario());
      const result = await service.create({
        nombre: 'María',
        email: 'MARIA@correo.com',
        password: 'Secreta123',
        rol: Role.CAREGIVER,
      });
      const creado = repo.create.mock.calls[0][0] as Usuario;
      expect(creado.email).toBe('maria@correo.com');
      expect(creado.telefono).toBeNull();
      expect(await bcrypt.compare('Secreta123', creado.passwordHash)).toBe(
        true,
      );
      expect(result.id).toBe('u1');
    });

    it('lanza 409 si el email ya existe', async () => {
      repo.exists.mockResolvedValue(true);
      await expect(
        service.create({
          nombre: 'x',
          email: 'maria@correo.com',
          password: 'Secreta123',
          rol: Role.FAMILY,
          telefono: '+573001234567',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('findAll pagina y filtra por rol y búsqueda', async () => {
    repo.findAndCount.mockResolvedValue([[usuario()], 1]);
    const result = await service.findAll({
      page: 1,
      size: 10,
      rol: Role.CAREGIVER,
      search: 'mar',
    });
    expect(result.meta).toEqual({
      page: 1,
      size: 10,
      totalItems: 1,
      totalPages: 1,
    });
    const where = repo.findAndCount.mock.calls[0][0].where as unknown[];
    expect(where).toHaveLength(2);

    await service.findAll({ page: 2, size: 5 });
    expect(repo.findAndCount.mock.calls[1][0]).toMatchObject({
      where: {},
      skip: 5,
      take: 5,
    });
  });

  it('findById lanza 404 si no existe', async () => {
    await expect(service.findById('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('findByEmail y findByEmailWithSecrets normalizan el email', async () => {
    await service.findByEmail('A@B.COM');
    await service.findByEmailWithSecrets('A@B.COM');
    expect(repo.findOne.mock.calls[0][0]).toEqual({
      where: { email: 'a@b.com' },
    });
    expect(repo.findOne.mock.calls[1][0].select.passwordHash).toBe(true);
  });

  it('findByIdWithSecrets lanza 404 si no existe', async () => {
    await expect(service.findByIdWithSecrets('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('updateProfile', () => {
    it('actualiza nombre, teléfono y email validando duplicados', async () => {
      const actual = usuario();
      repo.findOne.mockResolvedValue(actual);
      await service.updateProfile('u1', {
        nombre: 'Nuevo',
        telefono: '+573000000000',
        email: 'nuevo@correo.com',
      });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          nombre: 'Nuevo',
          telefono: '+573000000000',
          email: 'nuevo@correo.com',
        }),
      );
    });

    it('no valida el email si no cambia', async () => {
      repo.findOne.mockResolvedValue(usuario());
      await service.updateProfile('u1', { email: 'maria@correo.com' });
      expect(repo.exists).not.toHaveBeenCalled();
    });

    it('lanza 409 si el nuevo email ya está en uso', async () => {
      repo.findOne.mockResolvedValue(usuario());
      repo.exists.mockResolvedValue(true);
      await expect(
        service.updateProfile('u1', { email: 'otro@correo.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('changePassword', () => {
    beforeEach(async () => {
      repo.findOne.mockResolvedValue(
        usuario({ passwordHash: await bcrypt.hash('Actual123', 4) }),
      );
    });

    it('actualiza el hash si la contraseña actual es correcta', async () => {
      await service.changePassword('u1', 'Actual123', 'Nueva1234');
      const { passwordHash } = repo.update.mock.calls[0][1] as Usuario;
      expect(await bcrypt.compare('Nueva1234', passwordHash)).toBe(true);
    });

    it('lanza 401 si la contraseña actual es incorrecta', async () => {
      await expect(
        service.changePassword('u1', 'Mala1234', 'Nueva1234'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lanza 400 si la nueva es igual a la actual', async () => {
      await expect(
        service.changePassword('u1', 'Actual123', 'Actual123'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('verifyPassword compara con bcrypt', async () => {
    const u = usuario({ passwordHash: await bcrypt.hash('Clave1234', 4) });
    await expect(service.verifyPassword(u, 'Clave1234')).resolves.toBe(true);
    await expect(service.verifyPassword(u, 'otra')).resolves.toBe(false);
  });

  describe('administración de roles y estado', () => {
    it('asigna un rol a otro usuario', async () => {
      repo.findOne.mockResolvedValue(usuario());
      const result = await service.updateRole('u1', Role.FAMILY, 'admin');
      expect(result.rol).toBe(Role.FAMILY);
    });

    it('impide que el admin cambie su propio rol', async () => {
      await expect(
        service.updateRole('admin', Role.FAMILY, 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('activa o desactiva a otro usuario', async () => {
      repo.findOne.mockResolvedValue(usuario());
      const result = await service.updateStatus('u1', false, 'admin');
      expect(result.activo).toBe(false);
    });

    it('impide que el admin se desactive a sí mismo', async () => {
      await expect(
        service.updateStatus('admin', false, 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('gestiona último login, secreto y estado 2FA', async () => {
    await service.touchLastLogin('u1');
    await service.setTwoFactorSecret('u1', 'SECRET');
    await service.setTwoFactorEnabled('u1', true);
    await service.setTwoFactorEnabled('u1', false);
    expect(repo.update).toHaveBeenNthCalledWith(2, 'u1', {
      twoFactorSecret: 'SECRET',
    });
    expect(repo.update).toHaveBeenNthCalledWith(3, 'u1', {
      twoFactorEnabled: true,
    });
    expect(repo.update).toHaveBeenNthCalledWith(4, 'u1', {
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });
  });

  it('cuenta usuarios por rol y usa 12 rondas por defecto', async () => {
    repo.count.mockResolvedValue(2);
    await expect(service.countByRole(Role.ADMIN)).resolves.toBe(2);
    const sinConfig = new UsersService(repo as never, createConfigMock());
    const hash = await sinConfig.hashPassword('x');
    expect(hash.startsWith('$2a$12$')).toBe(true);
  });
});
