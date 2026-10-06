import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Usuario } from '../users/entities/usuario.entity';
import { ContactoFamiliar } from './entities/contacto-familiar.entity';

export const ACCESS_DENIED_MESSAGE =
  'No tiene acceso a la información de este paciente';

/**
 * Control de acceso a nivel de datos (sección 17.2 del anteproyecto):
 * - ROLE_CAREGIVER: solo accede a su propio paciente (él mismo).
 * - ROLE_FAMILY: solo a los pacientes donde está registrado como contacto.
 * - ROLE_ADMIN: puede consultar cualquier paciente (soporte).
 */
@Injectable()
export class PatientAccessService {
  constructor(
    @InjectRepository(ContactoFamiliar)
    private readonly contactos: Repository<ContactoFamiliar>,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
  ) {}

  /** Determina el paciente sobre el que opera una consulta de lectura. */
  async resolvePatientId(
    user: AuthenticatedUser,
    pacienteId?: string,
  ): Promise<string> {
    switch (user.rol) {
      case Role.CAREGIVER:
        if (pacienteId && pacienteId !== user.id) {
          throw new ForbiddenException(ACCESS_DENIED_MESSAGE);
        }
        return user.id;

      case Role.FAMILY: {
        if (pacienteId) {
          await this.assertCanRead(user, pacienteId);
          return pacienteId;
        }
        const vinculos = await this.contactos.find({
          where: { usuarioId: user.id },
          select: { id: true, pacienteId: true },
        });
        const pacientes = [...new Set(vinculos.map((v) => v.pacienteId))];
        if (pacientes.length === 0) {
          throw new ForbiddenException(
            'Su cuenta no está vinculada a ningún paciente',
          );
        }
        if (pacientes.length > 1) {
          throw new BadRequestException(
            'Está vinculado a varios pacientes: indique el parámetro pacienteId',
          );
        }
        return pacientes[0];
      }

      case Role.ADMIN: {
        if (!pacienteId) {
          throw new BadRequestException(
            'Como administrador debe indicar el parámetro pacienteId',
          );
        }
        const exists = await this.usuarios.exists({
          where: { id: pacienteId, rol: Role.CAREGIVER },
        });
        if (!exists) throw new NotFoundException('Paciente no encontrado');
        return pacienteId;
      }

      default:
        throw new ForbiddenException(ACCESS_DENIED_MESSAGE);
    }
  }

  /** Lanza 403 si el usuario no puede leer los datos del paciente. */
  async assertCanRead(
    user: AuthenticatedUser,
    pacienteId: string,
  ): Promise<void> {
    if (user.rol === Role.ADMIN || user.id === pacienteId) return;
    if (user.rol === Role.FAMILY) {
      const linked = await this.contactos.exists({
        where: { pacienteId, usuarioId: user.id },
      });
      if (linked) return;
    }
    throw new ForbiddenException(ACCESS_DENIED_MESSAGE);
  }

  /** Lanza 403 si el usuario no es el cuidador/paciente dueño del recurso. */
  assertOwner(user: AuthenticatedUser, pacienteId: string): void {
    if (user.rol !== Role.CAREGIVER || user.id !== pacienteId) {
      throw new ForbiddenException(ACCESS_DENIED_MESSAGE);
    }
  }
}
