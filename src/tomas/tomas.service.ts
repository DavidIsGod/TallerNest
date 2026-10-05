import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsSelect,
  FindOptionsWhere,
  In,
  IsNull,
  LessThan,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Paginated, paginate, skipFor } from '../common/dto/paginated.dto';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ClockService } from '../common/services/clock.service';
import { normalizeTime, shortTime } from '../common/utils/date.util';
import { PatientAccessService } from '../contactos/patient-access.service';
import { Medicamento } from '../medicamentos/entities/medicamento.entity';
import { TipoNotificacion } from '../notificaciones/enums';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import {
  ResumenTomasQueryDto,
  TomaQueryDto,
  TomasHoyQueryDto,
} from './dto/toma-query.dto';
import { UpdateTomaDto } from './dto/update-toma.dto';
import { RegistroToma } from './entities/registro-toma.entity';
import { EstadoToma } from './enums/estado-toma.enum';

/** Campos de la toma + resumen del medicamento (sin la info de openFDA). */
export const TOMA_SELECT: FindOptionsSelect<RegistroToma> = {
  id: true,
  medicamentoId: true,
  pacienteId: true,
  fecha: true,
  horaProgramada: true,
  horaReal: true,
  estado: true,
  notas: true,
  notificacionEnviada: true,
  omisionAutomatica: true,
  createdAt: true,
  updatedAt: true,
  medicamento: { id: true, nombre: true, dosis: true, principioActivo: true },
};

export interface ResumenTomas {
  fecha: string;
  total: number;
  pendientes: number;
  tomadas: number;
  omitidas: number;
  adherencia: number | null;
}

type NuevaToma = Pick<
  RegistroToma,
  'medicamentoId' | 'pacienteId' | 'fecha' | 'horaProgramada' | 'estado'
>;

const INSERT_CHUNK = 500;

@Injectable()
export class TomasService {
  private readonly logger = new Logger(TomasService.name);

  constructor(
    @InjectRepository(RegistroToma)
    private readonly tomas: Repository<RegistroToma>,
    @InjectRepository(Medicamento)
    private readonly medicamentos: Repository<Medicamento>,
    private readonly access: PatientAccessService,
    private readonly notificaciones: NotificacionesService,
    private readonly clock: ClockService,
    private readonly config: ConfigService,
  ) {}

  // ------------------------------------------------------------ consultas

  async findAll(
    user: AuthenticatedUser,
    query: TomaQueryDto,
  ): Promise<Paginated<RegistroToma>> {
    const pacienteId = await this.access.resolvePatientId(
      user,
      query.pacienteId,
    );
    const where: FindOptionsWhere<RegistroToma> = { pacienteId };
    if (query.estado) where.estado = query.estado;
    if (query.medicamentoId) where.medicamentoId = query.medicamentoId;
    if (query.fecha) {
      where.fecha = query.fecha;
    } else if (query.desde && query.hasta) {
      if (query.desde > query.hasta) {
        throw new BadRequestException(
          '"desde" no puede ser posterior a "hasta"',
        );
      }
      where.fecha = Between(query.desde, query.hasta);
    } else if (query.desde) {
      where.fecha = MoreThanOrEqual(query.desde);
    } else if (query.hasta) {
      where.fecha = LessThanOrEqual(query.hasta);
    }

    const [items, total] = await this.tomas.findAndCount({
      where,
      select: TOMA_SELECT,
      relations: { medicamento: true },
      order: { fecha: 'DESC', horaProgramada: 'ASC' },
      skip: skipFor(query.page, query.size),
      take: query.size,
    });
    return paginate(items, total, query.page, query.size);
  }

  async findHoy(
    user: AuthenticatedUser,
    query: TomasHoyQueryDto,
  ): Promise<RegistroToma[]> {
    const pacienteId = await this.access.resolvePatientId(
      user,
      query.pacienteId,
    );
    return this.tomas.find({
      where: {
        pacienteId,
        fecha: this.clock.today(),
        ...(query.estado ? { estado: query.estado } : {}),
      },
      select: TOMA_SELECT,
      relations: { medicamento: true },
      order: { horaProgramada: 'ASC' },
    });
  }

  async resumen(
    user: AuthenticatedUser,
    query: ResumenTomasQueryDto,
  ): Promise<ResumenTomas> {
    const pacienteId = await this.access.resolvePatientId(
      user,
      query.pacienteId,
    );
    const fecha = query.fecha ?? this.clock.today();
    const tomas = await this.tomas.find({
      where: { pacienteId, fecha },
      select: { id: true, estado: true },
    });
    return TomasService.contar(fecha, tomas);
  }

