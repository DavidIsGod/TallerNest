import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Not, Repository } from 'typeorm';
import { Paginated, paginate, skipFor } from '../common/dto/paginated.dto';
import { definedOnly } from '../common/utils/object.util';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { PatientAccessService } from '../contactos/patient-access.service';
import { AlertaInteraccion, OpenFdaService } from '../openfda/openfda.service';
import { TomasService } from '../tomas/tomas.service';
import { CreateMedicamentoDto } from './dto/create-medicamento.dto';
import { MedicamentoQueryDto } from './dto/medicamento-query.dto';
import { UpdateMedicamentoDto } from './dto/update-medicamento.dto';
import { Medicamento } from './entities/medicamento.entity';

export interface AlertasMedicamento {
  /** Advertencias de openFDA que se muestran al usuario. */
  advertencias: string[];
  /** Interacciones conocidas con otros medicamentos activos del paciente. */
  interacciones: AlertaInteraccion[];
  /** Aviso cuando openFDA no tiene información del principio activo. */
  mensaje?: string;
}

export interface MedicamentoConAlertas {
  medicamento: Medicamento;
  alertas: AlertasMedicamento;
  tomasGeneradasHoy: number;
}

@Injectable()
export class MedicamentosService {
  constructor(
    @InjectRepository(Medicamento)
    private readonly medicamentos: Repository<Medicamento>,
    private readonly openFda: OpenFdaService,
    private readonly access: PatientAccessService,
    private readonly tomas: TomasService,
  ) {}

  /**
   * Registra un medicamento para el paciente autenticado, consulta openFDA
   * con el principio activo y cruza las interacciones con sus demás
   * medicamentos activos.
   */
  async create(
    user: AuthenticatedUser,
    dto: CreateMedicamentoDto,
  ): Promise<MedicamentoConAlertas> {
    this.validarFechas(dto.fechaInicio, dto.fechaFin ?? null);
    const infoOpenfda = await this.openFda.consultar(dto.principioActivo);
    const medicamento = await this.medicamentos.save(
      this.medicamentos.create({
        ...definedOnly(dto),
        horarios: this.ordenarHorarios(dto.horarios),
        fechaFin: dto.fechaFin ?? null,
        instrucciones: dto.instrucciones ?? null,
        infoOpenfda,
        pacienteId: user.id,
        activo: true,
      }),
    );
    const tomasGeneradasHoy =
      await this.tomas.generarTomasRestantesDeHoy(medicamento);
    return {
      medicamento,
      alertas: await this.construirAlertas(medicamento),
      tomasGeneradasHoy,
    };
  }

  async findAll(
    user: AuthenticatedUser,
    query: MedicamentoQueryDto,
  ): Promise<Paginated<Medicamento>> {
    const pacienteId = await this.access.resolvePatientId(
      user,
      query.pacienteId,
    );
    const base: FindOptionsWhere<Medicamento> = { pacienteId };
    if (query.activo !== undefined) base.activo = query.activo;
    const where = query.nombre
      ? [
          { ...base, nombre: ILike(`%${query.nombre}%`) },
          { ...base, principioActivo: ILike(`%${query.nombre}%`) },
        ]
      : base;
    const [items, total] = await this.medicamentos.findAndCount({
      where,
      order: { activo: 'DESC', nombre: 'ASC' },
      skip: skipFor(query.page, query.size),
      take: query.size,
    });
    return paginate(items, total, query.page, query.size);
  }

  async findOne(
    user: AuthenticatedUser,
    id: string,
  ): Promise<MedicamentoConAlertas> {
    const medicamento = await this.getOrFail(id);
    await this.access.assertCanRead(user, medicamento.pacienteId);
    return {
      medicamento,
      alertas: await this.construirAlertas(medicamento),
      tomasGeneradasHoy: 0,
    };
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateMedicamentoDto,
  ): Promise<MedicamentoConAlertas> {
    const medicamento = await this.getOwned(user, id);
    const fechaInicio = dto.fechaInicio ?? medicamento.fechaInicio;
    const fechaFin =
      dto.fechaFin !== undefined ? dto.fechaFin : medicamento.fechaFin;
    this.validarFechas(fechaInicio, fechaFin);

    const cambioPrincipio =
      dto.principioActivo !== undefined &&
      dto.principioActivo !== medicamento.principioActivo;

    Object.assign(medicamento, {
      ...definedOnly(dto),
      fechaInicio,
      fechaFin,
      horarios: dto.horarios
        ? this.ordenarHorarios(dto.horarios)
        : medicamento.horarios,
    });
    if (cambioPrincipio) {
      medicamento.infoOpenfda = await this.openFda.consultar(
        medicamento.principioActivo,
      );
    }
    const saved = await this.medicamentos.save(medicamento);
    const tomasGeneradasHoy =
      await this.tomas.generarTomasRestantesDeHoy(saved);
    return {
      medicamento: saved,
      alertas: await this.construirAlertas(saved),
      tomasGeneradasHoy,
    };
  }

  /** Activa o desactiva el medicamento. */
  async toggle(user: AuthenticatedUser, id: string): Promise<Medicamento> {
    const medicamento = await this.getOwned(user, id);
    medicamento.activo = !medicamento.activo;
    const saved = await this.medicamentos.save(medicamento);
    if (saved.activo) await this.tomas.generarTomasRestantesDeHoy(saved);
    return saved;
  }

  /** Soft delete: marca activo=false y preserva el historial de tomas. */
  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const medicamento = await this.getOwned(user, id);
    medicamento.activo = false;
    await this.medicamentos.save(medicamento);
  }

  // ---------------------------------------------------------------- helpers

  private async construirAlertas(
    medicamento: Medicamento,
  ): Promise<AlertasMedicamento> {
    const info = medicamento.infoOpenfda;
    const otros = await this.medicamentos.find({
      where: {
        pacienteId: medicamento.pacienteId,
        activo: true,
        id: Not(medicamento.id),
      },
      select: { id: true, nombre: true, principioActivo: true },
    });
    return {
      advertencias: info?.advertencias.slice(0, 3) ?? [],
      interacciones: this.openFda.detectarInteracciones(info, otros),
      ...(info && !info.encontrado && info.mensaje
        ? { mensaje: info.mensaje }
        : {}),
    };
  }

  private async getOrFail(id: string): Promise<Medicamento> {
    const medicamento = await this.medicamentos.findOne({ where: { id } });
    if (!medicamento) throw new NotFoundException('Medicamento no encontrado');
    return medicamento;
  }

  private async getOwned(
    user: AuthenticatedUser,
    id: string,
  ): Promise<Medicamento> {
    const medicamento = await this.getOrFail(id);
    this.access.assertOwner(user, medicamento.pacienteId);
    return medicamento;
  }

  private validarFechas(fechaInicio: string, fechaFin: string | null): void {
    if (fechaFin && fechaFin < fechaInicio) {
      throw new BadRequestException(
        'La fecha de fin no puede ser anterior a la fecha de inicio',
      );
    }
  }

  private ordenarHorarios(horarios: string[]): string[] {
    return [...horarios].sort();
  }
}
