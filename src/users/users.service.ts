import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { FindOptionsSelect, ILike, Repository } from 'typeorm';
import { Paginated, paginate, skipFor } from '../common/dto/paginated.dto';
import { Role } from '../common/enums/role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { Usuario } from './entities/usuario.entity';

/** Columnas del usuario incluyendo los secretos (password y 2FA). */
const SELECT_WITH_SECRETS: FindOptionsSelect<Usuario> = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  telefono: true,
  activo: true,
  ultimoLogin: true,
  twoFactorEnabled: true,
  twoFactorSecret: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
    private readonly config: ConfigService,
  ) {}

  async hashPassword(password: string): Promise<string> {
    const rounds = Number(this.config.get<number>('BCRYPT_ROUNDS') ?? 12);
    return bcrypt.hash(password, rounds);
  }

  async create(dto: CreateUserDto): Promise<Usuario> {
    const email = dto.email.toLowerCase();
    await this.ensureEmailAvailable(email);
    const usuario = this.usuarios.create({
      nombre: dto.nombre,
      email,
      rol: dto.rol,
      telefono: dto.telefono ?? null,
      passwordHash: await this.hashPassword(dto.password),
    });
    const saved = await this.usuarios.save(usuario);
    return this.findById(saved.id);
  }

  async findAll(query: UserQueryDto): Promise<Paginated<Usuario>> {
    const { page, size, rol, search } = query;
    const base = rol ? { rol } : {};
    const where = search
      ? [
          { ...base, nombre: ILike(`%${search}%`) },
          { ...base, email: ILike(`%${search}%`) },
        ]
      : base;
    const [items, total] = await this.usuarios.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: skipFor(page, size),
      take: size,
    });
    return paginate(items, total, page, size);
  }

  async findById(id: string): Promise<Usuario> {
    const usuario = await this.usuarios.findOne({ where: { id } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return usuario;
  }

  findByEmail(email: string): Promise<Usuario | null> {
    return this.usuarios.findOne({ where: { email: email.toLowerCase() } });
  }

  /** Incluye passwordHash y twoFactorSecret: solo para uso interno. */
  findByEmailWithSecrets(email: string): Promise<Usuario | null> {
    return this.usuarios.findOne({
      where: { email: email.toLowerCase() },
      select: SELECT_WITH_SECRETS,
    });
  }

  /** Incluye passwordHash y twoFactorSecret: solo para uso interno. */
  async findByIdWithSecrets(id: string): Promise<Usuario> {
    const usuario = await this.usuarios.findOne({
      where: { id },
      select: SELECT_WITH_SECRETS,
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return usuario;
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<Usuario> {
    const usuario = await this.findById(id);
    if (dto.email && dto.email !== usuario.email) {
      await this.ensureEmailAvailable(dto.email);
      usuario.email = dto.email;
    }
    if (dto.nombre !== undefined) usuario.nombre = dto.nombre;
    if (dto.telefono !== undefined) usuario.telefono = dto.telefono;
    await this.usuarios.save(usuario);
    return this.findById(id);
  }

  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const usuario = await this.findByIdWithSecrets(id);
    const valid = await bcrypt.compare(currentPassword, usuario.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser diferente a la actual',
      );
    }
    await this.usuarios.update(id, {
      passwordHash: await this.hashPassword(newPassword),
    });
  }

  verifyPassword(usuario: Usuario, password: string): Promise<boolean> {
    return bcrypt.compare(password, usuario.passwordHash);
  }

  /** Mecanismo de administración de roles (solo ROLE_ADMIN). */
  async updateRole(id: string, rol: Role, adminId: string): Promise<Usuario> {
    if (id === adminId) {
      throw new BadRequestException(
        'Un administrador no puede cambiar su propio rol',
      );
    }
    const usuario = await this.findById(id);
    usuario.rol = rol;
    await this.usuarios.save(usuario);
    return usuario;
  }

  async updateStatus(
    id: string,
    activo: boolean,
    adminId: string,
  ): Promise<Usuario> {
    if (id === adminId) {
      throw new BadRequestException(
        'Un administrador no puede desactivar su propia cuenta',
      );
    }
    const usuario = await this.findById(id);
    usuario.activo = activo;
    await this.usuarios.save(usuario);
    return usuario;
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.usuarios.update(id, { ultimoLogin: new Date() });
  }

  async setTwoFactorSecret(id: string, secret: string | null): Promise<void> {
    await this.usuarios.update(id, { twoFactorSecret: secret });
  }

  async setTwoFactorEnabled(id: string, enabled: boolean): Promise<void> {
    await this.usuarios.update(
      id,
      enabled
        ? { twoFactorEnabled: true }
        : { twoFactorEnabled: false, twoFactorSecret: null },
    );
  }

  countByRole(rol: Role): Promise<number> {
    return this.usuarios.count({ where: { rol } });
  }

  private async ensureEmailAvailable(email: string): Promise<void> {
    const exists = await this.usuarios.exists({ where: { email } });
    if (exists) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }
  }
}