  async findOne(user: AuthenticatedUser, id: string): Promise<RegistroToma> {
    const toma = await this.tomas.findOne({
      where: { id },
      select: TOMA_SELECT,
      relations: { medicamento: true },
    });
    if (!toma) throw new NotFoundException('Registro de toma no encontrado');
    await this.access.assertCanRead(user, toma.pacienteId);
    return toma;
  }

  // ------------------------------------------------------- marcar una toma

  /**
   * Marca una toma como TOMADO u OMITIDO.
   * - TOMADO registra hora_real con el timestamp del servidor. Se permite
   *   registrar tarde una toma que estaba OMITIDA (corrección).
   * - OMITIDO (manual) dispara la notificación a los familiares.
   * - Una toma TOMADA no se puede revertir; las tomas no se eliminan.
   */
  async actualizarEstado(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateTomaDto,
  ): Promise<RegistroToma> {
    const toma = await this.tomas.findOne({
      where: { id },
      relations: { medicamento: true, paciente: true },
    });
    if (!toma) throw new NotFoundException('Registro de toma no encontrado');
    this.access.assertOwner(user, toma.pacienteId);

    if (toma.fecha > this.clock.today()) {
      throw new BadRequestException(
        'No se puede registrar una toma programada para una fecha futura',
      );
    }
    if (toma.estado === EstadoToma.TOMADO) {
      throw new ConflictException('La toma ya fue registrada como TOMADO');
    }
    if (toma.estado === dto.estado) {
      throw new ConflictException(`La toma ya está en estado ${dto.estado}`);
    }

    toma.estado = dto.estado;
    if (dto.notas !== undefined) toma.notas = dto.notas;
    if (dto.estado === EstadoToma.TOMADO) {
      toma.horaReal = this.clock.now();
    } else {
      toma.horaReal = null;
      toma.omisionAutomatica = false;
    }
    await this.tomas.save(toma);

    if (dto.estado === EstadoToma.OMITIDO) {
      await this.notificarOmision(toma);
    }
    return this.findOne(user, id);
  }

  // ------------------------------------------------- procesos automáticos

  /** Genera los registros PENDIENTE de todos los medicamentos activos. */
  async generarTomasDelDia(
    fecha: string = this.clock.today(),
  ): Promise<number> {
    const base = { activo: true, fechaInicio: LessThanOrEqual(fecha) };
    const meds = await this.medicamentos.find({
      where: [
        { ...base, fechaFin: IsNull() },
        { ...base, fechaFin: MoreThanOrEqual(fecha) },
      ],
      select: { id: true, pacienteId: true, horarios: true },
    });
    const filas = meds.flatMap((m) => this.filasPara(m, fecha, m.horarios));
    const creadas = await this.insertarSinDuplicados(filas);
    this.logger.log(`Tomas generadas para ${fecha}: ${creadas}`);
    return creadas;
  }

  /**
   * Al crear/actualizar/activar un medicamento genera las tomas que aún
   * faltan hoy (horarios posteriores a la hora actual).
   */
  async generarTomasRestantesDeHoy(med: Medicamento): Promise<number> {
    const { fecha, hora } = this.clock.local();
    if (
      !med.activo ||
      med.fechaInicio > fecha ||
      (med.fechaFin !== null && med.fechaFin < fecha)
    ) {
      return 0;
    }
    const restantes = med.horarios.filter((h) => normalizeTime(h) > hora);
    return this.insertarSinDuplicados(this.filasPara(med, fecha, restantes));
  }

  /** Desactiva los medicamentos cuyo tratamiento ya terminó. */
  async finalizarTratamientosVencidos(): Promise<number> {
    const result = await this.medicamentos.update(
      { activo: true, fechaFin: LessThan(this.clock.today()) },
      { activo: false },
    );
    return result.affected ?? 0;
  }

