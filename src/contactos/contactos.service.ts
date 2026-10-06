import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { definedOnly } from '../common/utils/object.util';
import { Usuario } from '../users/entities/usuario.entity';
import { CreateContactoDto } from './dto/create-contacto.dto';
import { UpdateContactoDto } from './dto/update-contacto.dto';
import { ContactoFamiliar } from './entities/contacto-familiar.entity';
import { PatientAccessService } from './patient-access.service';

export const MAX_CONTACTOS = 10;

export interface PacienteVinculado {
  pacienteId: string;
  nombre: string;
  email: string;
  relacion: string;
  esEmergencia: boolean;
}

@Injectable()
export class ContactosService {
  constructor(
    @InjectRepository(ContactoFamiliar)
    private readonly contactos: Repository<ContactoFamiliar>,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
    private readonly access: PatientAccessService,
  ) {}

  async create(
    user: AuthenticatedUser,
    dto: CreateContactoDto,
  ): Promise<ContactoFamiliar> {
    const pacienteId = user.id;
    const existentes = await this.contactos.find({ where: { pacienteId } });
    if (existentes.length >= MAX_CONTACTOS) {
      throw new ConflictException(
        `Un paciente puede tener máximo ${MAX_CONTACTOS} contactos`,
      );
    }

    const { usuarioEmail, ...data } = dto;
    const usuarioId = usuarioEmail
      ? await this.resolveFamilyUserId(usuarioEmail, pacienteId)
      : null;

    // Regla: si hay contactos, al menos uno debe ser de emergencia.
    const hayEmergencia = existentes.some((c) => c.esEmergencia);

    const contacto = this.contactos.create({
      ...definedOnly(data),
      email: data.email ?? null,
      pacienteId,
      usuarioId,
      esEmergencia: dto.esEmergencia ?? false,
      recibeNotificaciones: dto.recibeNotificaciones ?? true,
    });
    if (!hayEmergencia) contacto.esEmergencia = true;
    return this.contactos.save(contacto);
  }

  async findAll(
    user: AuthenticatedUser,
    pacienteId?: string,
  ): Promise<ContactoFamiliar[]> {
    const id = await this.access.resolvePatientId(user, pacienteId);
    return this.contactos.find({
      where: { pacienteId: id },
      order: { esEmergencia: 'DESC', nombre: 'ASC' },
    });
  }

  async findOne(
    user: AuthenticatedUser,
    id: string,
  ): Promise<ContactoFamiliar> {
    const contacto = await this.getOrFail(id);
    await this.access.assertCanRead(user, contacto.pacienteId);
    return contacto;
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateContactoDto,
  ): Promise<ContactoFamiliar> {
    const contacto = await this.getOwned(user, id);
    const { usuarioEmail, ...data } = dto;

    if (dto.esEmergencia === false && contacto.esEmergencia) {
      await this.ensureAnotherEmergencyExists(contacto);
    }
    if (usuarioEmail !== undefined) {
      contacto.usuarioId = await this.resolveFamilyUserId(
        usuarioEmail,
        contacto.pacienteId,
        contacto.id,
      );
    }
    Object.assign(contacto, definedOnly(data));
    return this.contactos.save(contacto);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const contacto = await this.getOwned(user, id);
    if (contacto.esEmergencia) {
      const otros = await this.contactos.count({
        where: { pacienteId: contacto.pacienteId, id: Not(contacto.id) },
      });
      if (otros > 0) await this.ensureAnotherEmergencyExists(contacto);
    }
    await this.contactos.remove(contacto);
  }

  async setNotificaciones(
    user: AuthenticatedUser,
    id: string,
    recibeNotificaciones: boolean,
  ): Promise<ContactoFamiliar> {
    const contacto = await this.getOwned(user, id);
    contacto.recibeNotificaciones = recibeNotificaciones;
    return this.contactos.save(contacto);
  }

  /** Pacientes a los que un familiar tiene acceso. */
  async misPacientes(user: AuthenticatedUser): Promise<PacienteVinculado[]> {
    const vinculos = await this.contactos.find({
      where: { usuarioId: user.id },
      relations: { paciente: true },
      order: { createdAt: 'ASC' },
    });
    return vinculos.map((v) => ({
      pacienteId: v.pacienteId,
      nombre: v.paciente.nombre,
      email: v.paciente.email,
      relacion: v.relacion,
      esEmergencia: v.esEmergencia,
    }));
  }

  /** Contactos que deben recibir alertas por dosis omitidas. */
  findNotificables(pacienteId: string): Promise<ContactoFamiliar[]> {
    return this.contactos.find({
      where: { pacienteId, recibeNotificaciones: true },
    });
  }

  // ---------------------------------------------------------------- helpers

  private async getOrFail(id: string): Promise<ContactoFamiliar> {
    const contacto = await this.contactos.findOne({ where: { id } });
    if (!contacto) throw new NotFoundException('Contacto no encontrado');
    return contacto;
  }

  private async getOwned(
    user: AuthenticatedUser,
    id: string,
  ): Promise<ContactoFamiliar> {
    const contacto = await this.getOrFail(id);
    this.access.assertOwner(user, contacto.pacienteId);
    return contacto;
  }

  private async ensureAnotherEmergencyExists(
    contacto: ContactoFamiliar,
  ): Promise<void> {
    const otraEmergencia = await this.contactos.exists({
      where: {
        pacienteId: contacto.pacienteId,
        esEmergencia: true,
        id: Not(contacto.id),
      },
    });
    if (!otraEmergencia) {
      throw new ConflictException(
        'Debe existir al menos un contacto de emergencia: marque otro contacto como emergencia primero',
      );
    }
  }

  private async resolveFamilyUserId(
    email: string,
    pacienteId: string,
    excludeContactoId?: string,
  ): Promise<string> {
    const usuario = await this.usuarios.findOne({ where: { email } });
    if (!usuario) {
      throw new NotFoundException(`No existe un usuario con email ${email}`);
    }
    if (usuario.rol !== Role.FAMILY) {
      throw new BadRequestException(
        'Solo se pueden vincular usuarios con rol ROLE_FAMILY',
      );
    }
    const yaVinculado = await this.contactos.exists({
      where: {
        pacienteId,
        usuarioId: usuario.id,
        ...(excludeContactoId ? { id: Not(excludeContactoId) } : {}),
      },
    });
    if (yaVinculado) {
      throw new ConflictException(
        'Ese usuario ya está vinculado como contacto de este paciente',
      );
    }
    return usuario.id;
  }
}