  /**
   * Marca como OMITIDO toda toma PENDIENTE cuya hora programada pasó hace
   * más de OMISION_HORAS (2 h por defecto) y notifica a los familiares.
   */
  async detectarOmisiones(): Promise<{
    omitidas: number;
    notificaciones: number;
  }> {
    const horas = Number(this.config.get<number>('OMISION_HORAS') ?? 2);
    const limite = this.clock.local(
      new Date(this.clock.now().getTime() - horas * 3_600_000),
    );
    const vencidas = await this.tomas.find({
      where: [
        { estado: EstadoToma.PENDIENTE, fecha: LessThan(limite.fecha) },
        {
          estado: EstadoToma.PENDIENTE,
          fecha: limite.fecha,
          horaProgramada: LessThanOrEqual(limite.hora),
        },
      ],
      relations: { medicamento: true, paciente: true },
      order: { fecha: 'ASC', horaProgramada: 'ASC' },
      take: 1000,
    });
    if (vencidas.length === 0) return { omitidas: 0, notificaciones: 0 };

    await this.tomas.update(
      { id: In(vencidas.map((t) => t.id)) },
      { estado: EstadoToma.OMITIDO, omisionAutomatica: true },
    );
    for (const toma of vencidas) {
      toma.estado = EstadoToma.OMITIDO;
      toma.omisionAutomatica = true;
    }

    let notificaciones = 0;
    for (const toma of vencidas) {
      notificaciones += await this.notificarOmision(toma);
    }
    this.logger.log(
      `Omisiones detectadas: ${vencidas.length}, notificaciones: ${notificaciones}`,
    );
    return { omitidas: vencidas.length, notificaciones };
  }

  /** Envía a cada familiar el resumen de adherencia del día. */
  async enviarResumenesDiarios(
    fecha: string = this.clock.today(),
  ): Promise<{ pacientes: number; notificaciones: number }> {
    const tomas = await this.tomas.find({
      where: { fecha },
      relations: { paciente: true },
      select: {
        id: true,
        estado: true,
        pacienteId: true,
        paciente: { id: true, nombre: true },
      },
    });
    const porPaciente = new Map<string, RegistroToma[]>();
    for (const t of tomas) {
      porPaciente.set(t.pacienteId, [
        ...(porPaciente.get(t.pacienteId) ?? []),
        t,
      ]);
    }

    let notificaciones = 0;
    for (const [pacienteId, lista] of porPaciente) {
      const r = TomasService.contar(fecha, lista);
      const mensaje = `Resumen MediPlan: ${lista[0].paciente.nombre} tomó ${r.tomadas} de ${r.total} dosis programadas hoy (${Math.round(r.adherencia ?? 0)}% adherencia).`;
      const enviadas = await this.notificaciones.notificarContactos(
        pacienteId,
        mensaje,
        TipoNotificacion.RESUMEN_DIARIO,
      );
      notificaciones += enviadas.length;
    }
    return { pacientes: porPaciente.size, notificaciones };
  }

  // ---------------------------------------------------------------- helpers

  static contar(
    fecha: string,
    tomas: Pick<RegistroToma, 'estado'>[],
  ): ResumenTomas {
    const count = (estado: EstadoToma) =>
      tomas.filter((t) => t.estado === estado).length;
    const total = tomas.length;
    const tomadas = count(EstadoToma.TOMADO);
    return {
      fecha,
      total,
      pendientes: count(EstadoToma.PENDIENTE),
      tomadas,
      omitidas: count(EstadoToma.OMITIDO),
      adherencia: total ? Math.round((tomadas / total) * 10000) / 100 : null,
    };
  }

  private async notificarOmision(toma: RegistroToma): Promise<number> {
    if (toma.notificacionEnviada) return 0;
    const mensaje = `Alerta MediPlan: ${toma.paciente.nombre} no ha tomado su dosis de ${toma.medicamento.nombre} (${toma.medicamento.dosis}) programada para las ${shortTime(toma.horaProgramada)} del ${toma.fecha}. Por favor verifique.`;
    const enviadas = await this.notificaciones.notificarContactos(
      toma.pacienteId,
      mensaje,
      TipoNotificacion.DOSIS_OMITIDA,
      toma.id,
    );
    if (enviadas.length > 0) {
      await this.tomas.update(toma.id, { notificacionEnviada: true });
      toma.notificacionEnviada = true;
    }
    return enviadas.length;
  }

  private filasPara(
    med: Pick<Medicamento, 'id' | 'pacienteId'>,
    fecha: string,
    horarios: string[],
  ): NuevaToma[] {
    return horarios.map((h) => ({
      medicamentoId: med.id,
      pacienteId: med.pacienteId,
      fecha,
      horaProgramada: normalizeTime(h),
      estado: EstadoToma.PENDIENTE,
    }));
  }

  /** INSERT ... ON CONFLICT DO NOTHING (idempotente). */
  private async insertarSinDuplicados(filas: NuevaToma[]): Promise<number> {
    let creadas = 0;
    for (let i = 0; i < filas.length; i += INSERT_CHUNK) {
      const result = await this.tomas
        .createQueryBuilder()
        .insert()
        .into(RegistroToma)
        .values(filas.slice(i, i + INSERT_CHUNK))
        .orIgnore()
        .returning(['id'])
        .execute();
      creadas += Array.isArray(result.raw) ? result.raw.length : 0;
    }
    return creadas;
  }
}
